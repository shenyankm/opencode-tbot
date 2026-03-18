import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { Logger } from "pino";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpenCodeClientLike } from "../services/opencode/opencode.client.js";
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
        private readonly logger: Logger,
    ) { }

    async execute(input: { chatId: number; text: string }) {
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

        const result = await this.opencodeClient.promptSession({
            sessionId: activeBinding.sessionId,
            prompt: input.text,
            ...(selectedAgent ? { agent: selectedAgent.name } : {}),
            structured: true,
            ...(model ? { model } : {}),
            ...(activeBinding.modelVariant ? { variant: activeBinding.modelVariant } : {}),
        });

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
}
