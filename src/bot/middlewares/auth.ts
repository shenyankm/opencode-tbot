import type { MiddlewareFn } from "grammy";
import { config } from "../../app/config.js";

export const authMiddleware: MiddlewareFn = async (ctx, next) => {
    if (config.telegramAllowedChatIds.length === 0) {
        return next();
    }

    const chatId = ctx.chat?.id;
    if (!chatId || !config.telegramAllowedChatIds.includes(chatId)) {
        await ctx.reply("Unauthorized chat.");
        return;
    }

    return next();
};