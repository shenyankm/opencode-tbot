import type { Bot } from "grammy";
import { getSafeChatCopy } from "../i18n.js";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
import type { BotDependencies } from "../types.js";
import { presentError } from "../presenters/error.presenter.js";
import { buildSessionsListView } from "../sessions-menu.js";

interface SessionsCommandContext {
    chat: { id: number };
    reply(text: string, other?: { reply_markup?: unknown }): Promise<unknown>;
}

export async function handleSessionsCommand(ctx: SessionsCommandContext, dependencies: BotDependencies) {
    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);

    try {
        await dependencies.pendingActionRepo.clear(ctx.chat.id);
        const view = await buildSessionsListView(ctx.chat.id, 0, dependencies);

        await ctx.reply(view.text, view.keyboard ? { reply_markup: view.keyboard } : undefined);
    } catch (error) {
        dependencies.logger.error({ error }, "failed to list sessions");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerSessionsCommand(bot: Pick<Bot, "command">, dependencies: BotDependencies) {
    bot.command("sessions", async (ctx) => {
        await handleSessionsCommand(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}
