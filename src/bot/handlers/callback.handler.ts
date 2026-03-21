import type { Bot } from "grammy";
import type { PermissionApprovalRepository } from "../../domain/permission/approval.repository.js";
import { getChatCopy, getChatLanguage } from "../i18n.js";
import { presentLanguageSwitchForChat } from "../commands/language.js";
import type {
    AgentsCallbackData,
    BotDependencies,
    LanguageCallbackData,
    ModelCallbackData,
    PermissionApprovalCallbackData,
    SessionsCallbackData,
} from "../types.js";
import {
    buildAgentsKeyboard,
    buildLanguageKeyboard,
    buildModelsKeyboard,
    buildModelVariantsKeyboard,
} from "../presenters/keyboard.presenter.js";
import { presentError } from "../presenters/error.presenter.js";
import {
    getModelVariants,
    presentAgentsMessage,
    presentAgentSwitchMessage,
    presentLanguageMessage,
    presentModelsMessage,
    presentModelSwitchMessage,
    presentModelVariantsMessage,
    presentSessionRenamePromptMessage,
    presentSessionSwitchMessage,
} from "../presenters/message.presenter.js";
import {
    buildSessionActionView,
    buildSessionsListView,
} from "../sessions-menu.js";
import type { OpenCodeClientLike } from "../../services/opencode/opencode.client.js";
import {
    buildPermissionApprovalResolvedMessage,
    parsePermissionApprovalCallbackData,
} from "../../services/permission/telegram-approval.js";

const AGENTS_PAGE_PREFIX = "agents:page:";
const AGENTS_SELECT_PREFIX = "agents:select:";
const SESSIONS_PAGE_PREFIX = "sessions:page:";
const SESSIONS_PICK_PREFIX = "sessions:pick:";
const SESSIONS_SWITCH_PREFIX = "sessions:switch:";
const SESSIONS_RENAME_PREFIX = "sessions:rename:";
const SESSIONS_BACK_PREFIX = "sessions:back:";
const MODEL_PAGE_PREFIX = "model:page:";
const MODEL_PICK_PREFIX = "model:pick:";
const MODEL_VARIANT_PREFIX = "model:variant:";
const LANGUAGE_SELECT_PREFIX = "language:select:";
const PERMISSION_PREFIX = "permission:";

type PermissionApprovalDependencies = BotDependencies & {
    opencodeClient: OpenCodeClientLike;
    permissionApprovalRepo: PermissionApprovalRepository;
};

interface CallbackContext {
    chat?: { id: number };
    callbackQuery: { data: string; message?: { message_id: number } };
    answerCallbackQuery(): Promise<unknown>;
    editMessageText(text: string, other?: { reply_markup?: unknown }): Promise<unknown>;
    api?: Pick<Bot["api"], "setMyCommands">;
}

export async function handleAgentsCallback(ctx: CallbackContext, dependencies: BotDependencies) {
    const data = ctx.callbackQuery.data as AgentsCallbackData;

    if (!data.startsWith("agents:")) {
        return;
    }

    await ctx.answerCallbackQuery();

    if (!ctx.chat) {
        return;
    }

    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat.id);

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
        }
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle agent callback");
        await ctx.editMessageText(presentError(error, copy));
    }
}

export async function handleModelsCallback(ctx: CallbackContext, dependencies: BotDependencies) {
    const data = ctx.callbackQuery.data as ModelCallbackData;

    if (!data.startsWith("model:")) {
        return;
    }

    await ctx.answerCallbackQuery();

    if (!ctx.chat) {
        return;
    }

    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat.id);

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
            const modelIndex = Number(data.slice(MODEL_PICK_PREFIX.length));
            const result = await dependencies.listModelsUseCase.execute({
                chatId: ctx.chat.id,
            });
            const model = result.models[modelIndex - 1];

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
                presentModelVariantsMessage(model, modelIndex, copy),
                {
                    reply_markup: buildModelVariantsKeyboard(variants, modelIndex),
                },
            );

            return;
        }

        if (data.startsWith(MODEL_VARIANT_PREFIX)) {
            const suffix = data.slice(MODEL_VARIANT_PREFIX.length);
            const [modelIndexRaw, variantIndexRaw] = suffix.split(":");
            const modelIndex = Number(modelIndexRaw);
            const variantIndex = Number(variantIndexRaw);
            const result = await dependencies.listModelsUseCase.execute({
                chatId: ctx.chat.id,
            });
            const model = result.models[modelIndex - 1];

            if (!model) {
                await ctx.editMessageText(copy.models.expired);
                return;
            }

            const variants = getModelVariants(model);
            const variant = variants[variantIndex - 1];

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

export async function handleSessionsCallback(ctx: CallbackContext, dependencies: BotDependencies) {
    const data = ctx.callbackQuery.data as SessionsCallbackData;

    if (!data.startsWith("sessions:")) {
        return;
    }

    await ctx.answerCallbackQuery();

    if (!ctx.chat) {
        return;
    }

    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat.id);

    try {
        if (data.startsWith(SESSIONS_PAGE_PREFIX)) {
            const requestedPage = Number(data.slice(SESSIONS_PAGE_PREFIX.length));
            const view = await buildSessionsListView(ctx.chat.id, requestedPage, dependencies);

            await ctx.editMessageText(view.text, view.keyboard ? { reply_markup: view.keyboard } : undefined);

            return;
        }

        if (data.startsWith(SESSIONS_BACK_PREFIX)) {
            const requestedPage = Number(data.slice(SESSIONS_BACK_PREFIX.length));
            const view = await buildSessionsListView(ctx.chat.id, requestedPage, dependencies);

            await ctx.editMessageText(view.text, view.keyboard ? { reply_markup: view.keyboard } : undefined);
            return;
        }

        if (data.startsWith(SESSIONS_PICK_PREFIX)) {
            const target = parseSessionActionTarget(data, SESSIONS_PICK_PREFIX);

            if (!target) {
                await ctx.editMessageText(copy.sessions.expired);
                return;
            }

            const view = await buildSessionActionView(
                ctx.chat.id,
                target.page,
                target.sessionId,
                dependencies,
            );

            if (!view.found) {
                await ctx.editMessageText(copy.sessions.expired);
                return;
            }

            await ctx.editMessageText(view.text, {
                reply_markup: view.keyboard,
            });
            return;
        }

        if (data.startsWith(SESSIONS_SWITCH_PREFIX)) {
            const target = parseSessionActionTarget(data, SESSIONS_SWITCH_PREFIX);

            if (!target) {
                await ctx.editMessageText(copy.sessions.expired);
                return;
            }

            const result = await dependencies.switchSessionUseCase.execute({
                chatId: ctx.chat.id,
                sessionId: target.sessionId,
            });

            if (!result.found) {
                await ctx.editMessageText(copy.sessions.expired);
                return;
            }

            await ctx.editMessageText(presentSessionSwitchMessage(result.session, copy));
            return;
        }

        if (data.startsWith(SESSIONS_RENAME_PREFIX)) {
            const target = parseSessionActionTarget(data, SESSIONS_RENAME_PREFIX);

            if (!target) {
                await ctx.editMessageText(copy.sessions.renameExpired);
                return;
            }

            const view = await buildSessionActionView(
                ctx.chat.id,
                target.page,
                target.sessionId,
                dependencies,
            );

            if (!view.found) {
                await ctx.editMessageText(copy.sessions.renameExpired);
                return;
            }

            const menuMessageId = ctx.callbackQuery.message?.message_id;

            if (typeof menuMessageId !== "number" || !Number.isInteger(menuMessageId)) {
                await ctx.editMessageText(copy.sessions.renameExpired);
                return;
            }

            await dependencies.pendingActionRepo.set({
                chatId: ctx.chat.id,
                kind: "session_rename",
                sessionId: view.session.id,
                menuMessageId,
                returnPage: view.page,
                updatedAt: new Date().toISOString(),
            });

            await ctx.editMessageText(presentSessionRenamePromptMessage(view.session, copy));
        }
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle session callback");
        await ctx.editMessageText(presentError(error, copy));
    }
}

export async function handleLanguageCallback(ctx: CallbackContext, dependencies: BotDependencies) {
    const data = ctx.callbackQuery.data as LanguageCallbackData;

    if (!data.startsWith("language:")) {
        return;
    }

    await ctx.answerCallbackQuery();

    if (!ctx.chat || !ctx.api) {
        return;
    }

    const currentCopy = await getChatCopy(dependencies.sessionRepo, ctx.chat.id);

    try {
        if (!data.startsWith(LANGUAGE_SELECT_PREFIX)) {
            await ctx.editMessageText(
                presentLanguageMessage(await getChatLanguage(dependencies.sessionRepo, ctx.chat.id), currentCopy),
                {
                    reply_markup: buildLanguageKeyboard(
                        await getChatLanguage(dependencies.sessionRepo, ctx.chat.id),
                        currentCopy,
                    ),
                },
            );
            return;
        }

        const selectedLanguage = data.slice(LANGUAGE_SELECT_PREFIX.length);
        const result = await presentLanguageSwitchForChat(ctx.chat.id, ctx.api, selectedLanguage, dependencies);

        await ctx.editMessageText(result.text, {
            reply_markup: result.keyboard,
        });
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle language callback");
        await ctx.editMessageText(presentError(error, currentCopy));
    }
}

export async function handlePermissionApprovalCallback(
    ctx: CallbackContext,
    dependencies: PermissionApprovalDependencies,
) {
    const data = ctx.callbackQuery.data as PermissionApprovalCallbackData;

    if (!data.startsWith(PERMISSION_PREFIX)) {
        return;
    }

    await ctx.answerCallbackQuery();

    if (!ctx.chat) {
        return;
    }

    const parsed = parsePermissionApprovalCallbackData(data);

    if (!parsed) {
        return;
    }

    try {
        const approvals = await dependencies.permissionApprovalRepo.listByRequestId(parsed.requestId);
        const approval = approvals.find((item) => item.chatId === ctx.chat?.id);

        await dependencies.opencodeClient.replyToPermission(
            parsed.requestId,
            parsed.reply,
            undefined,
            approval?.sessionId,
        );

        if (approval) {
            await dependencies.permissionApprovalRepo.set({
                ...approval,
                status: parsed.reply,
                updatedAt: new Date().toISOString(),
            });
        }

        await ctx.editMessageText(buildPermissionApprovalResolvedMessage(parsed.requestId, parsed.reply));
    } catch (error) {
        dependencies.logger.error({ error, requestId: parsed.requestId }, "failed to reply to permission request");
        await ctx.editMessageText("Failed to reply to the permission request.");
    }
}

export function registerCallbackHandler(bot: Bot, dependencies: PermissionApprovalDependencies) {
    bot.callbackQuery(/^agents:/, async (ctx) => {
        await handleAgentsCallback(ctx, dependencies);
    });

    bot.callbackQuery(/^sessions:/, async (ctx) => {
        await handleSessionsCallback(ctx, dependencies);
    });

    bot.callbackQuery(/^model:/, async (ctx) => {
        await handleModelsCallback(ctx, dependencies);
    });

    bot.callbackQuery(/^language:/, async (ctx) => {
        await handleLanguageCallback(ctx, dependencies);
    });

    bot.callbackQuery(/^permission:/, async (ctx) => {
        await handlePermissionApprovalCallback(ctx, dependencies);
    });
}

function parseSessionActionTarget(data: string, prefix: string) {
    const suffix = data.slice(prefix.length);
    const separatorIndex = suffix.indexOf(":");

    if (separatorIndex === -1) {
        return null;
    }

    const page = Number(suffix.slice(0, separatorIndex));
    const sessionId = suffix.slice(separatorIndex + 1).trim();

    if (!Number.isInteger(page) || page < 0 || !sessionId) {
        return null;
    }

    return {
        page,
        sessionId,
    };
}
