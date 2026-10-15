import { InlineKeyboard } from "grammy";
import { isTelegramFormattingError } from "./rich-messages.js";
import type { BotCopy } from "../../bot/copy.js";
import type { ThinkingContent, ThinkingMessage } from "../../domain/thinking/thinking-message.entity.js";
import type { ThinkingMessageRepository } from "../../domain/thinking/thinking-message.repository.js";
import { redactSensitiveText } from "../../infra/utils/redact.js";
import { escapeTelegramHtml, type TelegramReplyPayload, type TelegramStaticReply } from "./telegram-format.js";
import { retryTelegramRequest } from "./telegram-message-queue.js";

export type ThinkingMessageWriter = (payload: TelegramReplyPayload<"HTML">, keyboard: InlineKeyboard) => Promise<unknown>;

export function buildThinkingMessageReply(content: ThinkingContent, expanded: boolean, copy: BotCopy): TelegramStaticReply<"HTML"> {
    const title = `💭 ${content.phase === "running" ? copy.status.thinkingInProgress : copy.status.thinking}${content.part ? ` · ${content.part}` : ""}`;
    const status = content.phase === "stopped" || content.phase === "failed" ? ` · ${copy.status[content.phase]}` : "";
    const action = expanded ? "collapse" : "expand";
    const label = expanded ? copy.status.collapseThinking : copy.status.expandThinking;
    const header = `${title}${status} · `;
    const text = redactSensitiveText(content.text);
    return {
        preferred: {
            text: `<p>${escapeTelegramHtml(header)}<tg-button type="callback_data" style="link" data="thinking:${action}">${escapeTelegramHtml(label)}</tg-button>${expanded ? `<br/>${escapeTelegramHtml(text).replace(/\n/gu, "<br/>")}` : ""}</p>`,
            options: { parse_mode: "HTML" },
        },
        fallback: { text: `${title}${status}${expanded ? `\n${text}` : ""}` },
    };
}

export class TelegramThinkingMessages {
    private readonly writes = new Map<string, Promise<unknown>>();

    constructor(private readonly repository: ThinkingMessageRepository) { }

    async update(
        chatId: number,
        messageId: number,
        content: ThinkingContent,
        requestId: string,
        copy: BotCopy,
        write: ThinkingMessageWriter,
    ): Promise<void> {
        await this.serial(chatId, messageId, async () => {
            const previous = await this.repository.get(chatId, messageId);
            const next: ThinkingMessage = {
                ...previous,
                ...content,
                text: redactSensitiveText(content.text),
                chatId,
                messageId,
                part: content.part,
                expanded: previous?.expanded ?? false,
                stopCallbackData: content.phase === "running" ? `prompt:stop:${requestId}` : null,
            };
            // Save the body before exposing its toggle, and remember delivery only after the edit succeeds.
            if (JSON.stringify(previous) !== JSON.stringify(next)) await this.repository.set(next);
            const after = buildThinkingMessageReply(next, next.expanded, copy).preferred.text;
            if (previous?.lastSentView !== JSON.stringify([after, next.stopCallbackData])) {
                await this.write(next, copy, write);
            }
        });
    }

    async setExpanded(
        chatId: number,
        messageId: number,
        expanded: boolean,
        activeRequestId: string | null,
        copy: BotCopy,
        write: ThinkingMessageWriter,
    ): Promise<boolean> {
        return this.serial(chatId, messageId, async () => {
            const message = await this.repository.get(chatId, messageId);
            if (!message) return false;
            message.expanded = expanded;
            if (message.phase === "running" && message.stopCallbackData !== `prompt:stop:${activeRequestId}`) {
                message.phase = "stopped";
                message.stopCallbackData = null;
            }
            await this.repository.set(message);
            await this.write(message, copy, write);
            return true;
        });
    }

    async remove(chatId: number, messageId: number, remove: () => Promise<unknown>): Promise<void> {
        await this.serial(chatId, messageId, async () => {
            await remove();
            await this.repository.delete(chatId, messageId);
        });
    }

    private async write(message: ThinkingMessage, copy: BotCopy, write: ThinkingMessageWriter): Promise<void> {
        const reply = buildThinkingMessageReply(message, message.expanded, copy);
        const keyboard = new InlineKeyboard();
        if (message.stopCallbackData) keyboard.text(copy.status.stop, message.stopCallbackData);
        try {
            await retryTelegramRequest(() => write(reply.preferred, keyboard));
        } catch (error) {
            if (!isTelegramFormattingError(error)) throw error;
            const fallbackKeyboard = new InlineKeyboard().text(
                message.expanded ? copy.status.collapseThinking : copy.status.expandThinking,
                `thinking:${message.expanded ? "collapse" : "expand"}`,
            );
            if (message.stopCallbackData) fallbackKeyboard.text(copy.status.stop, message.stopCallbackData);
            await retryTelegramRequest(() => write(reply.fallback, fallbackKeyboard));
        }
        message.lastSentView = JSON.stringify([reply.preferred.text, message.stopCallbackData]);
        await this.repository.set(message);
    }

    private async serial<T>(chatId: number, messageId: number, operation: () => Promise<T>): Promise<T> {
        const key = `${chatId}:${messageId}`;
        const previous = this.writes.get(key) ?? Promise.resolve();
        const pending = previous.catch(() => {}).then(operation);
        this.writes.set(key, pending);
        try {
            return await pending;
        } finally {
            if (this.writes.get(key) === pending) this.writes.delete(key);
        }
    }
}
