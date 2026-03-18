import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { SessionRepository } from "../domain/session/session.repository.js";

export class InMemorySessionRepository implements SessionRepository {
    private readonly sessionsByChatId = new Map<number, ChatSessionBinding>();

    async getByChatId(chatId: number): Promise<ChatSessionBinding | null> {
        return this.sessionsByChatId.get(chatId) ?? null;
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
