import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type {
    OpenCodeLspStatus,
    OpenCodeProject,
} from "../services/opencode/opencode.client.js";
import type {
    OpenCodeCurrentProjectReader,
    OpenCodeLspCatalog,
    OpenCodeProjectCatalog,
} from "../services/opencode/opencode.ports.js";
import { clearStoredSessionContext } from "./binding-update.js";

export interface ListLspResult {
    currentDirectory: string;
    statuses: OpenCodeLspStatus[];
}

export interface ListLspInput {
    chatId: number;
}

export class ListLspUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeCurrentProjectReader & OpenCodeLspCatalog & OpenCodeProjectCatalog,
    ) { }

    async execute(input: ListLspInput): Promise<ListLspResult> {
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
        const statuses = await this.opencodeClient.listLspStatuses(projectContext.directory);

        return {
            currentDirectory: projectContext.directory,
            statuses: [...statuses].sort(compareLspStatuses),
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

function compareLspStatuses(left: OpenCodeLspStatus, right: OpenCodeLspStatus): number {
    return left.name.localeCompare(right.name)
        || left.root.localeCompare(right.root)
        || left.id.localeCompare(right.id);
}

function hasMatchingProject(projects: OpenCodeProject[], binding: ChatSessionBinding): boolean {
    return projects.some((project) =>
        project.id === binding.projectId && project.worktree === binding.directory,
    );
}
