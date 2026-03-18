import crypto from "node:crypto";
import type { Session } from "../domain/session/session.entity.js";
import type { SessionRepository } from "../domain/session/session.repository.js";

export class InMemorySessionRepository implements SessionRepository {
    private readonly sessionsByChatId = new Map<number, Session>();

    async getByChatId(chatId: number): Promise<Session | null> {
        return this.sessionsByChatId.get(chatId) ?? null;
    }

    async create(chatId: number): Promise<Session> {
        const now = new Date().toISOString();

        const session: Session = {
            id: crypto.randomUUID(),
            chatId,
            createdAt: now,
            updatedAt: now,
        };

        this.sessionsByChatId.set(chatId, session);
        return session;
    }

    async touch(sessionId: string): Promise<void> {
        for (const [chatId, session] of this.sessionsByChatId.entries()) {
            if (session.id === sessionId) {
                this.sessionsByChatId.set(chatId, {
                    ...session,
                    updatedAt: new Date().toISOString(),
                });
                return;
            }
        }
    }
}