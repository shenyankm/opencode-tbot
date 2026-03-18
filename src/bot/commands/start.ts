import type { Bot } from "grammy";

export function registerStartCommand(bot: Bot) {
    bot.command("start", async (ctx) => {
        await ctx.reply(
            [
                "opencode-tbot 已启动。",
                "",
                "直接发送一段文本，我会转发给 OpenCode 并回复结果。",
            ].join("\n"),
        );
    });
}