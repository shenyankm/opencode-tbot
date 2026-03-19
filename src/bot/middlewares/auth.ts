import type { MiddlewareFn } from "grammy";

export function createAuthMiddleware(allowedChatIds: readonly number[]): MiddlewareFn {
    return async (ctx, next) => {
        if (allowedChatIds.length === 0) {
            return next();
        }

        const chatId = ctx.chat?.id;

        if (!chatId || !allowedChatIds.includes(chatId)) {
            await ctx.reply("Unauthorized chat.");
            return;
        }

        return next();
    };
}
