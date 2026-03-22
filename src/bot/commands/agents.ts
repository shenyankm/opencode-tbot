import type { Bot } from "grammy";
import { getSafeChatCopy } from "../i18n.js";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
import type { BotDependencies } from "../types.js";
import { buildAgentsKeyboard } from "../presenters/keyboard.presenter.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentAgentsMessage } from "../presenters/message.presenter.js";

interface AgentsCommandContext {
    chat: { id: number };
    reply(text: string, other?: { reply_markup?: unknown }): Promise<unknown>;
}

export async function handleAgentsCommand(ctx: AgentsCommandContext, dependencies: BotDependencies) {
    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);

    try {
        const result = await dependencies.listAgentsUseCase.execute({
            chatId: ctx.chat.id,
        });

        if (result.agents.length === 0) {
            await ctx.reply(copy.agents.none);
            return;
        }

        const { keyboard, page } = buildAgentsKeyboard(result.agents, 0, copy);

        await ctx.reply(
            presentAgentsMessage({
                agents: result.agents,
                currentAgentName: result.currentAgentName,
                page: page.page,
            }, copy),
            {
                reply_markup: keyboard,
            },
        );
    } catch (error) {
        dependencies.logger.error({ error }, "failed to list agents");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerAgentsCommand(bot: Pick<Bot, "command">, dependencies: BotDependencies) {
    bot.command(["agents", "agent"], async (ctx) => {
        await handleAgentsCommand(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}
