import type { Bot } from "grammy";
import {
    getSafeChatCopy,
} from "../../i18n.js";
import { scopeDependenciesToTelegramContext } from "../../logger-context.js";
import { buildAgentsKeyboard } from "../../presenters/keyboard.presenter.js";
import { presentError } from "../../presenters/error.presenter.js";
import {
    presentAgentsMessage,
    presentAgentSwitchMessage,
} from "../../presenters/message.presenter.js";
import type {
    AgentsCallbackData,
    AgentsFeatureDependencies,
    BotDependencies,
} from "../../types.js";
import type { CallbackContext } from "./callback-context.js";

const AGENTS_PAGE_PREFIX = "agents:page:";
const AGENTS_SELECT_PREFIX = "agents:select:";

export async function handleAgentsCallback(ctx: CallbackContext, dependencies: AgentsFeatureDependencies) {
    const data = ctx.callbackQuery.data as AgentsCallbackData;

    if (!data.startsWith("agents:")) {
        return;
    }

    await ctx.answerCallbackQuery();

    if (!ctx.chat) {
        return;
    }

    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);

    try {
        if (data.startsWith(AGENTS_PAGE_PREFIX)) {
            const requestedPage = Number(data.slice(AGENTS_PAGE_PREFIX.length));
            const result = await dependencies.listAgentsUseCase.execute({
                chatId: ctx.chat.id,
            });

            if (result.agents.length === 0) {
                await ctx.editMessageText(copy.agents.none);
                return;
            }

            const { keyboard, page } = buildAgentsKeyboard(result.agents, requestedPage, copy);

            await ctx.editMessageText(
                presentAgentsMessage({
                    agents: result.agents,
                    currentAgentName: result.currentAgentName,
                    page: page.page,
                }, copy),
                {
                    reply_markup: keyboard,
                },
            );

            return;
        }

        if (data.startsWith(AGENTS_SELECT_PREFIX)) {
            const agentIndex = Number(data.slice(AGENTS_SELECT_PREFIX.length));
            const result = await dependencies.listAgentsUseCase.execute({
                chatId: ctx.chat.id,
            });
            const agent = result.agents[agentIndex - 1];

            if (!agent) {
                await ctx.editMessageText(copy.agents.expired);
                return;
            }

            const switchResult = await dependencies.switchAgentUseCase.execute({
                chatId: ctx.chat.id,
                agentName: agent.name,
            });

            if (!switchResult.found) {
                await ctx.editMessageText(copy.agents.expired);
                return;
            }

            await ctx.editMessageText(presentAgentSwitchMessage(switchResult.agent, copy));
            await dependencies.contextFooter?.refreshChat(ctx.chat.id);
        }
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle agent callback");
        await ctx.editMessageText(presentError(error, copy));
    }
}

export function registerAgentsCallbackRoute(
    bot: Pick<Bot, "callbackQuery">,
    dependencies: BotDependencies,
): void {
    bot.callbackQuery(/^agents:/, async (ctx) => {
        await handleAgentsCallback(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}
