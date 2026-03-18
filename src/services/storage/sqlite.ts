import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Logger } from "pino";

const SQLITE_BOOTSTRAP_SQL = `
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS chat_session_bindings (
        chat_id INTEGER PRIMARY KEY,
        session_id TEXT,
        project_id TEXT,
        directory TEXT,
        agent_name TEXT,
        model_provider_id TEXT,
        model_id TEXT,
        model_variant TEXT,
        language TEXT,
        updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_session_bindings_updated_at
        ON chat_session_bindings(updated_at);
`;

export function openSQLiteDatabase(
    filePath: string,
    logger?: Pick<Logger, "info">,
): DatabaseSync {
    mkdirSync(dirname(filePath), { recursive: true });
    const database = new DatabaseSync(filePath);
    database.exec(SQLITE_BOOTSTRAP_SQL);
    logger?.info?.({ filePath }, "bot state database initialized");

    return database;
}
