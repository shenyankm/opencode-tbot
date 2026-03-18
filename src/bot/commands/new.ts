import type { Bot } from "grammy";
import { getChatCopy } from "../i18n.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentSessionCreatedMessage } from "../presenters/message.presenter.js";
import type { BotDependencies } from "../types.js";

interface NewCommandContext {
    chat: { id: number };
    message?: { text?: string };
    match?: string;
    reply(text: string): Promise<unknown>;
}

export async function handleNewCommand(ctx: NewCommandContext, dependencies: BotDependencies) {
    const copy = await getChatCopy(dependencies.sessionRepo, ctx.chat.id);

    try {
        const title = extractSessionTitle(ctx);
        const result = await dependencies.createSessionUseCase.execute({
            chatId: ctx.chat.id,
            title,
        });

        await ctx.reply(presentSessionCreatedMessage(result.session, copy));
    } catch (error) {
        dependencies.logger.error({ error }, "failed to create new session");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerNewCommand(bot: Bot, dependencies: BotDependencies) {
    bot.command("new", async (ctx) => {
        await handleNewCommand(ctx, dependencies);
    });
}

function extractSessionTitle(ctx: NewCommandContext): string | null {
    if (typeof ctx.match === "string") {
        const title = ctx.match.trim();

        return title ? title : null;
    }

    const messageText = ctx.message?.text?.trim();

    if (!messageText) {
        return null;
    }

    const match = messageText.match(/^\/new(?:@\S+)?(?:\s+([\s\S]*))?$/i);
    const title = match?.[1]?.trim();

    return title ? title : null;
}
