import type { Bot } from "grammy";
import { getSafeChatCopy } from "../../i18n.js";
import { scopeDependenciesToTelegramContext } from "../../logger-context.js";
import { buildTokenSettingsKeyboard } from "../../presenters/keyboard.presenter.js";
import { presentError } from "../../presenters/error.presenter.js";
import { presentTokenSettingsMessage } from "../../presenters/message.presenter.js";
import type {
    BotDependencies,
    TokenCallbackData,
    TokenFeatureDependencies,
} from "../../types.js";
import type { CallbackContext } from "./callback-context.js";

const TOKEN_BREAKDOWN_PREFIX = "token:breakdown:";

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
        if (!data.startsWith(TOKEN_BREAKDOWN_PREFIX)) {
            const settings = await dependencies.getTokenSettingsUseCase.execute();
            await ctx.answerCallbackQuery();
            await ctx.editMessageText(
                presentTokenSettingsMessage(settings.showBreakdown, copy),
                {
                    reply_markup: buildTokenSettingsKeyboard(settings.showBreakdown, copy),
                },
            );
            return;
        }

        const showBreakdown = data === "token:breakdown:on";
        const result = await dependencies.toggleTokenSettingUseCase.execute({ showBreakdown });

        await ctx.answerCallbackQuery();
        await ctx.editMessageText(
            presentTokenSettingsMessage(result.showBreakdown, copy),
            {
                reply_markup: buildTokenSettingsKeyboard(result.showBreakdown, copy),
            },
        );
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle token callback");
        await ctx.answerCallbackQuery();
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
