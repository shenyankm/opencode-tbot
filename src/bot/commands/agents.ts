import type { Bot } from "grammy";
import { BOT_COPY } from "../copy.js";
import type { BotDependencies } from "../types.js";
import { buildAgentsKeyboard } from "../presenters/keyboard.presenter.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentAgentsMessage } from "../presenters/message.presenter.js";

interface AgentsCommandContext {
    chat: { id: number };
    reply(text: string, other?: { reply_markup?: unknown }): Promise<unknown>;
}

export async function handleAgentsCommand(ctx: AgentsCommandContext, dependencies: BotDependencies) {
    try {
        const result = await dependencies.listAgentsUseCase.execute({
            chatId: ctx.chat.id,
        });

        if (result.agents.length === 0) {
            await ctx.reply(BOT_COPY.agents.none);
            return;
        }

        const { keyboard, page } = buildAgentsKeyboard(result.agents, 0);

        await ctx.reply(
            presentAgentsMessage({
                agents: result.agents,
                currentAgentName: result.currentAgentName,
                page: page.page,
            }),
            {
                reply_markup: keyboard,
            },
        );
    } catch (error) {
        dependencies.logger.error({ error }, "failed to list agents");
        await ctx.reply(presentError(error));
    }
}

export function registerAgentsCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command(["agents", "agent"], async (ctx) => {
        await handleAgentsCommand(ctx, dependencies);
    });
}
