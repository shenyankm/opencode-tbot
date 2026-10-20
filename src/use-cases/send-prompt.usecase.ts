import { abortable } from "../infra/utils/abort.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import {
    logOpenCodeRequest,
    logPromptLifecycle,
    type AppLogger,
} from "../infra/logger/index.js";
import type {
    PromptSessionFilePartInput,
} from "../services/opencode/opencode.client.js";
import type { OpenCodePromptGateway } from "../services/opencode/opencode.ports.js";
import {
    PromptContextResolver,
} from "./prompt-context.js";
import { TemporaryImageSessionManager } from "./temporary-image-session-manager.js";

export interface SendPromptInput {
    chatId: number;
    requestId?: string;
    files?: PromptSessionFilePartInput[];
    onInputReady?: (messageId: string) => void;
    onExecutionSession?: (sessionId: string) => void;
    signal?: AbortSignal;
    text?: string | null;
}

export interface SendPromptResult {
    assistantReply: Awaited<ReturnType<OpenCodePromptGateway["promptSession"]>>;
    projectId: string;
    sessionId: string;
}

export class SendPromptUseCase {
    private readonly promptContextResolver: PromptContextResolver;
    private readonly temporaryImageSessionManager: TemporaryImageSessionManager;

    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodePromptGateway,
        private readonly logger: AppLogger,
        promptContextResolver = new PromptContextResolver(sessionRepo, opencodeClient, logger),
        temporaryImageSessionManager = new TemporaryImageSessionManager(opencodeClient, logger),
    ) {
        this.promptContextResolver = promptContextResolver;
        this.temporaryImageSessionManager = temporaryImageSessionManager;
    }

    async execute(input: SendPromptInput): Promise<SendPromptResult> {
        input.signal?.throwIfAborted();
        const files = input.files ?? [];
        const context = await this.promptContextResolver.resolve({
            chatId: input.chatId,
            files,
            text: input.text,
            signal: input.signal,
        });
        const result = await this.temporaryImageSessionManager.withExecutionSession(
            {
                chatId: input.chatId,
                isolate: context.shouldIsolateImageTurn,
                signal: input.signal,
                sessionId: context.activeBinding.sessionId,
            },
            async (executionSessionId) => {
                input.signal?.throwIfAborted();
                input.onExecutionSession?.(executionSessionId);
                logOpenCodeRequest(this.logger, {
                    chatId: input.chatId,
                    requestId: input.requestId,
                    event: "opencode.prompt.submit",
                    projectId: context.activeBinding.projectId,
                    sessionId: executionSessionId,
                    fileCount: files.length,
                    status: "started",
                }, "submitting OpenCode prompt");

                const assistantReply = await abortable(this.opencodeClient.promptSession({
                    sessionId: executionSessionId,
                    prompt: context.promptText,
                    ...(input.onInputReady ? { onInputReady: input.onInputReady } : {}),
                    ...(files.length > 0 ? { files } : {}),
                    ...(context.selectedAgent ? { agent: context.selectedAgent.name } : {}),
                    ...(context.selectedAgent?.id ? { agentId: context.selectedAgent.id } : {}),
                    ...(context.model ? { model: context.model } : {}),
                    ...(input.signal ? { signal: input.signal } : {}),
                    ...(context.activeBinding.modelVariant ? { variant: context.activeBinding.modelVariant } : {}),
                }), input.signal);

                logPromptLifecycle(this.logger, {
                    chatId: input.chatId,
                    requestId: input.requestId,
                    event: "prompt.completed",
                    projectId: context.activeBinding.projectId,
                    sessionId: executionSessionId,
                    status: "completed",
                }, "prompt completed");

                return assistantReply;
            },
        );

        try {
            await this.sessionRepo.touch(input.chatId);
        } catch (error) {
            this.logger.warn({ error, chatId: input.chatId, sessionId: context.activeBinding.sessionId,
                requestId: input.requestId, event: "prompt.timestamp.save_failed" }, "answer completed but timestamp persistence failed");
        }

        return {
            assistantReply: result,
            sessionId: context.activeBinding.sessionId,
            projectId: context.activeBinding.projectId,
        };
    }
}
