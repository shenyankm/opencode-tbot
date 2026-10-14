import { InlineKeyboard, type Bot } from "grammy";
import { getSafeChatCopy } from "../../i18n.js";
import { scopeDependenciesToTelegramContext } from "../../logger-context.js";
import { presentError } from "../../presenters/error.presenter.js";
import { formatContextFooter } from "../../../services/telegram/telegram-format.js";
import type {
    BotDependencies,
    TokenCallbackData,
    TokenFeatureDependencies,
} from "../../types.js";
import type { CallbackContext } from "./callback-context.js";

export async function handleTokenCallback(ctx: CallbackContext, dependencies: TokenFeatureDependencies) {
    const data = ctx.callbackQuery.data as TokenCallbackData;

    if (!data.startsWith("token:")) {
        return;
    }

    if (!ctx.chat) {
        await ctx.answerCallbackQuery();
        return;
    }

    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);

    try {
        await ctx.answerCallbackQuery();
        const context = await dependencies.contextFooter?.read(ctx.chat.id);
        await ctx.editMessageText(formatContextFooter(context, copy), { reply_markup: new InlineKeyboard() });
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle token callback");
        await ctx.editMessageText(presentError(error, copy));
    }
}

export function registerTokenCallbackRoute(
    bot: Pick<Bot, "callbackQuery">,
    dependencies: BotDependencies,
): void {
    bot.callbackQuery(/^token:/, async (ctx) => {
        await handleTokenCallback(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}
