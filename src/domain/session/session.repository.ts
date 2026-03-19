import type { ChatSessionBinding } from "./session.entity.js";

export interface SessionRepository {
    getByChatId(chatId: number): Promise<ChatSessionBinding | null>;
    listBySessionId(sessionId: string): Promise<ChatSessionBinding[]>;
    setCurrent(binding: ChatSessionBinding): Promise<void>;
    touch(chatId: number): Promise<void>;
}
