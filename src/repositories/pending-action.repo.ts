import type { DatabaseSync, StatementSync } from "node:sqlite";
import type { PendingChatAction, SessionRenamePendingAction } from "../domain/pending-action/pending-action.entity.js";
import type { PendingActionRepository } from "../domain/pending-action/pending-action.repository.js";

interface PendingChatActionRow {
    chat_id: number;
    kind: "session_rename";
    menu_message_id: number;
    return_page: number;
    session_id: string;
    updated_at: string;
}

export class InMemoryPendingActionRepository implements PendingActionRepository {
    private readonly actionsByChatId = new Map<number, PendingChatAction>();

    async getByChatId(chatId: number): Promise<PendingChatAction | null> {
        return this.actionsByChatId.get(chatId) ?? null;
    }

    async set(action: PendingChatAction): Promise<void> {
        this.actionsByChatId.set(action.chatId, action);
    }

    async clear(chatId: number): Promise<void> {
        this.actionsByChatId.delete(chatId);
    }
}

export class SQLitePendingActionRepository implements PendingActionRepository {
    private readonly clearStatement: StatementSync;
    private readonly getByChatIdStatement: StatementSync;
    private readonly setStatement: StatementSync;

    constructor(private readonly database: DatabaseSync) {
        this.getByChatIdStatement = this.database.prepare(`
            SELECT
                chat_id,
                kind,
                session_id,
                menu_message_id,
                return_page,
                updated_at
            FROM chat_pending_actions
            WHERE chat_id = $chatId
        `);
        this.setStatement = this.database.prepare(`
            INSERT INTO chat_pending_actions (
                chat_id,
                kind,
                session_id,
                menu_message_id,
                return_page,
                updated_at
            ) VALUES (
                $chatId,
                $kind,
                $sessionId,
                $menuMessageId,
                $returnPage,
                $updatedAt
            )
            ON CONFLICT(chat_id) DO UPDATE SET
                kind = excluded.kind,
                session_id = excluded.session_id,
                menu_message_id = excluded.menu_message_id,
                return_page = excluded.return_page,
                updated_at = excluded.updated_at
        `);
        this.clearStatement = this.database.prepare(`
            DELETE FROM chat_pending_actions
            WHERE chat_id = $chatId
        `);
    }

    async getByChatId(chatId: number): Promise<PendingChatAction | null> {
        const row = this.getByChatIdStatement.get({ chatId }) as PendingChatActionRow | undefined;

        return row ? mapRowToPendingAction(row) : null;
    }

    async set(action: PendingChatAction): Promise<void> {
        this.setStatement.run({
            chatId: action.chatId,
            kind: action.kind,
            sessionId: action.sessionId,
            menuMessageId: action.menuMessageId,
            returnPage: action.returnPage,
            updatedAt: action.updatedAt,
        });
    }

    async clear(chatId: number): Promise<void> {
        this.clearStatement.run({ chatId });
    }
}

function mapRowToPendingAction(row: PendingChatActionRow): SessionRenamePendingAction {
    return {
        chatId: row.chat_id,
        kind: row.kind,
        sessionId: row.session_id,
        menuMessageId: row.menu_message_id,
        returnPage: row.return_page,
        updatedAt: row.updated_at,
    };
}
