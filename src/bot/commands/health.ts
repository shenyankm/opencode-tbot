import type { Bot } from "grammy";
import { getChatCopy } from "../i18n.js";
import type { BotDependencies } from "../types.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentHealthMessage } from "../presenters/message.presenter.js";

interface HealthCommandContext {
    chat?: { id: number };
    reply(text: string): Promise<unknown>;
}

export async function handleHealthCommand(ctx: HealthCommandContext, dependencies: BotDependencies) {
    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat?.id);

    try {
        const result = await dependencies.getHealthUseCase.execute();

        await ctx.reply(presentHealthMessage(result, copy));
    } catch (error) {
        dependencies.logger.error({ error }, "failed to fetch health status");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerHealthCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("health", async (ctx) => {
        await handleHealthCommand(ctx, dependencies);
    });
}
