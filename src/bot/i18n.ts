import type { SessionRepository } from "../domain/session/session.repository.js";
import {
    DEFAULT_BOT_LANGUAGE,
    getBotCopy,
    normalizeBotLanguage,
    type BotCopy,
    type BotLanguage,
} from "./copy.js";

export async function getChatLanguage(
    sessionRepo: SessionRepository,
    chatId: number | null | undefined,
): Promise<BotLanguage> {
    if (!chatId) {
        return DEFAULT_BOT_LANGUAGE;
    }

    const binding = await sessionRepo.getByChatId(chatId);

    return normalizeBotLanguage(binding?.language);
}

export async function getChatCopy(
    sessionRepo: SessionRepository,
    chatId: number | null | undefined,
): Promise<BotCopy> {
    return getBotCopy(await getChatLanguage(sessionRepo, chatId));
}

export async function setChatLanguage(
    sessionRepo: SessionRepository,
    chatId: number,
    language: BotLanguage,
): Promise<void> {
    const binding = await sessionRepo.getByChatId(chatId);

    await sessionRepo.setCurrent({
        chatId,
        sessionId: binding?.sessionId ?? null,
        projectId: binding?.projectId ?? null,
        directory: binding?.directory ?? null,
        agentName: binding?.agentName ?? null,
        modelProviderId: binding?.modelProviderId ?? null,
        modelId: binding?.modelId ?? null,
        modelVariant: binding?.modelVariant ?? null,
        language,
        updatedAt: new Date().toISOString(),
    });
}
