import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpencodeTbotState } from "../services/storage/bot-state.js";
import type { JsonStateStore } from "../services/storage/json-state-store.js";

export class InMemorySessionRepository implements SessionRepository {
    private readonly sessionsByChatId = new Map<number, ChatSessionBinding>();

    async getByChatId(chatId: number): Promise<ChatSessionBinding | null> {
        return structuredClone(this.sessionsByChatId.get(chatId) ?? null);
    }

    async listBySessionId(sessionId: string): Promise<ChatSessionBinding[]> {
        return [...this.sessionsByChatId.values()].filter((binding) => binding.sessionId === sessionId);
    }

    async update(chatId: number, updater: (current: ChatSessionBinding | null) => ChatSessionBinding): Promise<ChatSessionBinding> {
        const next = updater(structuredClone(this.sessionsByChatId.get(chatId) ?? null));
        this.sessionsByChatId.set(chatId, structuredClone(next));
        return next;
    }

    async setCurrent(binding: ChatSessionBinding): Promise<void> {
        this.sessionsByChatId.set(binding.chatId, structuredClone(binding));
    }

    async touch(chatId: number): Promise<void> {
        const binding = this.sessionsByChatId.get(chatId);

        if (!binding) {
            return;
        }

        this.sessionsByChatId.set(chatId, {
            ...binding,
            updatedAt: new Date().toISOString(),
        });
    }
}

export class FileSessionRepository implements SessionRepository {
    constructor(private readonly store: JsonStateStore<OpencodeTbotState>) { }

    async getByChatId(chatId: number): Promise<ChatSessionBinding | null> {
        return this.store.select((state) => state.sessions[String(chatId)] ?? null);
    }

    async listBySessionId(sessionId: string): Promise<ChatSessionBinding[]> {
        return this.store.select((state) => Object.values(state.sessions).filter((binding) => binding.sessionId === sessionId));
    }

    async update(chatId: number, updater: (current: ChatSessionBinding | null) => ChatSessionBinding): Promise<ChatSessionBinding> {
        let next!: ChatSessionBinding;
        await this.store.update((state) => {
            next = updater(state.sessions[String(chatId)] ?? null);
            state.sessions[String(chatId)] = next;
        });
        return structuredClone(next);
    }

    async setCurrent(binding: ChatSessionBinding): Promise<void> {
        await this.store.update((state) => {
            state.sessions[String(binding.chatId)] = binding;
        });
    }

    async touch(chatId: number): Promise<void> {
        await this.store.update((state) => {
            const current = state.sessions[String(chatId)];

            if (!current) {
                return;
            }

            state.sessions[String(chatId)] = {
                ...current,
                updatedAt: new Date().toISOString(),
            };
        });
    }
}
