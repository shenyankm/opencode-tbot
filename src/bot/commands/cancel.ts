import type { Bot } from "grammy";
import { getSafeChatCopy } from "../i18n.js";
import { scopeDependenciesToTelegramContext } from "../logger-context.js";
import { presentError } from "../presenters/error.presenter.js";
import { cancelPendingSessionRename } from "../session-rename.js";
import type {
    AbortFeatureDependencies,
    BotDependencies,
    PendingActionDependencies,
    SessionsFeatureDependencies,
} from "../types.js";
import type { TelegramCommandDefinition } from "./registry.js";

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

type CancelCommandDependencies =
    & AbortFeatureDependencies
    & PendingActionDependencies
    & Pick<SessionsFeatureDependencies, "listSessionsUseCase">;

export async function handleCancelCommand(ctx: CancelCommandContext, dependencies: CancelCommandDependencies) {
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

export const CANCEL_COMMAND_DEFINITION: TelegramCommandDefinition = {
    describe(copy) {
        return copy.commands.cancel;
    },
    names: ["cancel"],
    register: registerCancelCommand,
};
