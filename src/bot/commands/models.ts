import type { Bot } from "grammy";
import type { BotDependencies } from "../types.js";
import { buildModelsKeyboard } from "../presenters/keyboard.presenter.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentModelsMessage } from "../presenters/message.presenter.js";

interface ModelsCommandContext {
    chat: { id: number };
    reply(text: string, other?: { reply_markup?: unknown }): Promise<unknown>;
}

export async function handleModelsCommand(ctx: ModelsCommandContext, dependencies: BotDependencies) {
    try {
        const result = await dependencies.listModelsUseCase.execute({
            chatId: ctx.chat.id,
        });

        if (result.models.length === 0) {
            await ctx.reply("暂无已配置模型。");
            return;
        }

        const { keyboard, page } = buildModelsKeyboard(result.models, 0);

        await ctx.reply(
            presentModelsMessage({
                currentModelId: result.currentModelId,
                currentModelProviderId: result.currentModelProviderId,
                currentModelVariant: result.currentModelVariant,
                models: result.models,
                page: page.page,
            }),
            {
                reply_markup: keyboard,
            },
        );
    } catch (error) {
        dependencies.logger.error({ error }, "failed to list configured models");
        await ctx.reply(presentError(error));
    }
}

export function registerModelsCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command(["model", "models"], async (ctx) => {
        await handleModelsCommand(ctx, dependencies);
    });
}
