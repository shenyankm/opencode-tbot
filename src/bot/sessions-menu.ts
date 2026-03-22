import type { OpenCodeSession } from "../services/opencode/opencode.client.js";
import { getSafeChatCopy } from "./i18n.js";
import {
    buildSessionActionKeyboard,
    buildSessionsKeyboard,
} from "./presenters/keyboard.presenter.js";
import {
    presentSessionActionsMessage,
    presentSessionsMessage,
} from "./presenters/message.presenter.js";
import type { BotDependencies } from "./types.js";

interface SessionsMessageApi {
    editMessageText(
        chatId: number,
        messageId: number,
        text: string,
        other?: { reply_markup?: unknown },
    ): Promise<unknown>;
}

interface SessionsListView {
    copy: Awaited<ReturnType<typeof getSafeChatCopy>>;
    currentDirectory: string;
    currentSessionId: string | null;
    keyboard?: unknown;
    page: number;
    sessions: OpenCodeSession[];
    text: string;
}

export async function buildSessionsListView(
    chatId: number,
    requestedPage: number,
    dependencies: BotDependencies,
): Promise<SessionsListView> {
    const copy = await getSafeChatCopy(dependencies.sessionRepo, chatId, dependencies.logger);
    const result = await dependencies.listSessionsUseCase.execute({
        chatId,
    });

    if (result.sessions.length === 0) {
        return {
            copy,
            currentDirectory: result.currentDirectory,
            currentSessionId: result.currentSessionId,
            page: 0,
            sessions: [],
            text: copy.sessions.none,
        };
    }

    const { keyboard, page } = buildSessionsKeyboard(result.sessions, requestedPage, copy);

    return {
        copy,
        currentDirectory: result.currentDirectory,
        currentSessionId: result.currentSessionId,
        keyboard,
        page: page.page,
        sessions: result.sessions,
        text: presentSessionsMessage({
            currentDirectory: result.currentDirectory,
            currentSessionId: result.currentSessionId,
            page: page.page,
            sessions: result.sessions,
        }, copy),
    };
}

export async function buildSessionActionView(
    chatId: number,
    requestedPage: number,
    sessionId: string,
    dependencies: BotDependencies,
) {
    const listView = await buildSessionsListView(chatId, requestedPage, dependencies);
    const session = listView.sessions.find((item) => item.id === sessionId);

    if (!session) {
        return {
            copy: listView.copy,
            found: false as const,
        };
    }

    return {
        copy: listView.copy,
        found: true as const,
        keyboard: buildSessionActionKeyboard(session.id, listView.page, listView.copy),
        page: listView.page,
        session,
        text: presentSessionActionsMessage({
            currentDirectory: listView.currentDirectory,
            session,
        }, listView.copy),
    };
}

export async function restoreSessionsListMessage(
    api: SessionsMessageApi,
    chatId: number,
    messageId: number,
    requestedPage: number,
    dependencies: BotDependencies,
) {
    const listView = await buildSessionsListView(chatId, requestedPage, dependencies);

    if (listView.keyboard) {
        await api.editMessageText(chatId, messageId, listView.text, {
            reply_markup: listView.keyboard,
        });
    } else {
        await api.editMessageText(chatId, messageId, listView.text);
    }

    return listView;
}
