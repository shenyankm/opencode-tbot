import type { Bot } from "grammy";
import type { BotDependencies } from "../types.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentHealthMessage } from "../presenters/message.presenter.js";

interface HealthCommandContext {
    reply(text: string): Promise<unknown>;
}

export async function handleHealthCommand(ctx: HealthCommandContext, dependencies: BotDependencies) {
    try {
        const result = await dependencies.getHealthUseCase.execute();

        await ctx.reply(presentHealthMessage(result));
    } catch (error) {
        dependencies.logger.error({ error }, "failed to fetch health status");
        await ctx.reply(presentError(error));
    }
}

export function registerHealthCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("health", async (ctx) => {
        await handleHealthCommand(ctx, dependencies);
    });
}
