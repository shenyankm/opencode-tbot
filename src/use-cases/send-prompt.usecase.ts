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

        if (!binding) {
            const project = await this.opencodeClient.getCurrentProject();
            const session = await this.opencodeClient.createSessionForDirectory(project.worktree);

            binding = {
                chatId: input.chatId,
                sessionId: session.id,
                projectId: project.id,
                directory: project.worktree,
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

        const result = await this.opencodeClient.promptSession({
            sessionId: binding.sessionId,
            prompt: input.text,
        });

        await this.sessionRepo.touch(input.chatId);

        return {
            sessionId: binding.sessionId,
            projectId: binding.projectId,
            replyText: result.text,
        };
    }
}
