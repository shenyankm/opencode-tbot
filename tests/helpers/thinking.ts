import type { ThinkingMessage } from "../../src/domain/thinking/thinking-message.entity.js";
import type { ThinkingMessageRepository } from "../../src/domain/thinking/thinking-message.repository.js";
import { TelegramThinkingMessages } from "../../src/services/telegram/thinking-messages.js";

export function createThinkingMessages() {
    const messages = new Map<string, ThinkingMessage>();
    const repository: ThinkingMessageRepository = {
        async get(chatId, messageId) { return structuredClone(messages.get(`${chatId}:${messageId}`) ?? null); },
        async set(message) { messages.set(`${message.chatId}:${message.messageId}`, structuredClone(message)); },
        async delete(chatId, messageId) { messages.delete(`${chatId}:${messageId}`); },
    };
    return { messages, repository, service: new TelegramThinkingMessages(repository) };
}
