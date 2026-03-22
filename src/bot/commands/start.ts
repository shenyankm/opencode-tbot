import type { Bot } from "grammy";
import { buildTelegramStaticReply } from "../../services/telegram/telegram-format.js";
import { getSafeChatCopy } from "../i18n.js";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentStartMarkdownMessage } from "../presenters/static.presenter.js";
import type { BotDependencies } from "../types.js";

interface StartCommandContext {
    chat?: { id: number };
    reply(
        text: string,
        other?: {
            parse_mode: "MarkdownV2";
        },
    ): Promise<unknown>;
}

export async function handleStartCommand(ctx: StartCommandContext, dependencies: BotDependencies) {
    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat?.id, dependencies.logger);
    const reply = buildTelegramStaticReply(presentStartMarkdownMessage(copy));

    try {
        await ctx.reply(reply.preferred.text, reply.preferred.options);
    } catch (error) {
        if (reply.preferred.options) {
            dependencies.logger.error({ error }, "failed to send start markdown reply, falling back to plain text");
            await ctx.reply(reply.fallback.text);
            return;
        }

        dependencies.logger.error({ error }, "failed to show start message");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerStartCommand(bot: Pick<Bot, "command">, dependencies: BotDependencies) {
    bot.command("start", async (ctx) => {
        await handleStartCommand(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}
