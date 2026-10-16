import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { OpenCodeProject, OpenCodeSession } from "../services/opencode/opencode.client.js";
import type { OpenCodeSessionCatalog } from "../services/opencode/opencode.ports.js";

export async function hasMatchingProject(
    projects: OpenCodeProject[] | null,
    binding: ChatSessionBinding,
    sessionCatalog: Pick<OpenCodeSessionCatalog, "getSession">,
    sessions?: OpenCodeSession[],
): Promise<boolean> {
    if (projects === null) {
        return true;
    }

    const project = projects.find((candidate) => candidate.id === binding.projectId);

    if (!project || !binding.directory) {
        return false;
    }

    if (project.worktree === binding.directory || project.sandboxes?.includes(binding.directory)) {
        return true;
    }

    if (!binding.sessionId) {
        return false;
    }

    return (sessions ?? [await sessionCatalog.getSession(binding.sessionId)]).some((session) =>
        session !== null
        && session.id === binding.sessionId
        && session.projectID === binding.projectId
        && session.directory === binding.directory,
    );
}
