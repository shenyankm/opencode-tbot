import type { Bot } from "grammy";
import { presentError } from "../presenters/error.presenter.js";
import { container } from "../../app/container.js";

export function registerMessageHandler(bot: Bot) {
    bot.on("message:text", async (ctx) => {
        const text = ctx.message.text?.trim();

        if (!text) return;
        if (text.startsWith("/")) return;

        try {
            await ctx.reply("处理中...");

            const result = await container.sendPromptUseCase.execute({
                chatId: ctx.chat.id,
                text,
            });

            await ctx.reply(result.replyText);
        } catch (error) {
            container.logger.error({ error }, "failed to handle text message");
            await ctx.reply(presentError(error));
        }
    });
}