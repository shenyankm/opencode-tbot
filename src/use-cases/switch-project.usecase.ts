import type { Logger } from "pino";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpenCodeClientLike, OpenCodeProject } from "../services/opencode/opencode.client.js";

export type SwitchProjectResult =
    | {
        found: false;
    }
    | {
        found: true;
        project: OpenCodeProject;
        sessionId: string;
    };

export class SwitchProjectUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
        private readonly logger: Logger,
    ) { }

    async execute(input: { chatId: number; projectId: string }): Promise<SwitchProjectResult> {
        const existingBinding = await this.sessionRepo.getByChatId(input.chatId);
        const projects = await this.opencodeClient.listProjects();
        const project = projects.find((item) => item.id === input.projectId);

        if (!project) {
            return { found: false };
        }

        const session = await this.opencodeClient.createSessionForDirectory(project.worktree);

        await this.sessionRepo.setCurrent({
            chatId: input.chatId,
            sessionId: session.id,
            projectId: project.id,
            directory: project.worktree,
            agentName: existingBinding?.agentName ?? null,
            modelProviderId: existingBinding?.modelProviderId ?? null,
            modelId: existingBinding?.modelId ?? null,
            modelVariant: existingBinding?.modelVariant ?? null,
            updatedAt: new Date().toISOString(),
        });

        this.logger.info(
            {
                chatId: input.chatId,
                sessionId: session.id,
                projectId: project.id,
                directory: project.worktree,
            },
            "project switched",
        );

        return {
            found: true,
            project,
            sessionId: session.id,
        };
    }
}
