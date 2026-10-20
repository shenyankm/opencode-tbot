import type { Transformer } from "grammy";

export function isChatAuthorized(allowedChatIds: readonly number[], chatId: number | undefined): boolean {
    return chatId !== undefined && allowedChatIds.includes(chatId);
}

export function telegramAuthorization(allowedChatIds: readonly number[]): Transformer {
    return async (previous, method, payload, signal) => {
        if ("chat_id" in payload && !isChatAuthorized(allowedChatIds, Number(payload.chat_id))) {
            throw new Error("Telegram chat is no longer authorized.");
        }
        return previous(method, payload, signal);
    };
}
