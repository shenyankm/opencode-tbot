import { GrammyError, type Bot } from "grammy";
import type { InlineKeyboardMarkup } from "grammy/types";
import {
    getSafeChatCopy,
} from "../../i18n.js";
import { scopeDependenciesToTelegramContext } from "../../logger-context.js";
import {
    buildModelsKeyboard,
    buildModelVariantsKeyboard,
    getModelCallbackKey,
    getVariantCallbackKey,
} from "../../presenters/keyboard.presenter.js";
import { presentError } from "../../presenters/error.presenter.js";
import {
    getModelVariants,
    presentModelsMessage,
    presentModelSwitchMessage,
    presentModelVariantsMessage,
} from "../../presenters/message.presenter.js";
import type {
    BotDependencies,
    ModelCallbackData,
    ModelsFeatureDependencies,
} from "../../types.js";
import type { CallbackContext } from "./callback-context.js";

const MODEL_PAGE_PREFIX = "model:page:";
const MODEL_PICK_PREFIX = "model:pick:";
const MODEL_VARIANT_PREFIX = "model:variant:";

interface ModelsCallbackContext extends Omit<CallbackContext, "editMessageText"> {
    editMessageText(text: string, other?: { reply_markup?: InlineKeyboardMarkup; parse_mode?: "HTML" }): Promise<unknown>;
}

export async function handleModelsCallback(ctx: ModelsCallbackContext, dependencies: ModelsFeatureDependencies) {
    const data = ctx.callbackQuery.data as ModelCallbackData;

    if (!data.startsWith("model:")) {
        return;
    }

    await ctx.answerCallbackQuery();

    if (!ctx.chat) {
        return;
    }

    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);

    try {
        if (data.startsWith(MODEL_PAGE_PREFIX)) {
            const requestedPage = Number(data.slice(MODEL_PAGE_PREFIX.length));
            const result = await dependencies.listModelsUseCase.execute({
                chatId: ctx.chat.id,
            });

            if (result.models.length === 0) {
                await ctx.editMessageText(copy.models.none);
                return;
            }

            const selected = result.models.find((model) => model.id === result.currentModelId && model.providerID === result.currentModelProviderId);
            const { keyboard, page } = buildModelsKeyboard(result.models, requestedPage, copy, selected);

            const reply = presentModelsMessage({
                currentModelId: result.currentModelId,
                currentModelProviderId: result.currentModelProviderId,
                currentModelVariant: result.currentModelVariant,
                models: result.models,
                page: page.page,
            }, copy);
            try {
                await ctx.editMessageText(reply.preferred.text, { ...reply.preferred.options, reply_markup: keyboard });
            } catch (error) {
                if (!(error instanceof GrammyError) || error.error_code !== 400) {
                    throw error;
                }
                await ctx.editMessageText(reply.fallback.text, { reply_markup: keyboard });
            }

            return;
        }

        if (data.startsWith(MODEL_PICK_PREFIX)) {
            const modelKey = data.slice(MODEL_PICK_PREFIX.length);
            const result = await dependencies.listModelsUseCase.execute({
                chatId: ctx.chat.id,
            });
            const matches = result.models.filter((candidate) => getModelCallbackKey(candidate) === modelKey);
            const model = matches.length === 1 ? matches[0] : undefined;

            if (!model) {
                await ctx.editMessageText(copy.models.expired);
                return;
            }

            const variants = getModelVariants(model);

            if (variants.length === 0) {
                const switchResult = await dependencies.switchModelUseCase.execute({
                    chatId: ctx.chat.id,
                    providerId: model.providerID,
                    modelId: model.id,
                });

                if (!switchResult.found) {
                    await ctx.editMessageText(copy.models.expired);
                    return;
                }

                await ctx.editMessageText(presentModelSwitchMessage(switchResult.model, switchResult.variant, copy));
                await dependencies.contextFooter?.refreshChat(ctx.chat.id);
                return;
            }

            await ctx.editMessageText(
                presentModelVariantsMessage(model, result.models.indexOf(model) + 1, copy),
                {
                    reply_markup: buildModelVariantsKeyboard(variants, model),
                },
            );

            return;
        }

        if (data.startsWith(MODEL_VARIANT_PREFIX)) {
            const suffix = data.slice(MODEL_VARIANT_PREFIX.length);
            const [modelKey, variantKey] = suffix.split(":");
            const result = await dependencies.listModelsUseCase.execute({
                chatId: ctx.chat.id,
            });
            const matches = result.models.filter((candidate) => getModelCallbackKey(candidate) === modelKey);
            const model = matches.length === 1 ? matches[0] : undefined;

            if (!model) {
                await ctx.editMessageText(copy.models.expired);
                return;
            }

            const variants = getModelVariants(model);
            const matchingVariants = variants.filter((candidate) => getVariantCallbackKey(candidate) === variantKey);
            const variant = matchingVariants.length === 1 ? matchingVariants[0] : undefined;

            if (!variant) {
                await ctx.editMessageText(copy.models.reasoningLevelExpired);
                return;
            }

            const switchResult = await dependencies.switchModelUseCase.execute({
                chatId: ctx.chat.id,
                providerId: model.providerID,
                modelId: model.id,
                variant,
            });

            if (!switchResult.found) {
                await ctx.editMessageText(copy.models.expired);
                return;
            }

            await ctx.editMessageText(presentModelSwitchMessage(switchResult.model, switchResult.variant, copy));
            await dependencies.contextFooter?.refreshChat(ctx.chat.id);
        }
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle model callback");
        await ctx.editMessageText(presentError(error, copy));
    }
}

export function registerModelsCallbackRoute(
    bot: Pick<Bot, "callbackQuery">,
    dependencies: BotDependencies,
): void {
    bot.callbackQuery(/^model:/, async (ctx) => {
        await handleModelsCallback(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}
