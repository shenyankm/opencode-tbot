import type { Bot } from "grammy";
import { getSafeChatCopy } from "../../i18n.js";
import { scopeDependenciesToTelegramContext } from "../../logger-context.js";
import { presentError } from "../../presenters/error.presenter.js";
import { presentSessionRenamePromptMessage, presentSessionSwitchMessage } from "../../presenters/message.presenter.js";
import {
    buildSessionActionView,
    buildSessionsListView,
} from "../../sessions-menu.js";
import type {
    BotDependencies,
    SessionsCallbackData,
    SessionsFeatureDependencies,
} from "../../types.js";
import type { CallbackContext } from "./callback-context.js";

const SESSIONS_PAGE_PREFIX = "sessions:page:";
const SESSIONS_PICK_PREFIX = "sessions:pick:";
const SESSIONS_SWITCH_PREFIX = "sessions:switch:";
const SESSIONS_RENAME_PREFIX = "sessions:rename:";
const SESSIONS_BACK_PREFIX = "sessions:back:";

export async function handleSessionsCallback(ctx: CallbackContext, dependencies: SessionsFeatureDependencies) {
    const data = ctx.callbackQuery.data as SessionsCallbackData;

    if (!data.startsWith("sessions:")) {
        return;
    }

    await ctx.answerCallbackQuery();

    if (!ctx.chat) {
        return;
    }

    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);

    try {
        if (data.startsWith(SESSIONS_PAGE_PREFIX)) {
            const requestedPage = Number(data.slice(SESSIONS_PAGE_PREFIX.length));
            const view = await buildSessionsListView(ctx.chat.id, requestedPage, dependencies);

            await ctx.editMessageText(view.text, view.keyboard ? { reply_markup: view.keyboard } : undefined);
            return;
        }

        if (data.startsWith(SESSIONS_BACK_PREFIX)) {
            const requestedPage = Number(data.slice(SESSIONS_BACK_PREFIX.length));
            const view = await buildSessionsListView(ctx.chat.id, requestedPage, dependencies);

            await ctx.editMessageText(view.text, view.keyboard ? { reply_markup: view.keyboard } : undefined);
            return;
        }

        if (data.startsWith(SESSIONS_PICK_PREFIX)) {
            const target = parseSessionActionTarget(data, SESSIONS_PICK_PREFIX);

            if (!target) {
                await ctx.editMessageText(copy.sessions.expired);
                return;
            }

            const view = await buildSessionActionView(
                ctx.chat.id,
                target.page,
                target.sessionId,
                dependencies,
            );

            if (!view.found) {
                await ctx.editMessageText(copy.sessions.expired);
                return;
            }

            await ctx.editMessageText(view.text, {
                reply_markup: view.keyboard,
            });
            return;
        }

        if (data.startsWith(SESSIONS_SWITCH_PREFIX)) {
            const target = parseSessionActionTarget(data, SESSIONS_SWITCH_PREFIX);

            if (!target) {
                await ctx.editMessageText(copy.sessions.expired);
                return;
            }

            const result = await dependencies.switchSessionUseCase.execute({
                chatId: ctx.chat.id,
                sessionId: target.sessionId,
            });

            if (!result.found) {
                await ctx.editMessageText(copy.sessions.expired);
                return;
            }

            await ctx.editMessageText(presentSessionSwitchMessage(result.session, copy));
            return;
        }

        if (data.startsWith(SESSIONS_RENAME_PREFIX)) {
            const target = parseSessionActionTarget(data, SESSIONS_RENAME_PREFIX);

            if (!target) {
                await ctx.editMessageText(copy.sessions.renameExpired);
                return;
            }

            const view = await buildSessionActionView(
                ctx.chat.id,
                target.page,
                target.sessionId,
                dependencies,
            );

            if (!view.found) {
                await ctx.editMessageText(copy.sessions.renameExpired);
                return;
            }

            const menuMessageId = ctx.callbackQuery.message?.message_id;

            if (typeof menuMessageId !== "number" || !Number.isInteger(menuMessageId)) {
                await ctx.editMessageText(copy.sessions.renameExpired);
                return;
            }

            await dependencies.pendingActionRepo.set({
                chatId: ctx.chat.id,
                kind: "session_rename",
                sessionId: view.session.id,
                menuMessageId,
                returnPage: view.page,
                updatedAt: new Date().toISOString(),
            });

            await ctx.editMessageText(presentSessionRenamePromptMessage(view.session, copy));
        }
    } catch (error) {
        dependencies.logger.error({ error }, "failed to handle session callback");
        await ctx.editMessageText(presentError(error, copy));
    }
}

export function registerSessionsCallbackRoute(
    bot: Pick<Bot, "callbackQuery">,
    dependencies: BotDependencies,
): void {
    bot.callbackQuery(/^sessions:/, async (ctx) => {
        await handleSessionsCallback(ctx, scopeDependenciesToTelegramContext(dependencies, ctx, "telegram"));
    });
}

function parseSessionActionTarget(data: string, prefix: string) {
    const suffix = data.slice(prefix.length);
    const separatorIndex = suffix.indexOf(":");

    if (separatorIndex === -1) {
        return null;
    }

    const page = Number(suffix.slice(0, separatorIndex));
    const sessionId = suffix.slice(separatorIndex + 1).trim();

    if (!Number.isInteger(page) || page < 0 || !sessionId) {
        return null;
    }

    return {
        page,
        sessionId,
    };
}
