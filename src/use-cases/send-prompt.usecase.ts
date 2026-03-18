import type { Logger } from "pino";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpenCodeClientLike } from "../services/opencode/opencode.client.js";

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

        if (!binding || !binding.sessionId || !binding.projectId) {
            throw new Error("Failed to initialize chat session.");
        }

        const result = await this.opencodeClient.promptSession({
            sessionId: binding.sessionId,
            prompt: input.text,
            agent: binding.agentName,
            model: binding.modelProviderId && binding.modelId
                ? {
                    providerID: binding.modelProviderId,
                    modelID: binding.modelId,
                }
                : undefined,
            variant: binding.modelVariant,
        });

        await this.sessionRepo.touch(input.chatId);

        return {
            sessionId: binding.sessionId,
            projectId: binding.projectId,
            replyText: result.text,
        };
    }
}
