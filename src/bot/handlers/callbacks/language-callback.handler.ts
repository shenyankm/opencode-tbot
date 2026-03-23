import type { Bot } from "grammy";
import {
    getSafeChatCopy,
    getSafeChatLanguage,
} from "../../i18n.js";
import { presentLanguageSwitchForChat } from "../../commands/language.js";
import { scopeDependenciesToTelegramContext } from "../../logger-context.js";
import { buildLanguageKeyboard } from "../../presenters/keyboard.presenter.js";
import { presentError } from "../../presenters/error.presenter.js";
import { presentLanguageMessage } from "../../presenters/message.presenter.js";
import type {
    BotDependencies,
    ChatStateDependencies,
    LanguageCallbackData,
} from "../../types.js";
import type { CallbackContext } from "./callback-context.js";

const LANGUAGE_SELECT_PREFIX = "language:select:";

export async function handleLanguageCallback(ctx: CallbackContext, dependencies: ChatStateDependencies) {
    const data = ctx.callbackQuery.data as LanguageCallbackData;

    if (!data.startsWith("language:")) {
        return;
    }

    await ctx.answerCallbackQuery();

    if (!ctx.chat || !ctx.api) {
        return;
    }

    const currentCopy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);

    try {
        if (!data.startsWith(LANGUAGE_SELECT_PREFIX)) {
            await ctx.editMessageText(
                presentLanguageMessage(
                    await getSafeChatLanguage(dependencies.sessionRepo, ctx.chat.id, dependencies.logger),
                    currentCopy,
                ),
                {
                    reply_markup: buildLanguageKeyboard(
                        await getSafeChatLanguage(dependencies.sessionRepo, ctx.chat.id, dependencies.logger),
                        currentCopy,
                    ),
                },
            );
            return;
        }

        const selectedLanguage = data.slice(LANGUAGE_SELECT_PREFIX.length);
        const result = await presentLanguageSwitchForChat(ctx.chat.id, ctx.api, selectedLanguage, dependencies);

        await ctx.editMessageText(result.text, {
            reply_markup: result.keyboard,
        });
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle language callback");
        await ctx.editMessageText(presentError(error, currentCopy));
    }
}

export function registerLanguageCallbackRoute(
    bot: Pick<Bot, "callbackQuery">,
    dependencies: BotDependencies,
): void {
    bot.callbackQuery(/^language:/, async (ctx) => {
        await handleLanguageCallback(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}
