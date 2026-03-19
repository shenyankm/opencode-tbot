import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { OpencodeTbotState } from "../services/storage/bot-state.js";
import type { JsonStateStore } from "../services/storage/json-state-store.js";

export class InMemorySessionRepository implements SessionRepository {
    private readonly sessionsByChatId = new Map<number, ChatSessionBinding>();

    async getByChatId(chatId: number): Promise<ChatSessionBinding | null> {
        return this.sessionsByChatId.get(chatId) ?? null;
    }

    async listBySessionId(sessionId: string): Promise<ChatSessionBinding[]> {
        return [...this.sessionsByChatId.values()].filter((binding) => binding.sessionId === sessionId);
    }

    async setCurrent(binding: ChatSessionBinding): Promise<void> {
        this.sessionsByChatId.set(binding.chatId, binding);
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
        const state = await this.store.read();

        return state.sessions[String(chatId)] ?? null;
    }

    async listBySessionId(sessionId: string): Promise<ChatSessionBinding[]> {
        const state = await this.store.read();

        return Object.values(state.sessions).filter((binding) => binding.sessionId === sessionId);
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
