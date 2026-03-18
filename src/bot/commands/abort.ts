import type { Bot } from "grammy";
import { BOT_COPY } from "../copy.js";
import { presentError } from "../presenters/error.presenter.js";
import type { BotDependencies } from "../types.js";

interface AbortCommandContext {
    chat: { id: number };
    reply(text: string): Promise<unknown>;
}

export async function handleAbortCommand(ctx: AbortCommandContext, dependencies: BotDependencies) {
    try {
        const result = await dependencies.abortPromptUseCase.execute({
            chatId: ctx.chat.id,
        });

        if (result.status === "no_session") {
            await ctx.reply(BOT_COPY.abort.noSession);
            return;
        }

        if (result.status === "not_running") {
            await ctx.reply(BOT_COPY.abort.notRunning);
            return;
        }

        await ctx.reply(BOT_COPY.abort.aborted);
    } catch (error) {
        dependencies.logger.error({ error }, "failed to abort current prompt");
        await ctx.reply(presentError(error));
    }
}

export function registerAbortCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("abort", async (ctx) => {
        await handleAbortCommand(ctx, dependencies);
    });
}
