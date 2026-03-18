import type { Bot } from "grammy";
import { getChatCopy } from "../i18n.js";
import { presentError } from "../presenters/error.presenter.js";
import { buildTelegramPromptReply } from "../../services/telegram/telegram-format.js";
import type { BotDependencies } from "../types.js";

interface SentMessage {
    message_id: number;
}

const activePromptChats = new Set<number>();

interface MessageContext {
    chat: { id: number };
    message: { text?: string };
    api: {
        deleteMessage(chatId: number, messageId: number): Promise<unknown>;
    };
    reply(text: string, other?: { parse_mode?: "MarkdownV2" }): Promise<SentMessage>;
}

export async function handleTextMessage(ctx: MessageContext, dependencies: BotDependencies) {
    const text = ctx.message.text?.trim();

    if (!text) return;
    if (text.startsWith("/")) return;
    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat.id);
    if (activePromptChats.has(ctx.chat.id)) {
        await ctx.reply(copy.status.alreadyProcessing);
        return;
    }

    let processingMessage: SentMessage | null = null;
    let sentTerminalReply = false;

    try {
        activePromptChats.add(ctx.chat.id);
        processingMessage = await ctx.reply(copy.status.processing);

        const result = await dependencies.sendPromptUseCase.execute({
            chatId: ctx.chat.id,
            text,
        });
        const promptReply = result.assistantReply.assistantError
            ? {
                ...result.assistantReply,
                bodyMd: null,
                fallbackText: presentError(result.assistantReply.assistantError, copy),
            }
            : result.assistantReply;
        const telegramReply = buildTelegramPromptReply(promptReply, copy);

        try {
            await ctx.reply(telegramReply.preferred.text, telegramReply.preferred.options);
        } catch (replyError) {
            dependencies.logger.warn?.({ error: replyError }, "failed to send preferred telegram reply, falling back to plain text");
            await ctx.reply(telegramReply.fallback.text, telegramReply.fallback.options);
        }
        sentTerminalReply = true;
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle text message");
        await ctx.reply(presentError(error, copy));
        sentTerminalReply = true;
    } finally {
        activePromptChats.delete(ctx.chat.id);
        if (processingMessage && sentTerminalReply) {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, processingMessage.message_id);
            } catch (error) {
                dependencies.logger.warn?.({ error }, "failed to delete processing message");
            }
        }
    }
}

export function registerMessageHandler(bot: Bot, dependencies: BotDependencies) {
    bot.on("message:text", async (ctx) => {
        await handleTextMessage(ctx, dependencies);
    });
}
