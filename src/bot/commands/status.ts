import type { Bot } from "grammy";
import { getSafeChatCopy } from "../i18n.js";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
import { presentError } from "../presenters/error.presenter.js";
import {
    presentStatusMarkdownMessage,
    presentStatusMessage,
} from "../presenters/message.presenter.js";
import { renderMarkdownToTelegramMarkdownV2 } from "../../services/telegram/telegram-format.js";
import type { BotDependencies } from "../types.js";

interface StatusCommandContext {
    chat?: { id: number };
    reply(
        text: string,
        options?: {
            parse_mode: "MarkdownV2";
        },
    ): Promise<unknown>;
}

export async function handleStatusCommand(ctx: StatusCommandContext, dependencies: BotDependencies) {
    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat?.id, dependencies.logger);

    try {
        const result = await dependencies.getStatusUseCase.execute({
            chatId: ctx.chat?.id ?? 0,
        });

        const renderedMarkdown = renderMarkdownToTelegramMarkdownV2(presentStatusMarkdownMessage(result, copy));

        if (renderedMarkdown) {
            await ctx.reply(renderedMarkdown, { parse_mode: "MarkdownV2" });
            return;
        }

        await ctx.reply(presentStatusMessage(result, copy));
    } catch (error) {
        dependencies.logger.error({ error }, "failed to fetch system status");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerStatusCommand(bot: Pick<Bot, "command">, dependencies: BotDependencies) {
    bot.command("status", async (ctx) => {
        await handleStatusCommand(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}
