import type { AppLogger } from "../infra/logger/index.js";
import { buildTelegramLoggerContext } from "./logger-context.js";
import { BOT_COPY } from "./copy.js";
import { presentError } from "./presenters/error.presenter.js";

export function extractTelegramUpdateContext(
    ctx: object,
): {
    callbackData?: string;
    chatId?: number;
    command?: string;
    correlationId?: string | null;
    operationId?: string | null;
    updateId?: number;
} {
    return buildTelegramLoggerContext({
        callbackQuery: {
            data: getNestedString(ctx, ["callbackQuery", "data"]),
        },
        chat: {
            id: getNestedNumber(ctx, ["chat", "id"]) ?? undefined,
        },
        message: {
            text: getNestedString(ctx, ["message", "text"]),
        },
        update: {
            update_id: getNestedNumber(ctx, ["update", "update_id"]) ?? undefined,
        },
    });
}

export async function replyWithDefaultTelegramError(
    ctx: object,
    logger: AppLogger,
    error: unknown,
): Promise<void> {
    const text = presentError(error, BOT_COPY);
    const editMessageText = getFunction(ctx, "editMessageText");
    const reply = getFunction(ctx, "reply");
    const callbackData = getNestedString(ctx, ["callbackQuery", "data"]);

    try {
        if (typeof callbackData === "string" && editMessageText) {
            await editMessageText.call(ctx, text);
            return;
        }

        if (reply) {
            await reply.call(ctx, text);
        }
    } catch (replyError) {
        logger.warn?.(
            {
                ...extractTelegramUpdateContext(ctx),
                error: replyError,
            },
            "failed to deliver fallback Telegram error message",
        );
    }
}

function getFunction(value: object, key: string): ((...args: unknown[]) => Promise<unknown>) | null {
    if (!(key in value)) {
        return null;
    }

    const candidate = (value as Record<string, unknown>)[key];

    return typeof candidate === "function"
        ? candidate as (...args: unknown[]) => Promise<unknown>
        : null;
}

function getNestedNumber(value: object, path: string[]): number | null {
    const candidate = getNestedValue(value, path);

    return typeof candidate === "number" ? candidate : null;
}

function getNestedString(value: object, path: string[]): string | null {
    const candidate = getNestedValue(value, path);

    return typeof candidate === "string" ? candidate : null;
}

function getNestedValue(value: object, path: string[]): unknown {
    let current: unknown = value;

    for (const segment of path) {
        if (!current || typeof current !== "object" || !(segment in current)) {
            return null;
        }

        current = (current as Record<string, unknown>)[segment];
    }

    return current;
}
