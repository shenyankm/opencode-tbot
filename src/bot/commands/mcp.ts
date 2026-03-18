import type { Bot } from "grammy";
import { getChatCopy } from "../i18n.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentMcpMessage } from "../presenters/message.presenter.js";
import type { BotDependencies } from "../types.js";

interface McpCommandContext {
    chat: { id: number };
    reply(text: string): Promise<unknown>;
}

export async function handleMcpCommand(ctx: McpCommandContext, dependencies: BotDependencies) {
    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat.id);

    try {
        const result = await dependencies.listMcpUseCase.execute({
            chatId: ctx.chat.id,
        });

        await ctx.reply(presentMcpMessage(result, copy));
    } catch (error) {
        dependencies.logger.error({ error }, "failed to list mcp servers");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerMcpCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("mcp", async (ctx) => {
        await handleMcpCommand(ctx, dependencies);
    });
}
