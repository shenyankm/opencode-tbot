import type { Logger } from "pino";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpenCodeClientLike } from "../services/opencode/opencode.client.js";
import { resolveSelectedAgent } from "./agent-selection.js";

export class SendPromptUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
        private readonly logger: Logger,
    ) { }

    async execute(input: { chatId: number; text: string }) {
        let binding = await this.sessionRepo.getByChatId(input.chatId);

        if (!binding || !binding.sessionId || !binding.projectId || !binding.directory) {
            const project = await this.opencodeClient.getCurrentProject();
            const session = await this.opencodeClient.createSessionForDirectory(project.worktree);

            binding = {
                chatId: input.chatId,
                sessionId: session.id,
                projectId: project.id,
                directory: project.worktree,
                agentName: binding?.agentName ?? null,
                modelProviderId: binding?.modelProviderId ?? null,
                modelId: binding?.modelId ?? null,
                modelVariant: binding?.modelVariant ?? null,
                language: binding?.language ?? null,
                updatedAt: new Date().toISOString(),
            };

            await this.sessionRepo.setCurrent(binding);
            this.logger.info(
                {
                    chatId: input.chatId,
                    sessionId: binding.sessionId,
                    projectId: binding.projectId,
                    directory: binding.directory,
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
                binding = {
                    ...binding,
                    modelProviderId: null,
                    modelId: null,
                    modelVariant: null,
                    updatedAt: new Date().toISOString(),
                };
                await this.sessionRepo.setCurrent(binding);
                this.logger.warn?.(
                    {
                        chatId: input.chatId,
                    },
                    "selected model is no longer available, falling back to OpenCode default",
                );
            } else if (binding.modelVariant && !(binding.modelVariant in selectedModel.variants)) {
                binding = {
                    ...binding,
                    modelVariant: null,
                    updatedAt: new Date().toISOString(),
                };
                await this.sessionRepo.setCurrent(binding);
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

        const model = binding.modelProviderId && binding.modelId
            ? {
                providerID: binding.modelProviderId,
                modelID: binding.modelId,
            }
            : null;
        const selectedAgent = binding.agentName
            ? { name: binding.agentName }
            : resolveSelectedAgent(await this.opencodeClient.listAgents(), null);
        const result = await this.opencodeClient.promptSession({
            sessionId: binding.sessionId,
            prompt: input.text,
            ...(selectedAgent ? { agent: selectedAgent.name } : {}),
            structured: true,
            ...(model ? { model } : {}),
            ...(binding.modelVariant ? { variant: binding.modelVariant } : {}),
        });

        await this.sessionRepo.touch(input.chatId);

        return {
            assistantReply: result,
            sessionId: binding.sessionId,
            projectId: binding.projectId,
        };
    }
}
