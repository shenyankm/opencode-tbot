import type { Bot } from "grammy";
import { getChatCopy } from "../i18n.js";
import type { BotDependencies } from "../types.js";

interface StartCommandContext {
    chat?: { id: number };
    reply(text: string): Promise<unknown>;
}

export async function handleStartCommand(ctx: StartCommandContext, dependencies: BotDependencies) {
    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat?.id);

    await ctx.reply(copy.start.lines.join("\n"));
}

export function registerStartCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("start", async (ctx) => {
        await handleStartCommand(ctx, dependencies);
    });
}
