import type { Bot } from "grammy";
import { presentError } from "../presenters/error.presenter.js";
import type { BotDependencies } from "../types.js";

interface MessageContext {
    chat: { id: number };
    message: { text?: string };
    reply(text: string): Promise<unknown>;
}

export async function handleTextMessage(ctx: MessageContext, dependencies: BotDependencies) {
    const text = ctx.message.text?.trim();

    if (!text) return;
    if (text.startsWith("/")) return;

    try {
        await ctx.reply("处理中...");

        const result = await dependencies.sendPromptUseCase.execute({
            chatId: ctx.chat.id,
            text,
        });

        await ctx.reply(result.replyText);
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle text message");
        await ctx.reply(presentError(error));
    }
}

export function registerMessageHandler(bot: Bot, dependencies: BotDependencies) {
    bot.on("message:text", async (ctx) => {
        await handleTextMessage(ctx, dependencies);
    });
}
