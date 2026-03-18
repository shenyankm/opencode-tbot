import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpenCodeClientLike, OpenCodeSession } from "../services/opencode/opencode.client.js";

export interface ListSessionsResult {
    sessions: OpenCodeSession[];
    currentProjectId: string;
    currentDirectory: string;
    currentSessionId: string | null;
}

export class ListSessionsUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
    ) { }

    async execute(input: { chatId: number }): Promise<ListSessionsResult> {
        const binding = await this.sessionRepo.getByChatId(input.chatId);
        const projectContext = binding?.projectId && binding.directory
            ? {
                projectId: binding.projectId,
                directory: binding.directory,
            }
            : await this.getCurrentProjectContext();
        const sessions = await this.opencodeClient.listSessions();

        return {
            sessions: sessions.filter((session) => session.projectID === projectContext.projectId),
            currentProjectId: projectContext.projectId,
            currentDirectory: projectContext.directory,
            currentSessionId: binding?.projectId === projectContext.projectId ? binding.sessionId : null,
        };
    }

    private async getCurrentProjectContext() {
        const currentProject = await this.opencodeClient.getCurrentProject();

        return {
            projectId: currentProject.id,
            directory: currentProject.worktree,
        };
    }
}
