import type { Session } from "./session.entity.js";

export interface SessionRepository {
    getByChatId(chatId: number): Promise<Session | null>;
    create(chatId: number): Promise<Session>;
    touch(sessionId: string): Promise<void>;
}