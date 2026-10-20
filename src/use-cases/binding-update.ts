import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { SessionRepository } from "../domain/session/session.repository.js";

type MutableBindingFields = Omit<ChatSessionBinding, "chatId" | "updatedAt">;

export async function persistBindingUpdate(
    sessionRepo: SessionRepository,
    binding: ChatSessionBinding,
    updates: Partial<MutableBindingFields>,
    signal?: AbortSignal,
): Promise<ChatSessionBinding> {
    return sessionRepo.update(binding.chatId, (current) => {
        signal?.throwIfAborted();
        if (!current) throw new Error("Chat binding is no longer available.");
        const keys = Object.keys(updates) as Array<keyof MutableBindingFields>;
        if (keys.some((key) => current[key] !== binding[key])) return current;
        return { ...current, ...updates, updatedAt: new Date().toISOString() };
    });
}

export async function clearStoredAgentSelection(
    sessionRepo: SessionRepository,
    binding: ChatSessionBinding,
    signal?: AbortSignal,
): Promise<ChatSessionBinding> {
    return persistBindingUpdate(sessionRepo, binding, {
        agentName: null,
    }, signal);
}

export async function clearStoredModelSelection(
    sessionRepo: SessionRepository,
    binding: ChatSessionBinding,
    signal?: AbortSignal,
): Promise<ChatSessionBinding> {
    return persistBindingUpdate(sessionRepo, binding, {
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
    }, signal);
}

export async function clearStoredModelVariant(
    sessionRepo: SessionRepository,
    binding: ChatSessionBinding,
    signal?: AbortSignal,
): Promise<ChatSessionBinding> {
    return persistBindingUpdate(sessionRepo, binding, {
        modelVariant: null,
    }, signal);
}

export async function clearStoredSessionContext(
    sessionRepo: SessionRepository,
    binding: ChatSessionBinding,
    signal?: AbortSignal,
): Promise<ChatSessionBinding> {
    return persistBindingUpdate(sessionRepo, binding, {
        sessionId: null,
        projectId: null,
        directory: null,
    }, signal);
}

export function emptyBinding(chatId: number): ChatSessionBinding {
    return {
        chatId, sessionId: null, projectId: null, directory: null, agentName: null,
        modelProviderId: null, modelId: null, modelVariant: null, language: null,
        updatedAt: new Date().toISOString(),
    };
}

const selections = new WeakMap<SessionRepository, Map<string, symbol>>();

export function beginBindingSelection(sessionRepo: SessionRepository, chatId: number, field: "session" | "model" | "agent"): () => void {
    let pending = selections.get(sessionRepo);
    if (!pending) {
        pending = new Map();
        selections.set(sessionRepo, pending);
    }
    const key = `${chatId}:${field}`;
    const request = Symbol();
    pending.set(key, request);
    return () => {
        if (pending.get(key) !== request) throw new Error("A newer selection superseded this request.");
    };
}
