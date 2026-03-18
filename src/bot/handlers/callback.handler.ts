import type { Bot } from "grammy";
import type { BotDependencies, ProjectsCallbackData } from "../types.js";
import { buildProjectsKeyboard } from "../presenters/keyboard.presenter.js";
import { presentError } from "../presenters/error.presenter.js";
import {
    presentProjectSwitchMessage,
    presentProjectsMessage,
} from "../presenters/message.presenter.js";

const PROJECTS_PAGE_PREFIX = "projects:page:";
const PROJECTS_SELECT_PREFIX = "projects:select:";

interface CallbackContext {
    chat?: { id: number };
    callbackQuery: { data: string };
    answerCallbackQuery(): Promise<unknown>;
    editMessageText(text: string, other?: { reply_markup?: unknown }): Promise<unknown>;
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
                await ctx.editMessageText("暂无可用项目。");
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
                await ctx.editMessageText("项目已失效，请重新执行 /projects。");
                return;
            }

            await ctx.editMessageText(presentProjectSwitchMessage(result.project.worktree));
        }
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle project callback");
        await ctx.editMessageText(presentError(error));
    }
}

export function registerCallbackHandler(bot: Bot, dependencies: BotDependencies) {
    bot.callbackQuery(/^projects:/, async (ctx) => {
        await handleProjectsCallback(ctx, dependencies);
    });
}
