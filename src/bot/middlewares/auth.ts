import type { MiddlewareFn } from "grammy";
import { isChatAuthorized } from "../../services/telegram/authorization.js";

export function createAuthMiddleware(allowedChatIds: readonly number[]): MiddlewareFn {
    return async (ctx, next) => {
        if (!isChatAuthorized(allowedChatIds, ctx.chat?.id)) {
            return;
        }
        return next();
    };
}
