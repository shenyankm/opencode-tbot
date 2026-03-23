import type { PendingChatAction, SessionRenamePendingAction } from "../domain/pending-action/pending-action.entity.js";
import { getSafeChatCopy } from "./i18n.js";
import { restoreSessionsListMessage } from "./sessions-menu.js";
import { presentError } from "./presenters/error.presenter.js";
import { presentSessionRenamedMessage } from "./presenters/message.presenter.js";
import type {
    PendingActionDependencies,
    SessionsFeatureDependencies,
} from "./types.js";

interface SessionRenameApi {
    editMessageText(
        chatId: number,
        messageId: number,
        text: string,
        other?: { reply_markup?: unknown },
    ): Promise<unknown>;
}

interface SessionRenameReplyContext {
    api: SessionRenameApi;
    chat: { id: number };
    reply(text: string): Promise<unknown>;
}

interface SessionRenameTextContext extends SessionRenameReplyContext {
    message: { text?: string };
}

export async function getPendingSessionRenameAction(
    dependencies: PendingActionDependencies,
    chatId: number,
): Promise<SessionRenamePendingAction | null> {
    const action = await dependencies.pendingActionRepo.getByChatId(chatId);

    return isSessionRenamePendingAction(action) ? action : null;
}

export async function replyIfSessionRenamePending(
    ctx: Pick<SessionRenameReplyContext, "chat" | "reply">,
    dependencies: PendingActionDependencies,
): Promise<boolean> {
    const pendingAction = await getPendingSessionRenameAction(dependencies, ctx.chat.id);

    if (!pendingAction) {
        return false;
    }

    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);
    await ctx.reply(copy.sessions.renamePendingInput);

    return true;
}

export async function handlePendingSessionRenameText(
    ctx: SessionRenameTextContext,
    dependencies: PendingActionDependencies & Pick<SessionsFeatureDependencies, "listSessionsUseCase" | "renameSessionUseCase">,
): Promise<boolean> {
    const pendingAction = await getPendingSessionRenameAction(dependencies, ctx.chat.id);

    if (!pendingAction) {
        return false;
    }

    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);
    const title = ctx.message.text?.trim() ?? "";

    if (title.startsWith("/")) {
        await ctx.reply(copy.sessions.renamePendingInput);
        return true;
    }

    if (!title) {
        await ctx.reply(copy.sessions.renameEmpty);
        return true;
    }

    try {
        const result = await dependencies.renameSessionUseCase.execute({
            chatId: ctx.chat.id,
            sessionId: pendingAction.sessionId,
            title,
        });

        await dependencies.pendingActionRepo.clear(ctx.chat.id);

        await bestEffortRestoreSessionsList(ctx.api, pendingAction, dependencies);

        if (!result.found) {
            await ctx.reply(copy.sessions.renameExpired);
            return true;
        }

        await ctx.reply(presentSessionRenamedMessage(result.session, copy));
    } catch (error) {
        dependencies.logger.error({ error }, "failed to rename session");
        await ctx.reply(presentError(error, copy));
    }

    return true;
}

export async function cancelPendingSessionRename(
    ctx: SessionRenameReplyContext,
    dependencies: PendingActionDependencies & Pick<SessionsFeatureDependencies, "listSessionsUseCase">,
): Promise<boolean> {
    const pendingAction = await getPendingSessionRenameAction(dependencies, ctx.chat.id);

    if (!pendingAction) {
        return false;
    }

    const copy = await getSafeChatCopy(dependencies.sessionRepo, ctx.chat.id, dependencies.logger);
    await dependencies.pendingActionRepo.clear(ctx.chat.id);
    await bestEffortRestoreSessionsList(ctx.api, pendingAction, dependencies);
    await ctx.reply(copy.sessions.renameCancelled);

    return true;
}

async function bestEffortRestoreSessionsList(
    api: SessionRenameApi,
    pendingAction: SessionRenamePendingAction,
    dependencies: PendingActionDependencies & Pick<SessionsFeatureDependencies, "listSessionsUseCase">,
) {
    try {
        await restoreSessionsListMessage(
            api,
            pendingAction.chatId,
            pendingAction.menuMessageId,
            pendingAction.returnPage,
            dependencies,
        );
    } catch (error) {
        dependencies.logger.warn?.({ error }, "failed to restore sessions list message");
    }
}

function isSessionRenamePendingAction(action: PendingChatAction | null): action is SessionRenamePendingAction {
    return action?.kind === "session_rename";
}
