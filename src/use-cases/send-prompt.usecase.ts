import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { AppLogger } from "../infra/logger/index.js";
import type {
    OpenCodeClientLike,
    PromptSessionFilePartInput,
} from "../services/opencode/opencode.client.js";
import { resolveSelectedAgent } from "./agent-selection.js";
import {
    clearStoredAgentSelection,
    clearStoredModelSelection,
    clearStoredModelVariant,
    clearStoredSessionContext,
} from "./binding-update.js";
import { createAndBindCurrentProjectSession } from "./session-creation.js";

type ActiveChatBinding = ChatSessionBinding & {
    directory: string;
    projectId: string;
    sessionId: string;
};

export class SendPromptUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
        private readonly logger: AppLogger,
    ) { }

    async execute(input: {
        chatId: number;
        files?: PromptSessionFilePartInput[];
        onExecutionSession?: (sessionId: string) => void;
        signal?: AbortSignal;
        text?: string | null;
    }) {
        const files = input.files ?? [];
        const promptText = buildPromptText(input.text, files);

        if (!promptText && files.length === 0) {
            throw new Error("Prompt requires text or file attachments.");
        }

        let binding = await this.sessionRepo.getByChatId(input.chatId);

        if (binding?.projectId && binding.directory) {
            const projects = await this.opencodeClient.listProjects();
            const selectedProject = projects.find((project) =>
                project.id === binding?.projectId && project.worktree === binding.directory,
            );

            if (!selectedProject) {
                binding = await this.clearInvalidSessionContext(
                    input.chatId,
                    binding,
                    "saved project is no longer available",
                );
            }
        }

        if (binding?.sessionId && binding.projectId) {
            const sessions = await this.opencodeClient.listSessions();
            const selectedSession = sessions.find((session) =>
                session.id === binding?.sessionId && session.projectID === binding.projectId,
            );

            if (!selectedSession) {
                binding = await this.clearInvalidSessionContext(
                    input.chatId,
                    binding,
                    "saved session is no longer available",
                );
            }
        }

        if (!binding || !binding.sessionId || !binding.projectId || !binding.directory) {
            const createdSession = await createAndBindCurrentProjectSession(
                this.sessionRepo,
                this.opencodeClient,
                {
                    chatId: input.chatId,
                    binding,
                },
            );
            binding = createdSession.binding;
            this.logger.info(
                {
                    chatId: input.chatId,
                    sessionId: createdSession.session.id,
                    projectId: createdSession.session.projectID,
                    directory: createdSession.session.directory,
                },
                "session created",
            );
        }

        if (binding?.modelProviderId && binding?.modelId) {
            const availableModels = await this.opencodeClient.listModels();
            const selectedModel = availableModels.find((model) =>
                model.providerID === binding?.modelProviderId && model.id === binding?.modelId,
            );

            if (!selectedModel) {
                binding = await clearStoredModelSelection(this.sessionRepo, binding);
                this.logger.warn?.(
                    {
                        chatId: input.chatId,
                    },
                    "selected model is no longer available, falling back to OpenCode default",
                );
            } else if (binding.modelVariant && !(binding.modelVariant in selectedModel.variants)) {
                binding = await clearStoredModelVariant(this.sessionRepo, binding);
                this.logger.warn?.(
                    {
                        chatId: input.chatId,
                        providerId: selectedModel.providerID,
                        modelId: selectedModel.id,
                    },
                    "selected model variant is no longer available, falling back to default variant",
                );
            }
        }

        if (!binding || !binding.sessionId || !binding.projectId) {
            throw new Error("Failed to initialize chat session.");
        }

        let activeBinding = binding as ActiveChatBinding;
        const shouldIsolateImageTurn = hasImageFiles(files);
        const model = activeBinding.modelProviderId && activeBinding.modelId
            ? {
                providerID: activeBinding.modelProviderId,
                modelID: activeBinding.modelId,
            }
            : null;
        const availableAgents = await this.opencodeClient.listAgents();
        const selectedAgent = resolveSelectedAgent(availableAgents, activeBinding.agentName);

        if (activeBinding.agentName && selectedAgent?.name !== activeBinding.agentName) {
            activeBinding = await clearStoredAgentSelection(this.sessionRepo, activeBinding) as ActiveChatBinding;
            this.logger.warn?.(
                {
                    chatId: input.chatId,
                },
                "selected agent is no longer available, falling back to OpenCode default",
            );
        }

        const temporarySessionId = shouldIsolateImageTurn
            ? await this.createTemporaryImageSession(input.chatId, activeBinding.sessionId)
            : null;
        const executionSessionId = temporarySessionId ?? activeBinding.sessionId;

        input.onExecutionSession?.(executionSessionId);
        let result;

        try {
            result = await this.opencodeClient.promptSession({
                sessionId: executionSessionId,
                prompt: promptText,
                ...(files.length > 0 ? { files } : {}),
                ...(selectedAgent ? { agent: selectedAgent.name } : {}),
                structured: true,
                ...(model ? { model } : {}),
                ...(input.signal ? { signal: input.signal } : {}),
                ...(activeBinding.modelVariant ? { variant: activeBinding.modelVariant } : {}),
            });
        } finally {
            if (temporarySessionId) {
                await this.cleanupTemporaryImageSession(
                    input.chatId,
                    activeBinding.sessionId,
                    temporarySessionId,
                );
            }
        }

        await this.sessionRepo.touch(input.chatId);

        return {
            assistantReply: result,
            sessionId: activeBinding.sessionId,
            projectId: activeBinding.projectId,
        };
    }

    private async clearInvalidSessionContext(
        chatId: number,
        binding: ChatSessionBinding,
        reason: string,
    ) {
        const nextBinding = await clearStoredSessionContext(this.sessionRepo, binding);
        this.logger.warn?.(
            {
                chatId,
            },
            `${reason}, falling back to the current OpenCode project`,
        );

        return nextBinding;
    }

    private async createTemporaryImageSession(chatId: number, sessionId: string): Promise<string> {
        const temporarySession = await this.opencodeClient.forkSession(sessionId);

        if (!temporarySession.id || temporarySession.id === sessionId) {
            throw new Error("OpenCode did not return a distinct temporary session for the image turn.");
        }

        this.logger.info?.(
            {
                chatId,
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
                    parentSessionId,
                    sessionId,
                },
                "failed to delete temporary image session",
            );
        }
    }
}

function buildPromptText(
    text: string | null | undefined,
    files: PromptSessionFilePartInput[],
): string {
    const trimmedText = text?.trim() ?? "";

    if (!files.some(isImageFile)) {
        return trimmedText;
    }

    const promptSections = [
        [
            "System note for this turn:",
            "The user attached one or more images in this message and you can inspect those images directly.",
            "Ignore any earlier statements in this conversation claiming that you could not view images or attachments, because those may have come from a previous model or an earlier limitation.",
            "If an image is blurry or unreadable, say that it is blurry or unreadable instead of saying that you cannot view images.",
        ].join(" "),
    ];

    if (trimmedText) {
        promptSections.push(trimmedText);
    }

    return promptSections.join("\n\n");
}

function isImageFile(file: PromptSessionFilePartInput): boolean {
    return file.mime.trim().toLowerCase().startsWith("image/");
}

function hasImageFiles(files: PromptSessionFilePartInput[]): boolean {
    return files.some(isImageFile);
}
