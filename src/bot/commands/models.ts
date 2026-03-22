import type { Bot } from "grammy";
import { getSafeChatCopy } from "../i18n.js";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
import type { BotDependencies } from "../types.js";
import { buildModelsKeyboard } from "../presenters/keyboard.presenter.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentModelsMessage } from "../presenters/message.presenter.js";

interface ModelsCommandContext {
    chat: { id: number };
    reply(text: string, other?: { reply_markup?: unknown }): Promise<unknown>;
}

export async function handleModelsCommand(ctx: ModelsCommandContext, dependencies: BotDependencies) {
    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);

    try {
        const result = await dependencies.listModelsUseCase.execute({
            chatId: ctx.chat.id,
        });

        if (result.models.length === 0) {
            await ctx.reply(copy.models.none);
            return;
        }

        const { keyboard, page } = buildModelsKeyboard(result.models, 0, copy);

        await ctx.reply(
            presentModelsMessage({
                currentModelId: result.currentModelId,
                currentModelProviderId: result.currentModelProviderId,
                currentModelVariant: result.currentModelVariant,
                models: result.models,
                page: page.page,
            }, copy),
            {
                reply_markup: keyboard,
            },
        );
    } catch (error) {
        dependencies.logger.error({ error }, "failed to list models");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerModelsCommand(bot: Pick<Bot, "command">, dependencies: BotDependencies) {
    bot.command(["model", "models"], async (ctx) => {
        await handleModelsCommand(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}
