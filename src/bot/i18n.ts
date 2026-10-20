import { emptyBinding } from "../use-cases/binding-update.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { AppLogger } from "../infra/logger/index.js";
import {
    BOT_COPY,
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

export async function getSafeChatLanguage(
    sessionRepo: SessionRepository,
    chatId: number | null | undefined,
    logger?: Pick<AppLogger, "warn">,
): Promise<BotLanguage> {
    try {
        return await getChatLanguage(sessionRepo, chatId);
    } catch (error) {
        logger?.warn?.(
            {
                error,
                chatId: chatId ?? undefined,
            },
            "failed to resolve Telegram chat language; falling back to the default locale",
        );
        return DEFAULT_BOT_LANGUAGE;
    }
}

export async function getSafeChatCopy(
    sessionRepo: SessionRepository,
    chatId: number | null | undefined,
    logger?: Pick<AppLogger, "warn">,
): Promise<BotCopy> {
    try {
        return getBotCopy(await getSafeChatLanguage(sessionRepo, chatId, logger));
    } catch (error) {
        logger?.warn?.(
            {
                error,
                chatId: chatId ?? undefined,
            },
            "failed to resolve Telegram copy; falling back to the default locale",
        );
        return BOT_COPY;
    }
}

export async function setChatLanguage(
    sessionRepo: SessionRepository,
    chatId: number,
    language: BotLanguage,
): Promise<void> {
    await sessionRepo.update(chatId, (current) => ({
        ...(current ?? emptyBinding(chatId)),
        language,
        updatedAt: new Date().toISOString(),
    }));
}
