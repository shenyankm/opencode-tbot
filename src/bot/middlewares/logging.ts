import type { MiddlewareFn } from "grammy";
import type { AppLogger } from "../../infra/logger/index.js";
import { createRedactedPreview } from "../../infra/utils/redact.js";

interface LoggingContextLike {
    chat?: { id?: number };
    from?: { id?: number };
    msg?: { text?: string } | null;
    update: { update_id: number };
}

export function buildIncomingUpdateLogFields(ctx: LoggingContextLike) {
    const messageText = ctx.msg && "text" in ctx.msg
        ? ctx.msg.text
        : undefined;

    return {
        updateId: ctx.update.update_id,
        chatId: ctx.chat?.id,
        fromId: ctx.from?.id,
        hasText: typeof messageText === "string" && messageText.length > 0,
        textLength: typeof messageText === "string" ? messageText.length : 0,
        textPreview: typeof messageText === "string" && messageText.length > 0
            ? createRedactedPreview(messageText)
            : undefined,
    };
}

export function createLoggingMiddleware(logger: Pick<AppLogger, "info">): MiddlewareFn {
    return async (ctx, next) => {
        logger.info(
            buildIncomingUpdateLogFields(ctx),
            "incoming update",
        );

        return next();
    };
}
