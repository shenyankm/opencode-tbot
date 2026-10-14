import type { Bot } from "grammy";
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

export async function handleModelsCallback(ctx: CallbackContext, dependencies: ModelsFeatureDependencies) {
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

            const { keyboard, page } = buildModelsKeyboard(result.models, requestedPage, copy);

            await ctx.editMessageText(
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
