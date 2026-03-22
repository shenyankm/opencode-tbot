import type { MiddlewareFn } from "grammy";
import {
    logTelegramUpdate,
    type AppLogger,
} from "../../infra/logger/index.js";
import { buildTelegramLoggerContext } from "../logger-context.js";

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
    const loggerContext = buildTelegramLoggerContext(ctx);

    return {
        ...loggerContext,
        event: "telegram.update.received",
        updateId: ctx.update.update_id,
        chatId: ctx.chat?.id,
        fromId: ctx.from?.id,
        hasText: typeof messageText === "string" && messageText.length > 0,
        textLength: typeof messageText === "string" ? messageText.length : 0,
    };
}

export function createLoggingMiddleware(logger: Pick<AppLogger, "info">): MiddlewareFn {
    return async (ctx, next) => {
        logTelegramUpdate(logger as AppLogger, {
            ...buildIncomingUpdateLogFields(ctx),
        }, "incoming update");

        return next();
    };
}
