import type { PendingChatAction } from "../domain/pending-action/pending-action.entity.js";
import type { PendingActionRepository } from "../domain/pending-action/pending-action.repository.js";
import type { OpencodeTbotState } from "../services/storage/bot-state.js";
import type { JsonStateStore } from "../services/storage/json-state-store.js";

export class InMemoryPendingActionRepository implements PendingActionRepository {
    private readonly actionsByChatId = new Map<number, PendingChatAction>();

    async getByChatId(chatId: number): Promise<PendingChatAction | null> {
        return this.actionsByChatId.get(chatId) ?? null;
    }

    async set(action: PendingChatAction): Promise<void> {
        this.actionsByChatId.set(action.chatId, action);
    }

    async clear(chatId: number): Promise<void> {
        this.actionsByChatId.delete(chatId);
    }
}

export class FilePendingActionRepository implements PendingActionRepository {
    constructor(private readonly store: JsonStateStore<OpencodeTbotState>) { }

    async getByChatId(chatId: number): Promise<PendingChatAction | null> {
        return this.store.select((state) => state.pendingActions[String(chatId)] ?? null);
    }

    async set(action: PendingChatAction): Promise<void> {
        await this.store.update((state) => {
            state.pendingActions[String(action.chatId)] = action;
        });
    }

    async clear(chatId: number): Promise<void> {
        await this.store.update((state) => {
            delete state.pendingActions[String(chatId)];
        });
    }
}
