import type { Bot } from "grammy";
import type { InlineKeyboardMarkup } from "grammy/types";
import { isTelegramFormattingError } from "../../services/telegram/rich-messages.js";
import { getSafeChatCopy } from "../i18n.js";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
import type { BotDependencies, ModelsFeatureDependencies } from "../types.js";
import { buildModelsKeyboard } from "../presenters/keyboard.presenter.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentModelsMessage } from "../presenters/message.presenter.js";
import type { TelegramCommandDefinition } from "./registry.js";

interface ModelsCommandContext {
    chat: { id: number };
    reply(text: string, other?: { reply_markup?: InlineKeyboardMarkup; parse_mode?: "HTML" }): Promise<unknown>;
}

export async function handleModelsCommand(ctx: ModelsCommandContext, dependencies: ModelsFeatureDependencies) {
    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);

    try {
        const result = await dependencies.listModelsUseCase.execute({
            chatId: ctx.chat.id,
        });

        if (result.models.length === 0) {
            await ctx.reply(copy.models.none);
            return;
        }

        const selected = result.models.find((model) => model.id === result.currentModelId && model.providerID === result.currentModelProviderId);
        const { keyboard, page } = buildModelsKeyboard(result.models, 0, copy, selected);

        const reply = presentModelsMessage({
            currentModelId: result.currentModelId,
            currentModelProviderId: result.currentModelProviderId,
            currentModelVariant: result.currentModelVariant,
            models: result.models,
            page: page.page,
        }, copy);
        try {
            await ctx.reply(reply.preferred.text, { ...reply.preferred.options, reply_markup: keyboard });
        } catch (error) {
            if (!isTelegramFormattingError(error)) {
                throw error;
            }
            await ctx.reply(reply.fallback.text, { reply_markup: keyboard });
        }
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

export const MODELS_COMMAND_DEFINITION: TelegramCommandDefinition = {
    describe(copy) {
        return copy.commands.model;
    },
    names: ["model", "models"],
    register: registerModelsCommand,
};
