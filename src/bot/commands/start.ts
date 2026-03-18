import type { Bot } from "grammy";
import { BOT_COPY } from "../copy.js";

export function registerStartCommand(bot: Bot) {
    bot.command("start", async (ctx) => {
        await ctx.reply(BOT_COPY.start.lines.join("\n"));
    });
}
