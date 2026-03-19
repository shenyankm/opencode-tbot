export interface SessionRenamePendingAction {
    chatId: number;
    kind: "session_rename";
    sessionId: string;
    menuMessageId: number;
    returnPage: number;
    updatedAt: string;
}

export type PendingChatAction = SessionRenamePendingAction;
