import type { ChatSessionBinding } from "../domain/session/session.entity.js";
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
    type ActiveChatBinding,
} from "./prompt-context.js";
import { TemporaryImageSessionManager } from "./temporary-image-session-manager.js";

export interface SendPromptInput {
    chatId: number;
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
        const files = input.files ?? [];
        const context = await this.promptContextResolver.resolve({
            chatId: input.chatId,
            files,
            text: input.text,
        });
        const result = await this.temporaryImageSessionManager.withExecutionSession(
            {
                chatId: input.chatId,
                isolate: context.shouldIsolateImageTurn,
                sessionId: context.activeBinding.sessionId,
            },
            async (executionSessionId) => {
                input.onExecutionSession?.(executionSessionId);
                logOpenCodeRequest(this.logger, {
                    chatId: input.chatId,
                    event: "opencode.prompt.submit",
                    projectId: context.activeBinding.projectId,
                    sessionId: executionSessionId,
                    fileCount: files.length,
                    status: "started",
                }, "submitting OpenCode prompt");

                const assistantReply = await this.opencodeClient.promptSession({
                    sessionId: executionSessionId,
                    prompt: context.promptText,
                    ...(input.onInputReady ? { onInputReady: input.onInputReady } : {}),
                    ...(files.length > 0 ? { files } : {}),
                    ...(context.selectedAgent ? { agent: context.selectedAgent.name } : {}),
                    ...(context.selectedAgent?.id ? { agentId: context.selectedAgent.id } : {}),
                    ...(context.model ? { model: context.model } : {}),
                    ...(input.signal ? { signal: input.signal } : {}),
                    ...(context.activeBinding.modelVariant ? { variant: context.activeBinding.modelVariant } : {}),
                });

                logPromptLifecycle(this.logger, {
                    chatId: input.chatId,
                    event: "prompt.completed",
                    projectId: context.activeBinding.projectId,
                    sessionId: executionSessionId,
                    status: "completed",
                }, "prompt completed");

                return assistantReply;
            },
        );

        await this.sessionRepo.touch(input.chatId);

        return {
            assistantReply: result,
            sessionId: context.activeBinding.sessionId,
            projectId: context.activeBinding.projectId,
        };
    }
}
