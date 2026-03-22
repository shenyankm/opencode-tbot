import type { Bot } from "grammy";
import { getSafeChatCopy } from "../i18n.js";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
import { presentError } from "../presenters/error.presenter.js";
import { cancelPendingSessionRename } from "../session-rename.js";
import type { BotDependencies } from "../types.js";

interface CancelCommandContext {
    api: {
        editMessageText(
            chatId: number,
            messageId: number,
            text: string,
            other?: { reply_markup?: unknown },
        ): Promise<unknown>;
    };
    chat: { id: number };
    reply(text: string): Promise<unknown>;
}

export async function handleCancelCommand(ctx: CancelCommandContext, dependencies: BotDependencies) {
    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);

    try {
        if (await cancelPendingSessionRename(ctx, dependencies)) {
            return;
        }

        const result = await dependencies.abortPromptUseCase.execute({
            chatId: ctx.chat.id,
        });

        if (result.status === "no_session") {
            await ctx.reply(copy.abort.noSession);
            return;
        }

        if (result.status === "not_running") {
            await ctx.reply(copy.abort.notRunning);
            return;
        }

        await ctx.reply(copy.abort.aborted);
    } catch (error) {
        dependencies.logger.error({ error }, "failed to cancel current action");
        await ctx.reply(presentError(error, copy));
    }
}

export function registerCancelCommand(bot: Pick<Bot, "command">, dependencies: BotDependencies) {
    bot.command("cancel", async (ctx) => {
        await handleCancelCommand(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}
