import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type {
    OpenCodeClientLike,
    OpenCodeMcpStatus,
    OpenCodeProject,
} from "../services/opencode/opencode.client.js";
import { clearStoredSessionContext } from "./binding-update.js";

export interface ListMcpEntry {
    name: string;
    status: OpenCodeMcpStatus;
}

export interface ListMcpResult {
    currentDirectory: string;
    statuses: ListMcpEntry[];
}

export class ListMcpUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeClientLike,
    ) { }

    async execute(input: { chatId: number }): Promise<ListMcpResult> {
        let binding = await this.sessionRepo.getByChatId(input.chatId);

        if (binding?.projectId && binding.directory) {
            const projects = await this.opencodeClient.listProjects();

            if (!hasMatchingProject(projects, binding)) {
                binding = await clearStoredSessionContext(this.sessionRepo, binding);
            }
        }

        const projectContext = binding?.projectId && binding.directory
            ? {
                projectId: binding.projectId,
                directory: binding.directory,
            }
            : await this.getCurrentProjectContext();
        const statuses = await this.opencodeClient.listMcpStatuses(projectContext.directory);

        return {
            currentDirectory: projectContext.directory,
            statuses: Object.entries(statuses)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([name, status]) => ({ name, status })),
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

function hasMatchingProject(projects: OpenCodeProject[], binding: ChatSessionBinding): boolean {
    return projects.some((project) =>
        project.id === binding.projectId && project.worktree === binding.directory,
    );
}
