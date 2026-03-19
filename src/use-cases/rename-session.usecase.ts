import type { Logger } from "pino";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpenCodeClientLike, OpenCodeSession } from "../services/opencode/opencode.client.js";

export type RenameSessionResult =
    | {
        found: false;
    }
    | {
        found: true;
        session: OpenCodeSession;
    };

export class RenameSessionUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
        private readonly logger: Logger,
    ) { }

    async execute(input: { chatId: number; sessionId: string; title: string }): Promise<RenameSessionResult> {
        const title = input.title.trim();

        if (!title) {
            throw new Error("Session title cannot be empty.");
        }

        const [binding, sessions] = await Promise.all([
            this.sessionRepo.getByChatId(input.chatId),
            this.opencodeClient.listSessions(),
        ]);
        const currentProjectId = binding?.projectId ?? (await this.opencodeClient.getCurrentProject()).id;
        const session = sessions.find((item) => item.id === input.sessionId && item.projectID === currentProjectId);

        if (!session) {
            return { found: false };
        }

        const renamedSession = await this.opencodeClient.renameSession(session.id, title);

        this.logger.info(
            {
                chatId: input.chatId,
                sessionId: renamedSession.id,
                projectId: renamedSession.projectID,
                title: renamedSession.title,
            },
            "session renamed",
        );

        return {
            found: true,
            session: renamedSession,
        };
    }
}
