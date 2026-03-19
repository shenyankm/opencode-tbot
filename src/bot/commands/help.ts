import type { Bot } from "grammy";
import { buildTelegramStaticReply } from "../../services/telegram/telegram-format.js";
import { getChatCopy } from "../i18n.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentHelpMarkdownMessage } from "../presenters/static.presenter.js";
import type { BotDependencies } from "../types.js";

interface HelpCommandContext {
    chat?: { id: number };
    reply(
        text: string,
        other?: {
            parse_mode: "MarkdownV2";
        },
    ): Promise<unknown>;
}

export async function handleHelpCommand(ctx: HelpCommandContext, dependencies: BotDependencies) {
    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat?.id);
    const reply = buildTelegramStaticReply(presentHelpMarkdownMessage(copy));

    try {
        await ctx.reply(reply.preferred.text, reply.preferred.options);
    } catch (error) {
        if (reply.preferred.options) {
            dependencies.logger.error({ error }, "failed to send help markdown reply, falling back to plain text");
            await ctx.reply(reply.fallback.text);
            return;
        }

        dependencies.logger.error({ error }, "failed to show help message");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerHelpCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("help", async (ctx) => {
        await handleHelpCommand(ctx, dependencies);
    });
}
