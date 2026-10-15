import type { ThinkingMessage } from "./thinking-message.entity.js";

export interface ThinkingMessageRepository {
    get(chatId: number, messageId: number): Promise<ThinkingMessage | null>;
    set(message: ThinkingMessage): Promise<void>;
    delete(chatId: number, messageId: number): Promise<void>;
}
