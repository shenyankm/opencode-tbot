import { stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { AppLogger } from "../infra/logger/index.js";
import { pruneThinkingHistory, HISTORY_MAX_AGE_MS } from "../services/storage/history-retention.js";
import type { ThinkingMessage } from "../domain/thinking/thinking-message.entity.js";
import type { ThinkingMessageRepository } from "../domain/thinking/thinking-message.repository.js";
import { readStateFile, writeStateFile } from "../services/storage/json-state-store.js";

const messageSchema = z.object({
    chatId: z.number().int().safe(),
    messageId: z.number().int().positive().safe(),
    text: z.string().max(4096),
    part: z.number().int().positive().optional(),
    phase: z.enum(["running", "completed", "stopped", "failed"]),
    expanded: z.boolean(),
    stopCallbackData: z.string().max(64).nullable(),
    lastSentView: z.string().max(32768).optional(),
});

export class FileThinkingMessageRepository implements ThinkingMessageRepository {
    private lastPrunedAt = 0;

    constructor(private readonly directory: string, private readonly logger?: Pick<AppLogger, "warn">) { }

    async get(chatId: number, messageId: number): Promise<ThinkingMessage | null> {
        const path = this.path(chatId, messageId);
        const info = await stat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
        if (!info) return null;
        if (Date.now() - info.mtimeMs > HISTORY_MAX_AGE_MS) {
            await this.delete(chatId, messageId);
            return null;
        }
        const { message } = await this.read(chatId, messageId);
        if (message === null) return null;
        const parsed = messageSchema.parse(message);
        if (parsed.chatId !== chatId || parsed.messageId !== messageId) {
            throw new Error("Thinking message does not belong to this chat and message.");
        }
        return parsed;
    }

    async set(message: ThinkingMessage): Promise<void> {
        const parsed = messageSchema.parse(message);
        const state = await this.read(parsed.chatId, parsed.messageId);
        state.message = parsed;
        await writeStateFile(this.path(parsed.chatId, parsed.messageId), state);
        if (Date.now() - this.lastPrunedAt > 60_000) {
            this.lastPrunedAt = Date.now();
            try {
                await pruneThinkingHistory(this.directory);
            } catch (error) {
                this.lastPrunedAt = 0;
                this.logger?.warn({ error, event: "history.prune_failed" }, "failed to prune thinking history; retrying on the next write");
            }
        }
    }

    async delete(chatId: number, messageId: number): Promise<void> {
        try {
            await unlink(this.path(chatId, messageId));
        } catch (error) {
            if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
    }

    private path(chatId: number, messageId: number): string {
        if (!Number.isSafeInteger(chatId) || !Number.isSafeInteger(messageId) || messageId <= 0) {
            throw new Error("Invalid thinking message identity.");
        }
        return join(this.directory, `${chatId}.${messageId}.json`);
    }

    private read(chatId: number, messageId: number): Promise<{ message: ThinkingMessage | null }> {
        return readStateFile(this.path(chatId, messageId), () => ({ message: null }));
    }
}
