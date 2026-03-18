import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpenCodeClientLike, OpenCodeProject } from "../services/opencode/opencode.client.js";

export interface ListProjectsResult {
    projects: OpenCodeProject[];
    currentProjectId: string | null;
    currentDirectory: string | null;
}

export class ListProjectsUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
    ) { }

    async execute(input: { chatId: number }): Promise<ListProjectsResult> {
        const binding = await this.sessionRepo.getByChatId(input.chatId);
        const projects = await this.opencodeClient.listProjects();

        if (binding?.projectId && binding.directory) {
            return {
                projects,
                currentProjectId: binding.projectId,
                currentDirectory: binding.directory,
            };
        }

        const currentProject = await this.opencodeClient.getCurrentProject();

        return {
            projects,
            currentProjectId: currentProject.id,
            currentDirectory: currentProject.worktree,
        };
    }
}
