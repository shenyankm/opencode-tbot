import type { PendingChatAction } from "./pending-action.entity.js";

export interface PendingActionRepository {
    getByChatId(chatId: number): Promise<PendingChatAction | null>;
    set(action: PendingChatAction): Promise<void>;
    clear(chatId: number): Promise<void>;
}
