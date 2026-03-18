import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SQLiteSessionRepository } from "../src/repositories/session.repo.js";
import { openSQLiteDatabase } from "../src/services/storage/sqlite.js";

function createTempDatabasePath() {
    const directory = mkdtempSync(join(tmpdir(), "opencode-tbot-"));

    return {
        cleanup() {
            rmSync(directory, { recursive: true, force: true });
        },
        filePath: join(directory, "state.sqlite"),
    };
}

test("SQLiteSessionRepository persists bindings across repository instances", async () => {
    const tempDatabase = createTempDatabasePath();
    const initialBinding = {
        chatId: 7,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: "review",
        modelProviderId: "openai",
        modelId: "gpt-5",
        modelVariant: "high",
        language: "zh-CN",
        updatedAt: new Date(0).toISOString(),
    };

    const databaseOne = openSQLiteDatabase(tempDatabase.filePath);
    const repositoryOne = new SQLiteSessionRepository(databaseOne);
    await repositoryOne.setCurrent(initialBinding);
    databaseOne.close();

    const databaseTwo = openSQLiteDatabase(tempDatabase.filePath);
    const repositoryTwo = new SQLiteSessionRepository(databaseTwo);
    const loadedBinding = await repositoryTwo.getByChatId(7);

    assert.deepEqual(loadedBinding, initialBinding);

    await repositoryTwo.setCurrent({
        ...initialBinding,
        modelId: "gpt-5.1",
        modelVariant: null,
        updatedAt: new Date(1_000).toISOString(),
    });

    assert.deepEqual(await repositoryTwo.getByChatId(7), {
        ...initialBinding,
        modelId: "gpt-5.1",
        modelVariant: null,
        updatedAt: new Date(1_000).toISOString(),
    });

    databaseTwo.close();
    tempDatabase.cleanup();
});

test("SQLiteSessionRepository touch only updates the timestamp", async () => {
    const tempDatabase = createTempDatabasePath();
    const database = openSQLiteDatabase(tempDatabase.filePath);
    const repository = new SQLiteSessionRepository(database);
    const binding = {
        chatId: 9,
        sessionId: "session-9",
        projectId: "project-9",
        directory: "E:/repo-9",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "en",
        updatedAt: new Date(0).toISOString(),
    };

    await repository.setCurrent(binding);
    await repository.touch(9);
    const touchedBinding = await repository.getByChatId(9);

    assert.deepEqual(
        {
            ...touchedBinding,
            updatedAt: binding.updatedAt,
        },
        binding,
    );
    assert.notEqual(touchedBinding?.updatedAt, binding.updatedAt);

    database.close();
    tempDatabase.cleanup();
});
