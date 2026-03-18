import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { SessionRepository } from "../domain/session/session.repository.js";

type MutableBindingFields = Omit<ChatSessionBinding, "chatId" | "updatedAt">;

export async function persistBindingUpdate(
    sessionRepo: SessionRepository,
    binding: ChatSessionBinding,
    updates: Partial<MutableBindingFields>,
): Promise<ChatSessionBinding> {
    const nextBinding: ChatSessionBinding = {
        ...binding,
        ...updates,
        updatedAt: new Date().toISOString(),
    };

    await sessionRepo.setCurrent(nextBinding);
    return nextBinding;
}

export async function clearStoredAgentSelection(
    sessionRepo: SessionRepository,
    binding: ChatSessionBinding,
): Promise<ChatSessionBinding> {
    return persistBindingUpdate(sessionRepo, binding, {
        agentName: null,
    });
}

export async function clearStoredModelSelection(
    sessionRepo: SessionRepository,
    binding: ChatSessionBinding,
): Promise<ChatSessionBinding> {
    return persistBindingUpdate(sessionRepo, binding, {
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
    });
}

export async function clearStoredModelVariant(
    sessionRepo: SessionRepository,
    binding: ChatSessionBinding,
): Promise<ChatSessionBinding> {
    return persistBindingUpdate(sessionRepo, binding, {
        modelVariant: null,
    });
}

export async function clearStoredSessionContext(
    sessionRepo: SessionRepository,
    binding: ChatSessionBinding,
): Promise<ChatSessionBinding> {
    return persistBindingUpdate(sessionRepo, binding, {
        sessionId: null,
        projectId: null,
        directory: null,
    });
}
