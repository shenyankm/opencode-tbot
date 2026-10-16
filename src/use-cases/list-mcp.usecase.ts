import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpenCodeMcpStatus } from "../services/opencode/opencode.client.js";
import type {
    OpenCodeCurrentProjectReader,
    OpenCodeMcpCatalog,
    OpenCodeProjectCatalog,
    OpenCodeSessionCatalog,
} from "../services/opencode/opencode.ports.js";
import { clearStoredSessionContext } from "./binding-update.js";
import { hasMatchingProject } from "./project-binding.js";

export interface ListMcpEntry {
    name: string;
    status: OpenCodeMcpStatus;
}

export interface ListMcpResult {
    currentDirectory: string;
    statuses: ListMcpEntry[];
}

export interface ListMcpInput {
    chatId: number;
}

export class ListMcpUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeCurrentProjectReader
            & OpenCodeMcpCatalog
            & OpenCodeProjectCatalog
            & Pick<OpenCodeSessionCatalog, "getSession">,
    ) { }

    async execute(input: ListMcpInput): Promise<ListMcpResult> {
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
