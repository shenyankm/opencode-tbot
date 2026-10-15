import type { Bot, InlineKeyboard } from "grammy";
import type { TelegramThinkingMessages } from "../../../services/telegram/thinking-messages.js";
import type { ForegroundSessionTrackerLike } from "../../../services/session-activity/foreground-session-tracker.js";
import { getSafeChatCopy } from "../../i18n.js";
import { scopeDependenciesToTelegramContext } from "../../logger-context.js";
import type { ChatStateDependencies } from "../../types.js";
import type { CallbackContext } from "./callback-context.js";

interface ThinkingCallbackDependencies extends ChatStateDependencies {
    thinkingMessages: TelegramThinkingMessages;
    foregroundSessionTracker: ForegroundSessionTrackerLike;
}

type ThinkingCallbackContext = Omit<CallbackContext, "editMessageText"> & {
    editMessageText(text: string, other?: { parse_mode?: "HTML"; reply_markup?: InlineKeyboard }): Promise<unknown>;
};

export async function handleThinkingCallback(ctx: ThinkingCallbackContext, dependencies: ThinkingCallbackDependencies): Promise<void> {
    const messageId = ctx.callbackQuery.message?.message_id;
    if (!ctx.chat || !messageId || !/^thinking:(expand|collapse)$/u.test(ctx.callbackQuery.data)) {
        await ctx.answerCallbackQuery();
        return;
    }
    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);
    await ctx.answerCallbackQuery();
    try {
        const found = await dependencies.thinkingMessages.setExpanded(
            ctx.chat.id, messageId, ctx.callbackQuery.data === "thinking:expand",
            dependencies.foregroundSessionTracker.getRequestId(ctx.chat.id), copy,
            (payload, keyboard) => ctx.editMessageText(payload.text, { ...payload.options, reply_markup: keyboard }),
        );
        if (!found) await ctx.answerCallbackQuery({ text: copy.status.thinkingUnavailable, show_alert: true });
    } catch (error) {
        dependencies.logger.warn({ error, messageId }, "failed to toggle thinking message");
        await ctx.answerCallbackQuery({ text: copy.status.thinkingToggleFailed, show_alert: true }).catch(() => {});
    }
}

export function registerThinkingCallbackRoute(bot: Pick<Bot, "callbackQuery">, dependencies: ThinkingCallbackDependencies): void {
    bot.callbackQuery(/^thinking:(expand|collapse)$/, (ctx) => handleThinkingCallback(ctx, scopeDependenciesToTelegramContext(dependencies, ctx)));
}
