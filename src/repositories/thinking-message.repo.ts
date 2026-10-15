import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ThinkingMessage } from "../domain/thinking/thinking-message.entity.js";
import type { ThinkingMessageRepository } from "../domain/thinking/thinking-message.repository.js";
import { JsonStateStore } from "../services/storage/json-state-store.js";

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
    constructor(private readonly directory: string) { }

    async get(chatId: number, messageId: number): Promise<ThinkingMessage | null> {
        const { message } = await this.store(chatId, messageId).read();
        if (message === null) return null;
        const parsed = messageSchema.parse(message);
        if (parsed.chatId !== chatId || parsed.messageId !== messageId) {
            throw new Error("Thinking message does not belong to this chat and message.");
        }
        return parsed;
    }

    async set(message: ThinkingMessage): Promise<void> {
        const parsed = messageSchema.parse(message);
        await this.store(parsed.chatId, parsed.messageId).update((state) => { state.message = parsed; });
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

    private store(chatId: number, messageId: number): JsonStateStore<{ message: ThinkingMessage | null }> {
        return new JsonStateStore({
            filePath: this.path(chatId, messageId),
            createDefaultState: () => ({ message: null }),
        });
    }
}
