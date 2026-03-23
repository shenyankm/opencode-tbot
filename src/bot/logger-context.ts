import type { AppLogger, LogComponent, LoggerContext } from "../infra/logger/index.js";
import type { LoggerDependencies } from "./types.js";

interface TelegramLogContextLike {
    callbackQuery?: { data?: string | null };
    chat?: { id?: number };
    message?: { text?: string | null };
    msg?: { text?: string | null } | null;
    update?: { update_id?: number };
}

export function buildTelegramLoggerContext(
    ctx: TelegramLogContextLike,
    component: LogComponent = "telegram",
): LoggerContext {
    const updateId = typeof ctx.update?.update_id === "number"
        ? ctx.update.update_id
        : undefined;
    const messageText = resolveMessageText(ctx);
    const command = extractTelegramCommand(messageText);
    const callbackData = normalizeTelegramString(ctx.callbackQuery?.data);
    const operationId = typeof updateId === "number"
        ? `telegram-${updateId}`
        : null;

    return {
        component,
        ...(typeof ctx.chat?.id === "number" ? { chatId: ctx.chat.id } : {}),
        ...(typeof updateId === "number" ? { updateId } : {}),
        ...(command ? { command } : {}),
        ...(callbackData ? { callbackData } : {}),
        correlationId: typeof updateId === "number"
            ? String(updateId)
            : operationId,
        operationId,
    };
}

export function scopeLoggerToTelegramContext(
    logger: AppLogger,
    ctx: TelegramLogContextLike,
    component: LogComponent = "telegram",
): AppLogger {
    return logger.child(buildTelegramLoggerContext(ctx, component));
}

export function scopeDependenciesToTelegramContext<TDependencies extends LoggerDependencies>(
    dependencies: TDependencies,
    ctx: TelegramLogContextLike,
    component: LogComponent = "telegram",
): TDependencies {
    return {
        ...dependencies,
        logger: scopeLoggerToTelegramContext(dependencies.logger, ctx, component),
    };
}

function resolveMessageText(ctx: TelegramLogContextLike): string | null {
    return normalizeTelegramString(ctx.message?.text)
        ?? normalizeTelegramString(ctx.msg?.text);
}

function extractTelegramCommand(value: string | null): string | null {
    if (!value || !value.startsWith("/")) {
        return null;
    }

    const token = value.split(/\s+/u, 1)[0]?.trim();

    if (!token) {
        return null;
    }

    return token.replace(/^\/+/u, "").split("@", 1)[0] ?? null;
}

function normalizeTelegramString(value: string | null | undefined): string | null {
    return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : null;
}
