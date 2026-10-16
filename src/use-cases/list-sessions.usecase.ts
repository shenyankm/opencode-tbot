import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type {
    OpenCodeProject,
    OpenCodeSession,
} from "../services/opencode/opencode.client.js";
import type {
    OpenCodeCurrentProjectReader,
    OpenCodeProjectCatalog,
    OpenCodeSessionCatalog,
} from "../services/opencode/opencode.ports.js";
import { clearStoredSessionContext } from "./binding-update.js";
import { hasMatchingProject } from "./project-binding.js";

export interface ListSessionsResult {
    sessions: OpenCodeSession[];
    currentProjectId: string;
    currentDirectory: string;
    currentSessionId: string | null;
}

export interface ListSessionsInput {
    chatId: number;
    currentOnly?: boolean;
}

export class ListSessionsUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeCurrentProjectReader & OpenCodeProjectCatalog & OpenCodeSessionCatalog,
    ) { }

    async execute(input: ListSessionsInput): Promise<ListSessionsResult> {
        let binding = await this.sessionRepo.getByChatId(input.chatId);
        const listedProjectId = binding?.projectId && binding.directory ? binding.projectId : undefined;
        let [sessions, projects] = await Promise.all([
            input.currentOnly
                ? (binding?.sessionId ? this.opencodeClient.getSession(binding.sessionId) : Promise.resolve(null))
                    .then((session) => session ? [session] : [])
                : this.opencodeClient.listSessions(listedProjectId),
            binding?.projectId && binding.directory
                ? this.opencodeClient.listProjects()
                : Promise.resolve<OpenCodeProject[] | null>(null),
        ]);

        if (
            binding?.projectId
            && binding.directory
            && !(await hasMatchingProject(projects, binding, this.opencodeClient, sessions))
        ) {
            binding = await clearStoredSessionContext(this.sessionRepo, binding);
        }

        if (binding?.sessionId && binding.projectId && !hasMatchingSession(sessions, binding)) {
            binding = await clearStoredSessionContext(this.sessionRepo, binding);
        }

        const projectContext = binding?.projectId && binding.directory
            ? {
                projectId: binding.projectId,
                directory: binding.directory,
            }
            : await this.getCurrentProjectContext();

        if (!input.currentOnly && listedProjectId && listedProjectId !== projectContext.projectId) {
            sessions = await this.opencodeClient.listSessions(projectContext.projectId);
        }

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

function hasMatchingSession(
    sessions: OpenCodeSession[],
    binding: ChatSessionBinding,
): boolean {
    return sessions.some((session) =>
        session.id === binding.sessionId && session.projectID === binding.projectId,
    );
}
