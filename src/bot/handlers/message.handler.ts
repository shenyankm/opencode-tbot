import type { Bot } from "grammy";
import { BOT_COPY } from "../copy.js";
import { presentError } from "../presenters/error.presenter.js";
import type { BotDependencies } from "../types.js";

interface SentMessage {
    message_id: number;
}

interface MessageContext {
    chat: { id: number };
    message: { text?: string };
    api: {
        deleteMessage(chatId: number, messageId: number): Promise<unknown>;
    };
    reply(text: string): Promise<SentMessage>;
}

export async function handleTextMessage(ctx: MessageContext, dependencies: BotDependencies) {
    const text = ctx.message.text?.trim();

    if (!text) return;
    if (text.startsWith("/")) return;

    let processingMessage: SentMessage | null = null;
    let sentTerminalReply = false;

    try {
        processingMessage = await ctx.reply(BOT_COPY.status.processing);

        const result = await dependencies.sendPromptUseCase.execute({
            chatId: ctx.chat.id,
            text,
        });

        await ctx.reply(result.replyText);
        sentTerminalReply = true;
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle text message");
        await ctx.reply(presentError(error));
        sentTerminalReply = true;
    } finally {
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
