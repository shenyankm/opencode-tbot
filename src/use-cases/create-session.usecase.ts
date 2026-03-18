import type { Logger } from "pino";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type {
    OpenCodeClientLike,
    OpenCodeSession,
} from "../services/opencode/opencode.client.js";
import { createAndBindCurrentProjectSession } from "./session-creation.js";

export interface CreateSessionResult {
    session: OpenCodeSession;
}

export class CreateSessionUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
        private readonly logger: Logger,
    ) { }

    async execute(input: { chatId: number; title?: string | null }): Promise<CreateSessionResult> {
        const binding = await this.sessionRepo.getByChatId(input.chatId);
        const result = await createAndBindCurrentProjectSession(
            this.sessionRepo,
            this.opencodeClient,
            {
                chatId: input.chatId,
                title: input.title,
                binding,
            },
        );

        this.logger.info(
            {
                chatId: input.chatId,
                sessionId: result.session.id,
                projectId: result.session.projectID,
                directory: result.session.directory,
                title: input.title?.trim() || null,
            },
            "session created",
        );

        return {
            session: result.session,
        };
    }
}
