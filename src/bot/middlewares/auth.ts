import type { MiddlewareFn } from "grammy";
import { getBotCopy, normalizeBotLanguage } from "../copy.js";

export function createAuthMiddleware(allowedChatIds: readonly number[]): MiddlewareFn {
    return async (ctx, next) => {
        if (allowedChatIds.length === 0) {
            return next();
        }

        const chatId = ctx.chat?.id;

        if (!chatId || !allowedChatIds.includes(chatId)) {
            const copy = getBotCopy(normalizeBotLanguage(ctx.from?.language_code));

            await ctx.reply(copy.auth.unauthorizedChat);
            return;
        }

        return next();
    };
}
