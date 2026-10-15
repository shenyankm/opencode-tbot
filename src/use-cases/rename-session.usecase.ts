import type { SessionRepository } from "../domain/session/session.repository.js";
import type { AppLogger } from "../infra/logger/index.js";
import type { OpenCodeSession } from "../services/opencode/opencode.client.js";
import type { OpenCodeCurrentProjectReader, OpenCodeSessionCatalog, OpenCodeSessionManager } from "../services/opencode/opencode.ports.js";

export type RenameSessionResult =
    | {
        found: false;
    }
    | {
        found: true;
        session: OpenCodeSession;
    };

export interface RenameSessionInput {
    chatId: number;
    sessionId: string;
    title: string;
}

export class RenameSessionUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeCurrentProjectReader & Pick<OpenCodeSessionCatalog, "getSession"> & Pick<OpenCodeSessionManager, "renameSession">,
        private readonly logger: AppLogger,
    ) { }

    async execute(input: RenameSessionInput): Promise<RenameSessionResult> {
        const title = input.title.trim();

        if (!title) {
            throw new Error("Session title cannot be empty.");
        }

        const [binding, session] = await Promise.all([
            this.sessionRepo.getByChatId(input.chatId),
            this.opencodeClient.getSession(input.sessionId),
        ]);
        const currentProjectId = binding?.projectId ?? (await this.opencodeClient.getCurrentProject()).id;
        if (!session || session.id !== input.sessionId || session.projectID !== currentProjectId) {
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
