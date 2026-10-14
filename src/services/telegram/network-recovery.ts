import { HttpError, type Transformer } from "grammy";
import type { AppLogger } from "../../infra/logger/index.js";

const IDEMPOTENT_METHODS = new Set([
    "getMe", "getFile", "setMyCommands", "deleteMyCommands",
    "editMessageText", "editMessageReplyMarkup", "sendChatAction",
]);
const CONNECTION_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "TLS_HANDSHAKE_FAILED"]);
interface TelegramAbortSignal {
    readonly aborted: boolean;
    addEventListener(type: "abort", listener: () => void): void;
    removeEventListener(type: "abort", listener: () => void): void;
}

export function telegramNetworkCode(error: unknown): string | null {
    let current: unknown = error instanceof HttpError ? error.error : error;
    for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
        const record = current as Record<string, unknown>;
        if (record.message === "unknown certificate verification error") {
            return "TLS_HANDSHAKE_FAILED";
        }
        if (typeof record.code === "string") {
            return record.code;
        }
        current = record.cause;
    }
    return null;
}

export async function retryTelegramNetworkRequest<T>(
    method: string,
    operation: () => Promise<T>,
    signal?: TelegramAbortSignal,
    logger?: Pick<AppLogger, "warn" | "info">,
): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
        if (signal?.aborted) {
            throw new DOMException("Telegram request aborted", "AbortError");
        }
        try {
            const result = await operation();
            if (attempt > 0) {
                logger?.info({ event: "telegram.network.recovered", method, attempts: attempt + 1 }, "telegram request recovered");
            }
            return result;
        } catch (error) {
            const code = telegramNetworkCode(error);
            // A lost send response may already have delivered the message; only retry pre-connection failures.
            if (!(error instanceof HttpError) || signal?.aborted || attempt >= 3
                || (!IDEMPOTENT_METHODS.has(method) && !CONNECTION_CODES.has(code ?? ""))) {
                if (error instanceof HttpError && !signal?.aborted) {
                    logger?.warn({ event: "telegram.network.failed", method, code, attempts: attempt + 1 }, "telegram network request failed");
                }
                throw error;
            }
            const retryInMs = 1_000 * 2 ** attempt;
            logger?.warn({ event: "telegram.network.retry", method, code, attempt: attempt + 1, retryInMs }, "retrying telegram network request");
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => {
                    signal?.removeEventListener("abort", abort);
                    resolve();
                }, retryInMs);
                const abort = () => {
                    clearTimeout(timer);
                    signal?.removeEventListener("abort", abort);
                    reject(new DOMException("Telegram request aborted", "AbortError"));
                };
                signal?.addEventListener("abort", abort);
                if (signal?.aborted) { abort(); }
            });
        }
    }
}

export function telegramNetworkRecovery(logger: Pick<AppLogger, "warn" | "info">): Transformer {
    return async (previous, method, payload, signal) => {
        // getMe validation and long polling own their retry loops.
        if (method === "getMe" || method === "getUpdates") {
            return previous(method, payload, signal);
        }
        const result = await retryTelegramNetworkRequest(method, () => previous(method, payload, signal), signal, logger);
        type Response = typeof result;
        if (!result.ok && result.error_code === 400 && method.startsWith("editMessage")
            && result.description.includes("message is not modified")) {
            return { ok: true, result: true } as Response;
        }
        return result;
    };
}
