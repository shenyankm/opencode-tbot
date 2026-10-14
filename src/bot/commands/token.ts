import type { Bot } from "grammy";
import { getSafeChatCopy } from "../i18n.js";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
import { presentError } from "../presenters/error.presenter.js";
import { formatContextFooter } from "../../services/telegram/telegram-format.js";
import type { BotDependencies, TokenFeatureDependencies } from "../types.js";
import type { TelegramCommandDefinition } from "./registry.js";

interface TokenCommandContext {
    chat: { id: number };
    reply(text: string, other?: { reply_markup?: unknown }): Promise<unknown>;
}

export async function handleTokenCommand(ctx: TokenCommandContext, dependencies: TokenFeatureDependencies) {
    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);

    try {
        const context = await dependencies.contextFooter?.read(ctx.chat.id);
        await ctx.reply(formatContextFooter(context, copy));
    } catch (error) {
        dependencies.logger.error({ error }, "failed to show context usage");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerTokenCommand(bot: Pick<Bot, "command">, dependencies: BotDependencies) {
    bot.command("token", async (ctx) => {
        await handleTokenCommand(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}

export const TOKEN_COMMAND_DEFINITION: TelegramCommandDefinition = {
    describe(copy) {
        return copy.commands.token;
    },
    names: ["token"],
    register: registerTokenCommand,
};
