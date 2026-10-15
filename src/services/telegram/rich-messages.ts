import type { Transformer } from "grammy";
import type { InputRichMessage } from "grammy/types";

function richContent(text: string, parseMode?: string): InputRichMessage {
    if (parseMode === "HTML") {
        return { html: text };
    }
    if (parseMode === "Markdown") {
        return { markdown: text };
    }
    return { blocks: [{ type: "paragraph", text }] };
}

// Keep grammY context helpers and existing callback IDs while routing all text through Rich Messages.
export function telegramRichMessages(): Transformer {
    return async (previous, method, payload, signal) => {
        if (method !== "sendMessage" && method !== "editMessageText") {
            return previous(method, payload, signal);
        }
        const { text, parse_mode, entities: _entities, link_preview_options: _preview, ...options } = payload as {
            text?: string;
            parse_mode?: string;
            entities?: unknown;
            link_preview_options?: unknown;
            chat_id: number | string;
            rich_message?: InputRichMessage;
        };
        if (options.rich_message || text === undefined) {
            return previous(method, payload, signal);
        }
        const result = await previous(method === "sendMessage" ? "sendRichMessage" : "editMessageText", {
            ...options,
            rich_message: richContent(text, parse_mode),
        }, signal);
        // Callers use message identity only; RichMessage preserves message_id, chat, and callback routing.
        return result as Awaited<ReturnType<typeof previous<typeof method>>>;
    };
}
