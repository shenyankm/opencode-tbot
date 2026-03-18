import type { Bot } from "grammy";
import { getChatCopy } from "../i18n.js";
import { presentError } from "../presenters/error.presenter.js";
import type { BotDependencies } from "../types.js";

interface AbortCommandContext {
    chat: { id: number };
    reply(text: string): Promise<unknown>;
}

export async function handleAbortCommand(ctx: AbortCommandContext, dependencies: BotDependencies) {
    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat.id);

    try {
        const result = await dependencies.abortPromptUseCase.execute({
            chatId: ctx.chat.id,
        });

        if (result.status === "no_session") {
            await ctx.reply(copy.abort.noSession);
            return;
        }

        if (result.status === "not_running") {
            await ctx.reply(copy.abort.notRunning);
            return;
        }

        await ctx.reply(copy.abort.aborted);
    } catch (error) {
        dependencies.logger.error({ error }, "failed to abort current prompt");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerAbortCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("abort", async (ctx) => {
        await handleAbortCommand(ctx, dependencies);
    });
}
