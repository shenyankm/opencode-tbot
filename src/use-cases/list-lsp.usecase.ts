import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpenCodeLspStatus } from "../services/opencode/opencode.client.js";
import type {
    OpenCodeCurrentProjectReader,
    OpenCodeLspCatalog,
    OpenCodeProjectCatalog,
    OpenCodeSessionCatalog,
} from "../services/opencode/opencode.ports.js";
import { clearStoredSessionContext } from "./binding-update.js";
import { hasMatchingProject } from "./project-binding.js";

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
        private readonly opencodeClient: OpenCodeCurrentProjectReader
            & OpenCodeLspCatalog
            & OpenCodeProjectCatalog
            & Pick<OpenCodeSessionCatalog, "listSessions">,
    ) { }

    async execute(input: ListLspInput): Promise<ListLspResult> {
        let binding = await this.sessionRepo.getByChatId(input.chatId);

        if (binding?.projectId && binding.directory) {
            const projects = await this.opencodeClient.listProjects();

            if (!(await hasMatchingProject(projects, binding, this.opencodeClient))) {
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
