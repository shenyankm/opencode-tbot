import {
    logPromptLifecycle,
    type AppLogger,
} from "../infra/logger/index.js";
import type { OpenCodeSessionManager } from "../services/opencode/opencode.ports.js";

export interface WithExecutionSessionInput {
    chatId: number;
    isolate: boolean;
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
        if (!input.isolate) {
            return execute(input.sessionId);
        }

        const temporarySessionId = await this.createTemporaryImageSession(input.chatId, input.sessionId);

        try {
            return await execute(temporarySessionId);
        } finally {
            await this.cleanupTemporaryImageSession(
                input.chatId,
                input.sessionId,
                temporarySessionId,
            );
        }
    }

    private async createTemporaryImageSession(chatId: number, sessionId: string): Promise<string> {
        const temporarySession = await this.opencodeClient.forkSession(sessionId);

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
            const deleted = await this.opencodeClient.deleteSession(sessionId);

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
