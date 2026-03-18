import type { DatabaseSync, StatementSync } from "node:sqlite";
import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { SessionRepository } from "../domain/session/session.repository.js";

export class InMemorySessionRepository implements SessionRepository {
    private readonly sessionsByChatId = new Map<number, ChatSessionBinding>();

    async getByChatId(chatId: number): Promise<ChatSessionBinding | null> {
        return this.sessionsByChatId.get(chatId) ?? null;
    }

    async setCurrent(binding: ChatSessionBinding): Promise<void> {
        this.sessionsByChatId.set(binding.chatId, binding);
    }

    async touch(chatId: number): Promise<void> {
        const binding = this.sessionsByChatId.get(chatId);

        if (!binding) {
            return;
        }

        this.sessionsByChatId.set(chatId, {
            ...binding,
            updatedAt: new Date().toISOString(),
        });
    }
}

interface ChatSessionBindingRow {
    agent_name: string | null;
    chat_id: number;
    directory: string | null;
    language: string | null;
    model_id: string | null;
    model_provider_id: string | null;
    model_variant: string | null;
    project_id: string | null;
    session_id: string | null;
    updated_at: string;
}

export class SQLiteSessionRepository implements SessionRepository {
    private readonly getByChatIdStatement: StatementSync;
    private readonly setCurrentStatement: StatementSync;
    private readonly touchStatement: StatementSync;

    constructor(private readonly database: DatabaseSync) {
        this.getByChatIdStatement = this.database.prepare(`
            SELECT
                chat_id,
                session_id,
                project_id,
                directory,
                agent_name,
                model_provider_id,
                model_id,
                model_variant,
                language,
                updated_at
            FROM chat_session_bindings
            WHERE chat_id = $chatId
        `);
        this.setCurrentStatement = this.database.prepare(`
            INSERT INTO chat_session_bindings (
                chat_id,
                session_id,
                project_id,
                directory,
                agent_name,
                model_provider_id,
                model_id,
                model_variant,
                language,
                updated_at
            ) VALUES (
                $chatId,
                $sessionId,
                $projectId,
                $directory,
                $agentName,
                $modelProviderId,
                $modelId,
                $modelVariant,
                $language,
                $updatedAt
            )
            ON CONFLICT(chat_id) DO UPDATE SET
                session_id = excluded.session_id,
                project_id = excluded.project_id,
                directory = excluded.directory,
                agent_name = excluded.agent_name,
                model_provider_id = excluded.model_provider_id,
                model_id = excluded.model_id,
                model_variant = excluded.model_variant,
                language = excluded.language,
                updated_at = excluded.updated_at
        `);
        this.touchStatement = this.database.prepare(`
            UPDATE chat_session_bindings
            SET updated_at = $updatedAt
            WHERE chat_id = $chatId
        `);
    }

    async getByChatId(chatId: number): Promise<ChatSessionBinding | null> {
        const row = this.getByChatIdStatement.get({ chatId }) as ChatSessionBindingRow | undefined;

        return row ? mapRowToBinding(row) : null;
    }

    async setCurrent(binding: ChatSessionBinding): Promise<void> {
        this.setCurrentStatement.run({
            chatId: binding.chatId,
            sessionId: binding.sessionId,
            projectId: binding.projectId,
            directory: binding.directory,
            agentName: binding.agentName,
            modelProviderId: binding.modelProviderId,
            modelId: binding.modelId,
            modelVariant: binding.modelVariant,
            language: binding.language,
            updatedAt: binding.updatedAt,
        });
    }

    async touch(chatId: number): Promise<void> {
        this.touchStatement.run({
            chatId,
            updatedAt: new Date().toISOString(),
        });
    }
}

function mapRowToBinding(row: ChatSessionBindingRow): ChatSessionBinding {
    return {
        chatId: row.chat_id,
        sessionId: row.session_id,
        projectId: row.project_id,
        directory: row.directory,
        agentName: row.agent_name,
        modelProviderId: row.model_provider_id,
        modelId: row.model_id,
        modelVariant: row.model_variant,
        language: row.language,
        updatedAt: row.updated_at,
    };
}
