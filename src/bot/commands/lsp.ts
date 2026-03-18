import type { Bot } from "grammy";
import { getChatCopy } from "../i18n.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentLspMessage } from "../presenters/message.presenter.js";
import type { BotDependencies } from "../types.js";

interface LspCommandContext {
    chat: { id: number };
    reply(text: string): Promise<unknown>;
}

export async function handleLspCommand(ctx: LspCommandContext, dependencies: BotDependencies) {
    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat.id);

    try {
        const result = await dependencies.listLspUseCase.execute({
            chatId: ctx.chat.id,
        });

        await ctx.reply(presentLspMessage(result, copy));
    } catch (error) {
        dependencies.logger.error({ error }, "failed to list lsp servers");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerLspCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("lsp", async (ctx) => {
        await handleLspCommand(ctx, dependencies);
    });
}
