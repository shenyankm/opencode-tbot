import { abortable } from "../infra/utils/abort.js";
import {
    logPromptLifecycle,
    type AppLogger,
} from "../infra/logger/index.js";
import type { OpenCodeSessionManager } from "../services/opencode/opencode.ports.js";

export interface WithExecutionSessionInput {
    chatId: number;
    isolate: boolean;
    signal?: AbortSignal;
    sessionId: string;
}

export class TemporaryImageSessionManager {
    constructor(
        private readonly opencodeClient: Pick<OpenCodeSessionManager, "deleteSession" | "forkSession">,
        private readonly logger: AppLogger,
    ) { }

    async withExecutionSession<TResult>(
        input: WithExecutionSessionInput,
        execute: (sessionId: string) => Promise<TResult>,
    ): Promise<TResult> {
        input.signal?.throwIfAborted();
        if (!input.isolate) {
            return execute(input.sessionId);
        }

        const pending = this.createTemporaryImageSession(input.chatId, input.sessionId, input.signal);
        // A remote fork may finish after local cancellation; it must still be cleaned up.
        void pending.then((id) => input.signal?.aborted
            ? this.cleanupTemporaryImageSession(input.chatId, input.sessionId, id) : undefined).catch(() => undefined);
        const temporarySessionId = await abortable(pending, input.signal);

        try {
            input.signal?.throwIfAborted();
            return await execute(temporarySessionId);
        } finally {
            await this.cleanupTemporaryImageSession(
                input.chatId,
                input.sessionId,
                temporarySessionId,
            );
        }
    }

    private async createTemporaryImageSession(chatId: number, sessionId: string, signal?: AbortSignal): Promise<string> {
        const temporarySession = await this.opencodeClient.forkSession(sessionId, undefined, signal);

        if (!temporarySession.id || temporarySession.id === sessionId) {
            throw new Error("OpenCode did not return a distinct temporary session for the image turn.");
        }

        logPromptLifecycle(
            this.logger,
            {
                chatId,
                event: "prompt.temporary_session.created",
                parentSessionId: sessionId,
                sessionId: temporarySession.id,
            },
            "created temporary image session",
        );

        return temporarySession.id;
    }

    private async cleanupTemporaryImageSession(
        chatId: number,
        parentSessionId: string,
        sessionId: string,
    ): Promise<void> {
        try {
            const signal = AbortSignal.timeout(5_000);
            const deleted = await abortable(this.opencodeClient.deleteSession(sessionId, signal), signal);

            if (!deleted) {
                this.logger.warn?.(
                    {
                        chatId,
                        event: "prompt.temporary_session.cleanup_failed",
                        parentSessionId,
                        sessionId,
                    },
                    "failed to delete temporary image session",
                );
            }
        } catch (error) {
            // shortcut: Failed deletes are logged for manual removal; add durable retries if orphans accumulate.
            this.logger.warn?.(
                {
                    error,
                    chatId,
                    event: "prompt.temporary_session.cleanup_failed",
                    parentSessionId,
                    sessionId,
                },
                "failed to delete temporary image session",
            );
        }
    }
}
