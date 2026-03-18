import type { MiddlewareFn } from "grammy";
import { container } from "../../app/container.js";

export const loggingMiddleware: MiddlewareFn = async (ctx, next) => {
    container.logger.info(
        {
            updateId: ctx.update.update_id,
            chatId: ctx.chat?.id,
            fromId: ctx.from?.id,
            text: "message" in ctx.msg! ? ctx.msg?.text : undefined,
        },
        "incoming update",
    );

    return next();
};