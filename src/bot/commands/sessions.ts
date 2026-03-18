import type { Bot } from "grammy";
import { BOT_COPY } from "../copy.js";
import type { BotDependencies } from "../types.js";
import { buildSessionsKeyboard } from "../presenters/keyboard.presenter.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentSessionsMessage } from "../presenters/message.presenter.js";

interface SessionsCommandContext {
    chat: { id: number };
    reply(text: string, other?: { reply_markup?: unknown }): Promise<unknown>;
}

export async function handleSessionsCommand(ctx: SessionsCommandContext, dependencies: BotDependencies) {
    try {
        const result = await dependencies.listSessionsUseCase.execute({
            chatId: ctx.chat.id,
        });

        if (result.sessions.length === 0) {
            await ctx.reply(BOT_COPY.sessions.none);
            return;
        }

        const { keyboard, page } = buildSessionsKeyboard(result.sessions, 0);

        await ctx.reply(
            presentSessionsMessage({
                sessions: result.sessions,
                currentDirectory: result.currentDirectory,
                currentSessionId: result.currentSessionId,
                page: page.page,
            }),
            {
                reply_markup: keyboard,
            },
        );
    } catch (error) {
        dependencies.logger.error({ error }, "failed to list sessions");
        await ctx.reply(presentError(error));
    }
}

export function registerSessionsCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("sessions", async (ctx) => {
        await handleSessionsCommand(ctx, dependencies);
    });
}
