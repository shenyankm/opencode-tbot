import { abortable } from "../infra/utils/abort.js";
import { beginBindingSelection, emptyBinding } from "./binding-update.js";
import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type {
    OpenCodeProject,
    OpenCodeSession,
} from "../services/opencode/opencode.client.js";
import type { OpenCodeCurrentProjectReader, OpenCodeSessionManager } from "../services/opencode/opencode.ports.js";

interface CreateAndBindCurrentProjectSessionInput {
    chatId: number;
    title?: string | null;
    signal?: AbortSignal;
    assertCurrent?: () => void;
}

export interface CreateAndBindCurrentProjectSessionResult {
    binding: ChatSessionBinding;
    project: OpenCodeProject;
    session: OpenCodeSession;
}

export async function createAndBindCurrentProjectSession(
    sessionRepo: SessionRepository,
    opencodeClient: OpenCodeCurrentProjectReader & Pick<OpenCodeSessionManager, "createSessionForDirectory">,
    input: CreateAndBindCurrentProjectSessionInput,
): Promise<CreateAndBindCurrentProjectSessionResult> {
    const assertCurrent = input.assertCurrent ?? beginBindingSelection(sessionRepo, input.chatId, "session");
    input.signal?.throwIfAborted();
    assertCurrent();
    const project = await abortable(opencodeClient.getCurrentProject(input.signal), input.signal);
    input.signal?.throwIfAborted();
    assertCurrent();
    const title = normalizeOptionalText(input.title);
    const session = await abortable(opencodeClient.createSessionForDirectory(project.worktree, title ?? undefined, input.signal), input.signal);
    input.signal?.throwIfAborted();
    const nextBinding = await sessionRepo.update(input.chatId, (current) => {
        input.signal?.throwIfAborted();
        assertCurrent();
        return {
            ...(current ?? emptyBinding(input.chatId)),
            sessionId: session.id,
            projectId: session.projectID,
            directory: session.directory,
            updatedAt: new Date().toISOString(),
        };
    });

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
