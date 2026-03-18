import type { Bot } from "grammy";
import { BOT_COPY } from "../copy.js";
import type {
    AgentsCallbackData,
    BotDependencies,
    ModelCallbackData,
    ProjectsCallbackData,
} from "../types.js";
import {
    buildAgentsKeyboard,
    buildModelsKeyboard,
    buildModelVariantsKeyboard,
    buildProjectsKeyboard,
} from "../presenters/keyboard.presenter.js";
import { presentError } from "../presenters/error.presenter.js";
import {
    getModelVariants,
    presentAgentsMessage,
    presentAgentSwitchMessage,
    presentModelsMessage,
    presentModelSwitchMessage,
    presentModelVariantsMessage,
    presentProjectsMessage,
    presentProjectSwitchMessage,
} from "../presenters/message.presenter.js";

const AGENTS_PAGE_PREFIX = "agents:page:";
const AGENTS_SELECT_PREFIX = "agents:select:";
const PROJECTS_PAGE_PREFIX = "projects:page:";
const PROJECTS_SELECT_PREFIX = "projects:select:";
const MODEL_PAGE_PREFIX = "model:page:";
const MODEL_PICK_PREFIX = "model:pick:";
const MODEL_VARIANT_PREFIX = "model:variant:";

interface CallbackContext {
    chat?: { id: number };
    callbackQuery: { data: string };
    answerCallbackQuery(): Promise<unknown>;
    editMessageText(text: string, other?: { reply_markup?: unknown }): Promise<unknown>;
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

    try {
        if (data.startsWith(AGENTS_PAGE_PREFIX)) {
            const requestedPage = Number(data.slice(AGENTS_PAGE_PREFIX.length));
            const result = await dependencies.listAgentsUseCase.execute({
                chatId: ctx.chat.id,
            });

            if (result.agents.length === 0) {
                await ctx.editMessageText(BOT_COPY.agents.none);
                return;
            }

            const { keyboard, page } = buildAgentsKeyboard(result.agents, requestedPage);

            await ctx.editMessageText(
                presentAgentsMessage({
                    agents: result.agents,
                    currentAgentName: result.currentAgentName,
                    page: page.page,
                }),
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
                await ctx.editMessageText(BOT_COPY.agents.expired);
                return;
            }

            const switchResult = await dependencies.switchAgentUseCase.execute({
                chatId: ctx.chat.id,
                agentName: agent.name,
            });

            if (!switchResult.found) {
                await ctx.editMessageText(BOT_COPY.agents.expired);
                return;
            }

            await ctx.editMessageText(presentAgentSwitchMessage(switchResult.agent));
        }
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle agent callback");
        await ctx.editMessageText(presentError(error));
    }
}

export async function handleProjectsCallback(ctx: CallbackContext, dependencies: BotDependencies) {
    const data = ctx.callbackQuery.data as ProjectsCallbackData;

    if (!data.startsWith("projects:")) {
        return;
    }

    await ctx.answerCallbackQuery();

    if (!ctx.chat) {
        return;
    }

    try {
        if (data.startsWith(PROJECTS_PAGE_PREFIX)) {
            const requestedPage = Number(data.slice(PROJECTS_PAGE_PREFIX.length));
            const result = await dependencies.listProjectsUseCase.execute({
                chatId: ctx.chat.id,
            });

            if (result.projects.length === 0) {
                await ctx.editMessageText(BOT_COPY.projects.none);
                return;
            }

            const { keyboard, page } = buildProjectsKeyboard(result.projects, requestedPage);

            await ctx.editMessageText(
                presentProjectsMessage({
                    currentDirectory: result.currentDirectory,
                    currentProjectId: result.currentProjectId,
                    page: page.page,
                    projects: result.projects,
                }),
                {
                    reply_markup: keyboard,
                },
            );

            return;
        }

        if (data.startsWith(PROJECTS_SELECT_PREFIX)) {
            const projectId = data.slice(PROJECTS_SELECT_PREFIX.length);
            const result = await dependencies.switchProjectUseCase.execute({
                chatId: ctx.chat.id,
                projectId,
            });

            if (!result.found) {
                await ctx.editMessageText(BOT_COPY.projects.expired);
                return;
            }

            await ctx.editMessageText(presentProjectSwitchMessage(result.project.worktree));
        }
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle project callback");
        await ctx.editMessageText(presentError(error));
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

    try {
        if (data.startsWith(MODEL_PAGE_PREFIX)) {
            const requestedPage = Number(data.slice(MODEL_PAGE_PREFIX.length));
            const result = await dependencies.listModelsUseCase.execute({
                chatId: ctx.chat.id,
            });

            if (result.models.length === 0) {
                await ctx.editMessageText(BOT_COPY.models.none);
                return;
            }

            const { keyboard, page } = buildModelsKeyboard(result.models, requestedPage);

            await ctx.editMessageText(
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

            return;
        }

        if (data.startsWith(MODEL_PICK_PREFIX)) {
            const modelIndex = Number(data.slice(MODEL_PICK_PREFIX.length));
            const result = await dependencies.listModelsUseCase.execute({
                chatId: ctx.chat.id,
            });
            const model = result.models[modelIndex - 1];

            if (!model) {
                await ctx.editMessageText(BOT_COPY.models.expired);
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
                    await ctx.editMessageText(BOT_COPY.models.expired);
                    return;
                }

                await ctx.editMessageText(presentModelSwitchMessage(switchResult.model, switchResult.variant));
                return;
            }

            await ctx.editMessageText(
                presentModelVariantsMessage(model, modelIndex),
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
                await ctx.editMessageText(BOT_COPY.models.expired);
                return;
            }

            const variants = getModelVariants(model);
            const variant = variants[variantIndex - 1];

            if (!variant) {
                await ctx.editMessageText(BOT_COPY.models.reasoningLevelExpired);
                return;
            }

            const switchResult = await dependencies.switchModelUseCase.execute({
                chatId: ctx.chat.id,
                providerId: model.providerID,
                modelId: model.id,
                variant,
            });

            if (!switchResult.found) {
                await ctx.editMessageText(BOT_COPY.models.expired);
                return;
            }

            await ctx.editMessageText(presentModelSwitchMessage(switchResult.model, switchResult.variant));
        }
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle model callback");
        await ctx.editMessageText(presentError(error));
    }
}

export function registerCallbackHandler(bot: Bot, dependencies: BotDependencies) {
    bot.callbackQuery(/^agents:/, async (ctx) => {
        await handleAgentsCallback(ctx, dependencies);
    });

    bot.callbackQuery(/^projects:/, async (ctx) => {
        await handleProjectsCallback(ctx, dependencies);
    });

    bot.callbackQuery(/^model:/, async (ctx) => {
        await handleModelsCallback(ctx, dependencies);
    });
}
