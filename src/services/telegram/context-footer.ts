import type { SessionRepository } from "../../domain/session/session.repository.js";
import type { AppLogger } from "../../infra/logger/index.js";
import type { OpenCodeContextUsage } from "../opencode/opencode.client.js";
import type { GetContextUsageUseCase } from "../../use-cases/get-context-usage.usecase.js";

export class TelegramContextFooter {
    private readonly replies = new Map<number, {
        sessionId: string;
        update: (context: OpenCodeContextUsage) => Promise<void>;
        pending: Promise<void>;
    }>();

    constructor(
        private readonly reader: Pick<GetContextUsageUseCase, "execute">,
        private readonly sessionRepo: SessionRepository,
        private readonly logger: AppLogger,
    ) { }

    read(chatId: number, sessionId?: string): Promise<OpenCodeContextUsage> {
        return this.reader.execute({ chatId, sessionId });
    }

    watch(chatId: number, sessionId: string, update: (context: OpenCodeContextUsage) => Promise<void>): void {
        this.replies.set(chatId, { sessionId, update, pending: Promise.resolve() });
    }

    async refreshChat(chatId: number): Promise<void> {
        const reply = this.replies.get(chatId);
        if (!reply) {
            return;
        }
        reply.pending = reply.pending.then(async () => {
            if (this.replies.get(chatId) !== reply) {
                return;
            }
            const binding = await this.sessionRepo.getByChatId(chatId);
            if (binding?.sessionId !== reply.sessionId) {
                return;
            }
            const context = await this.read(chatId, reply.sessionId);
            const currentBinding = await this.sessionRepo.getByChatId(chatId);
            if (this.replies.get(chatId) === reply && currentBinding?.sessionId === reply.sessionId) {
                await reply.update(context);
            }
        }).catch((error) => this.logger.warn({ error, chatId }, "failed to refresh context footer"));
        await reply.pending;
    }

    async refreshSession(sessionId: string): Promise<void> {
        await Promise.all([...this.replies].filter(([, reply]) => reply.sessionId === sessionId)
            .map(([chatId]) => this.refreshChat(chatId)));
    }

    clear(): void {
        this.replies.clear();
    }
}
