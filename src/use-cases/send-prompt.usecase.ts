import type { Logger } from "pino";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpenCodeClient } from "../services/opencode/opencode.client.js";

export class SendPromptUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClient,
        private readonly logger: Logger,
    ) { }

    async execute(input: { chatId: number; text: string }) {
        let session = await this.sessionRepo.getByChatId(input.chatId);

        if (!session) {
            session = await this.sessionRepo.create(input.chatId);
            this.logger.info({ chatId: input.chatId, sessionId: session.id }, "session created");
        }

        const result = await this.opencodeClient.sendPrompt({
            sessionId: session.id,
            prompt: input.text,
        });

        await this.sessionRepo.touch(session.id);

        return {
            sessionId: session.id,
            replyText: result.text || "OpenCode returned empty response.",
        };
    }
}