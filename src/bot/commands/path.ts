import type { Bot } from "grammy";
import { getChatCopy } from "../i18n.js";
import type { BotDependencies } from "../types.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentPathMessage } from "../presenters/message.presenter.js";

interface PathCommandContext {
    chat?: { id: number };
    reply(text: string): Promise<unknown>;
}

export async function handlePathCommand(ctx: PathCommandContext, dependencies: BotDependencies) {
    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat?.id);

    try {
        const result = await dependencies.getPathUseCase.execute();

        await ctx.reply(presentPathMessage(result, copy));
    } catch (error) {
        dependencies.logger.error({ error }, "failed to fetch current path");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerPathCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("path", async (ctx) => {
        await handlePathCommand(ctx, dependencies);
    });
}
