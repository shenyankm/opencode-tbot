import { beginBindingSelection } from "./binding-update.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { AppLogger } from "../infra/logger/index.js";
import type {
    OpenCodeSession,
} from "../services/opencode/opencode.client.js";
import type { OpenCodeCurrentProjectReader, OpenCodeSessionManager } from "../services/opencode/opencode.ports.js";
import { createAndBindCurrentProjectSession } from "./session-creation.js";

export interface CreateSessionResult {
    session: OpenCodeSession;
}

export interface CreateSessionInput {
    chatId: number;
    title?: string | null;
}

export class CreateSessionUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeCurrentProjectReader & Pick<OpenCodeSessionManager, "createSessionForDirectory">,
        private readonly logger: AppLogger,
    ) { }

    async execute(input: CreateSessionInput): Promise<CreateSessionResult> {
        const assertCurrent = beginBindingSelection(this.sessionRepo, input.chatId, "session");
        const result = await createAndBindCurrentProjectSession(
            this.sessionRepo,
            this.opencodeClient,
            {
                chatId: input.chatId,
                title: input.title,
                assertCurrent,
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
