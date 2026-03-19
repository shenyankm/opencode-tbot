import type { Bot } from "grammy";
import { getChatCopy } from "../i18n.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentStatusMessage } from "../presenters/message.presenter.js";
import type { BotDependencies } from "../types.js";

interface StatusCommandContext {
    chat?: { id: number };
    reply(text: string): Promise<unknown>;
}

export async function handleStatusCommand(ctx: StatusCommandContext, dependencies: BotDependencies) {
    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat?.id);

    try {
        const result = await dependencies.getStatusUseCase.execute({
            chatId: ctx.chat?.id ?? 0,
        });

        await ctx.reply(presentStatusMessage(result, copy));
    } catch (error) {
        dependencies.logger.error({ error }, "failed to fetch system status");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerStatusCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("status", async (ctx) => {
        await handleStatusCommand(ctx, dependencies);
    });
}
