import type { Bot } from "grammy";
import type { BotDependencies } from "../types.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentConfigMessage } from "../presenters/message.presenter.js";

interface ConfigCommandContext {
    reply(text: string): Promise<unknown>;
}

export async function handleConfigCommand(ctx: ConfigCommandContext, dependencies: BotDependencies) {
    try {
        const result = await dependencies.getConfigUseCase.execute();

        await ctx.reply(presentConfigMessage(result));
    } catch (error) {
        dependencies.logger.error({ error }, "failed to fetch config");
        await ctx.reply(presentError(error));
    }
}

export function registerConfigCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("config", async (ctx) => {
        await handleConfigCommand(ctx, dependencies);
    });
}
