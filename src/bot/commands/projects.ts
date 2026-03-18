import type { Bot } from "grammy";
import { BOT_COPY } from "../copy.js";
import type { BotDependencies } from "../types.js";
import { buildProjectsKeyboard } from "../presenters/keyboard.presenter.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentProjectsMessage } from "../presenters/message.presenter.js";

interface ProjectsCommandContext {
    chat: { id: number };
    reply(text: string, other?: { reply_markup?: unknown }): Promise<unknown>;
}

export async function handleProjectsCommand(ctx: ProjectsCommandContext, dependencies: BotDependencies) {
    try {
        const result = await dependencies.listProjectsUseCase.execute({
            chatId: ctx.chat.id,
        });

        if (result.projects.length === 0) {
            await ctx.reply(BOT_COPY.projects.none);
            return;
        }

        const { keyboard, page } = buildProjectsKeyboard(result.projects, 0);

        await ctx.reply(
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
    } catch (error) {
        dependencies.logger.error({ error }, "failed to list projects");
        await ctx.reply(presentError(error));
    }
}

export function registerProjectsCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("projects", async (ctx) => {
        await handleProjectsCommand(ctx, dependencies);
    });
}
