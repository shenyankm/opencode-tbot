import type { Bot } from "grammy";
import { getSafeChatCopy } from "../../i18n.js";
import type { AbortFeatureDependencies } from "../../types.js";
import type { ForegroundSessionTrackerLike } from "../../../services/session-activity/foreground-session-tracker.js";
import type { CallbackContext } from "./callback-context.js";

type StopDependencies = AbortFeatureDependencies & { foregroundSessionTracker: ForegroundSessionTrackerLike };

export async function handlePromptStopCallback(ctx: CallbackContext, dependencies: StopDependencies): Promise<void> {
    if (!ctx.chat) {
        await ctx.answerCallbackQuery();
        return;
    }
    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);
    const requestId = ctx.callbackQuery.data.slice("prompt:stop:".length);
    if (dependencies.foregroundSessionTracker.getRequestId(ctx.chat.id) !== requestId) {
        await ctx.answerCallbackQuery({ text: copy.status.expiredStop });
        return;
    }
    await ctx.answerCallbackQuery();
    if (dependencies.foregroundSessionTracker.getRequestId(ctx.chat.id) === requestId) {
        await dependencies.abortPromptUseCase.execute({ chatId: ctx.chat.id, requestId });
    }
}

export function registerPromptStopRoute(bot: Pick<Bot, "callbackQuery">, dependencies: StopDependencies): void {
    bot.callbackQuery(/^prompt:stop:/, (ctx) => handlePromptStopCallback(ctx, dependencies));
}
