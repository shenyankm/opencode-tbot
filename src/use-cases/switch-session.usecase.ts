import type { Logger } from "pino";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpenCodeClientLike, OpenCodeSession } from "../services/opencode/opencode.client.js";

export type SwitchSessionResult =
    | {
        found: false;
    }
    | {
        found: true;
        session: OpenCodeSession;
    };

export class SwitchSessionUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
        private readonly logger: Logger,
    ) { }

    async execute(input: { chatId: number; sessionId: string }): Promise<SwitchSessionResult> {
        const [binding, sessions] = await Promise.all([
            this.sessionRepo.getByChatId(input.chatId),
            this.opencodeClient.listSessions(),
        ]);
        const currentProjectId = binding?.projectId ?? (await this.opencodeClient.getCurrentProject()).id;
        const session = sessions.find((item) => item.id === input.sessionId && item.projectID === currentProjectId);

        if (!session) {
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
