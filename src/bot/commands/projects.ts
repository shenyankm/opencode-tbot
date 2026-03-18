import type { Bot } from "grammy";
import { getChatCopy } from "../i18n.js";
import type { BotDependencies } from "../types.js";
import { buildProjectsKeyboard } from "../presenters/keyboard.presenter.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentProjectsMessage } from "../presenters/message.presenter.js";

interface ProjectsCommandContext {
    chat: { id: number };
    reply(text: string, other?: { reply_markup?: unknown }): Promise<unknown>;
}

export async function handleProjectsCommand(ctx: ProjectsCommandContext, dependencies: BotDependencies) {
    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat.id);

    try {
        const result = await dependencies.listProjectsUseCase.execute({
            chatId: ctx.chat.id,
        });

        if (result.projects.length === 0) {
            await ctx.reply(copy.projects.none);
            return;
        }

        const { keyboard, page } = buildProjectsKeyboard(result.projects, 0, copy);

        await ctx.reply(
            presentProjectsMessage({
                currentDirectory: result.currentDirectory,
                currentProjectId: result.currentProjectId,
                page: page.page,
                projects: result.projects,
            }, copy),
            {
                reply_markup: keyboard,
            },
        );
    } catch (error) {
        dependencies.logger.error({ error }, "failed to list projects");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerProjectsCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("projects", async (ctx) => {
        await handleProjectsCommand(ctx, dependencies);
    });
}
