import type { SessionRepository } from "../domain/session/session.repository.js";
import type { AppLogger } from "../infra/logger/index.js";
import type { OpenCodeSession } from "../services/opencode/opencode.client.js";
import type { OpenCodeCurrentProjectReader, OpenCodeSessionCatalog } from "../services/opencode/opencode.ports.js";

export type SwitchSessionResult =
    | {
        found: false;
    }
    | {
        found: true;
        session: OpenCodeSession;
    };

export interface SwitchSessionInput {
    chatId: number;
    sessionId: string;
}

export class SwitchSessionUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeCurrentProjectReader & Pick<OpenCodeSessionCatalog, "getSession">,
        private readonly logger: AppLogger,
    ) { }

    async execute(input: SwitchSessionInput): Promise<SwitchSessionResult> {
        const [binding, session] = await Promise.all([
            this.sessionRepo.getByChatId(input.chatId),
            this.opencodeClient.getSession(input.sessionId),
        ]);
        const currentProjectId = binding?.projectId ?? (await this.opencodeClient.getCurrentProject()).id;
        if (!session || session.id !== input.sessionId || session.projectID !== currentProjectId) {
            return { found: false };
        }

        await this.sessionRepo.setCurrent({
            chatId: input.chatId,
            sessionId: session.id,
            projectId: session.projectID,
            directory: session.directory,
            agentName: binding?.agentName ?? null,
            modelProviderId: binding?.modelProviderId ?? null,
            modelId: binding?.modelId ?? null,
            modelVariant: binding?.modelVariant ?? null,
            language: binding?.language ?? null,
            updatedAt: new Date().toISOString(),
        });

        this.logger.info(
            {
                chatId: input.chatId,
                sessionId: session.id,
                projectId: session.projectID,
                directory: session.directory,
            },
            "session switched",
        );

        return {
            found: true,
            session,
        };
    }
}
