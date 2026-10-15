import type { Bot } from "grammy";
import { isTelegramFormattingError } from "../../services/telegram/rich-messages.js";
import { buildTelegramStaticReply } from "../../services/telegram/telegram-format.js";
import { getSafeChatCopy } from "../i18n.js";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentStartMarkdownMessage } from "../presenters/static.presenter.js";
import type { BotDependencies, ChatStateDependencies } from "../types.js";
import type { TelegramCommandDefinition } from "./registry.js";

interface StartCommandContext {
    chat?: { id: number };
    reply(
        text: string,
        other?: {
            parse_mode: "Markdown";
        },
    ): Promise<unknown>;
}

export async function handleStartCommand(ctx: StartCommandContext, dependencies: ChatStateDependencies) {
    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat?.id, dependencies.logger);
    const reply = buildTelegramStaticReply(presentStartMarkdownMessage(copy));

    try {
        await ctx.reply(reply.preferred.text, reply.preferred.options);
    } catch (error) {
        if (reply.preferred.options && isTelegramFormattingError(error)) {
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

export const START_COMMAND_DEFINITION: TelegramCommandDefinition = {
    describe(copy) {
        return copy.commands.start;
    },
    names: ["start"],
    register: registerStartCommand,
};
