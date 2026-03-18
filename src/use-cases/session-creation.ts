import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type {
    OpenCodeClientLike,
    OpenCodeProject,
    OpenCodeSession,
} from "../services/opencode/opencode.client.js";

interface CreateAndBindCurrentProjectSessionInput {
    chatId: number;
    title?: string | null;
    binding?: ChatSessionBinding | null;
}

export interface CreateAndBindCurrentProjectSessionResult {
    binding: ChatSessionBinding;
    project: OpenCodeProject;
    session: OpenCodeSession;
}

export async function createAndBindCurrentProjectSession(
    sessionRepo: SessionRepository,
    opencodeClient: OpenCodeClientLike,
    input: CreateAndBindCurrentProjectSessionInput,
): Promise<CreateAndBindCurrentProjectSessionResult> {
    const binding = input.binding ?? await sessionRepo.getByChatId(input.chatId);
    const project = await opencodeClient.getCurrentProject();
    const title = normalizeOptionalText(input.title);
    const session = await opencodeClient.createSessionForDirectory(project.worktree, title ?? undefined);
    const nextBinding: ChatSessionBinding = {
        chatId: input.chatId,
        sessionId: session.id,
        projectId: session.projectID,
        directory: session.directory,
        agentName: binding?.agentName ?? null,
        modelProviderId: binding?.modelProviderId ?? null,
        modelId: binding?.modelId ?? null,
        modelVariant: binding?.modelVariant ?? null,
        language: binding?.language ?? null,
        updatedAt: new Date().toISOString(),
    };

    await sessionRepo.setCurrent(nextBinding);

    return {
        binding: nextBinding,
        project,
        session,
    };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
    const normalized = value?.trim();

    return normalized ? normalized : null;
}
