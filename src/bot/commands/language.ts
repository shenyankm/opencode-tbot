import type { Bot } from "grammy";
import { isBotLanguage } from "../copy.js";
import { getChatCopy, getChatLanguage, setChatLanguage } from "../i18n.js";
import { buildLanguageKeyboard } from "../presenters/keyboard.presenter.js";
import { presentError } from "../presenters/error.presenter.js";
import {
    presentLanguageMessage,
    presentLanguageSwitchMessage,
} from "../presenters/message.presenter.js";
import { syncTelegramCommandsForChat } from "./sync-commands.js";
import type { BotDependencies } from "../types.js";

interface LanguageCommandContext {
    chat: { id: number };
    api: Pick<Bot["api"], "setMyCommands">;
    reply(text: string, other?: { reply_markup?: unknown }): Promise<unknown>;
}

export async function handleLanguageCommand(ctx: LanguageCommandContext, dependencies: BotDependencies) {
    const language = await getChatLanguage(dependencies.sessionRepo, ctx.chat.id);
    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat.id);

    try {
        await syncTelegramCommandsForChat(ctx.api, ctx.chat.id, language);
        await ctx.reply(
            presentLanguageMessage(language, copy),
            {
                reply_markup: buildLanguageKeyboard(language, copy),
            },
        );
    } catch (error) {
        dependencies.logger.error({ error }, "failed to show language options");
        await ctx.reply(presentError(error, copy));
    }
}

export async function switchLanguageForChat(
    api: Pick<Bot["api"], "setMyCommands">,
    chatId: number,
    language: string,
    dependencies: BotDependencies,
): Promise<
    | { found: false; copy: Awaited<ReturnType<typeof getChatCopy>> }
    | {
        found: true;
        copy: Awaited<ReturnType<typeof getChatCopy>>;
        language: Awaited<ReturnType<typeof getChatLanguage>>;
    }
> {
    const currentCopy = await getChatCopy(dependencies.sessionRepo, chatId);

    if (!isBotLanguage(language)) {
        return {
            found: false,
            copy: currentCopy,
        };
    }

    await setChatLanguage(dependencies.sessionRepo, chatId, language);
    await syncTelegramCommandsForChat(api, chatId, language);

    return {
        found: true,
        copy: await getChatCopy(dependencies.sessionRepo, chatId),
        language,
    };
}

export async function presentLanguageSwitchForChat(
    chatId: number,
    api: Pick<Bot["api"], "setMyCommands">,
    language: string,
    dependencies: BotDependencies,
) {
    const result = await switchLanguageForChat(api, chatId, language, dependencies);

    if (!result.found) {
        return {
            found: false as const,
            copy: result.copy,
            text: result.copy.language.expired,
            keyboard: buildLanguageKeyboard(await getChatLanguage(dependencies.sessionRepo, chatId), result.copy),
        };
    }

    return {
        found: true as const,
        copy: result.copy,
        text: presentLanguageSwitchMessage(result.language, result.copy),
        keyboard: buildLanguageKeyboard(result.language, result.copy),
    };
}

export function registerLanguageCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("language", async (ctx) => {
        await handleLanguageCommand(ctx, dependencies);
    });
}
