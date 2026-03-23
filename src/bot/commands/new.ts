import type { Bot } from "grammy";
import { getSafeChatCopy } from "../i18n.js";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
import { presentError } from "../presenters/error.presenter.js";
import { presentSessionCreatedMessage } from "../presenters/message.presenter.js";
import type { BotDependencies, SessionCreationDependencies } from "../types.js";
import type { TelegramCommandDefinition } from "./registry.js";

interface NewCommandContext {
    chat: { id: number };
    message?: { text?: string };
    match?: string;
    reply(text: string): Promise<unknown>;
}

export async function handleNewCommand(ctx: NewCommandContext, dependencies: SessionCreationDependencies) {
    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);

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

export function registerNewCommand(bot: Pick<Bot, "command">, dependencies: BotDependencies) {
    bot.command("new", async (ctx) => {
        await handleNewCommand(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}

export const NEW_COMMAND_DEFINITION: TelegramCommandDefinition = {
    describe(copy) {
        return copy.commands.new;
    },
    names: ["new"],
    register: registerNewCommand,
};

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
