import type { Bot } from "grammy";
import { isBotLanguage } from "../copy.js";
import {
    getSafeChatCopy,
    getSafeChatLanguage,
    setChatLanguage,
} from "../i18n.js";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
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
    const language = await getSafeChatLanguage(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);
    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);

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
    | { found: false; copy: Awaited<ReturnType<typeof getSafeChatCopy>> }
    | {
        found: true;
        copy: Awaited<ReturnType<typeof getSafeChatCopy>>;
        language: Awaited<ReturnType<typeof getSafeChatLanguage>>;
    }
> {
    const currentCopy = await getSafeChatCopy(dependencies.sessionRepo, chatId, dependencies.logger);

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
        copy: await getSafeChatCopy(dependencies.sessionRepo, chatId, dependencies.logger),
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
            keyboard: buildLanguageKeyboard(
                await getSafeChatLanguage(dependencies.sessionRepo, chatId, dependencies.logger),
                result.copy,
            ),
        };
    }

    return {
        found: true as const,
        copy: result.copy,
        text: presentLanguageSwitchMessage(result.language, result.copy),
        keyboard: buildLanguageKeyboard(result.language, result.copy),
    };
}

export function registerLanguageCommand(bot: Pick<Bot, "command">, dependencies: BotDependencies) {
    bot.command("language", async (ctx) => {
        await handleLanguageCommand(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}
