import type { Bot } from "grammy";
import type { BotDependencies } from "../types.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentPathMessage } from "../presenters/message.presenter.js";

interface PathCommandContext {
    reply(text: string): Promise<unknown>;
}

export async function handlePathCommand(ctx: PathCommandContext, dependencies: BotDependencies) {
    try {
        const result = await dependencies.getPathUseCase.execute();

        await ctx.reply(presentPathMessage(result));
    } catch (error) {
        dependencies.logger.error({ error }, "failed to fetch current path");
        await ctx.reply(presentError(error));
    }
}

export function registerPathCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("path", async (ctx) => {
        await handlePathCommand(ctx, dependencies);
    });
}
