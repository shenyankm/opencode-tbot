import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FilePendingActionRepository } from "../src/repositories/pending-action.repo.js";
import { FilePermissionApprovalRepository } from "../src/repositories/permission-approval.repo.js";
import { FileSessionRepository } from "../src/repositories/session.repo.js";
import { createDefaultOpencodeTbotState } from "../src/services/storage/bot-state.js";
import { JsonStateStore } from "../src/services/storage/json-state-store.js";

function createTempStateStore() {
    const directory = mkdtempSync(join(tmpdir(), "opencode-tbot-"));
    const filePath = join(directory, "state.json");

    return {
        cleanup() {
            rmSync(directory, { recursive: true, force: true });
        },
        filePath,
        store: new JsonStateStore({
            filePath,
            createDefaultState: createDefaultOpencodeTbotState,
        }),
    };
}

test("selected reads clone their result without serializing unrelated state and recover from selector failures", async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "opencode-selected-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    let unrelatedSerializations = 0;
    const store = new JsonStateStore({
        filePath: join(directory, "state.json"),
        createDefaultState: () => ({
            selected: { rows: [{ value: 1 }] },
            unrelated: { toJSON() { unrelatedSerializations += 1; return { value: 2 }; } },
        }),
    });
    const result = await store.select((state) => state.selected);
    result.rows[0].value = 9;
    result.rows.push({ value: 10 });
    assert.deepEqual(await store.select((state) => state.selected), { rows: [{ value: 1 }] });
    assert.equal(await store.select(() => null), null);
    await assert.rejects(store.select(() => { throw new Error("selector failed"); }), /selector failed/);
    assert.equal(unrelatedSerializations, 0);
    assert.deepEqual(await store.read(), { selected: { rows: [{ value: 1 }] }, unrelated: { value: 2 } });
    assert.equal(unrelatedSerializations, 1);
});

test("selected repository results cannot mutate stored bindings, actions or permissions", async (t) => {
    const tempState = createTempStateStore();
    t.after(tempState.cleanup);
    const sessions = new FileSessionRepository(tempState.store);
    const actions = new FilePendingActionRepository(tempState.store);
    const permissions = new FilePermissionApprovalRepository(tempState.store);
    await sessions.setCurrent({
        chatId: 1, sessionId: "s", projectId: "p", directory: "/repo", agentName: null,
        modelProviderId: null, modelId: null, modelVariant: null, language: "en", updatedAt: new Date(0).toISOString(),
    });
    await actions.set({ chatId: 1, kind: "session_rename", sessionId: "s", menuMessageId: 2, returnPage: 0, updatedAt: new Date(0).toISOString() });
    await permissions.set({ chatId: 1, sessionId: "s", requestId: "r", messageId: 3, status: "pending", updatedAt: new Date().toISOString() });
    (await sessions.getByChatId(1))!.directory = "/changed";
    (await sessions.listBySessionId("s"))[0].language = "ja";
    (await actions.getByChatId(1))!.menuMessageId = 99;
    (await permissions.listBySessionId("s"))[0].status = "reject";
    (await permissions.listByRequestId("r"))[0].messageId = 99;
    assert.equal((await sessions.getByChatId(1))!.directory, "/repo");
    assert.equal((await sessions.getByChatId(1))!.language, "en");
    assert.equal((await actions.getByChatId(1))!.menuMessageId, 2);
    assert.equal((await permissions.listByRequestId("r"))[0].status, "pending");
    assert.equal((await permissions.listBySessionId("s"))[0].messageId, 3);
    assert.equal(await sessions.getByChatId(2), null);
    assert.equal(await actions.getByChatId(2), null);
    assert.deepEqual(await permissions.listByRequestId("missing"), []);
    const restarted = new FileSessionRepository(new JsonStateStore({
        filePath: tempState.filePath, createDefaultState: createDefaultOpencodeTbotState,
    }));
    assert.deepEqual(await restarted.getByChatId(1), await sessions.getByChatId(1));
});

test("FileSessionRepository persists bindings across repository instances", async () => {
    const tempState = createTempStateStore();
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

    const repositoryOne = new FileSessionRepository(tempState.store);
    await repositoryOne.setCurrent(initialBinding);

    const repositoryTwo = new FileSessionRepository(new JsonStateStore({
        filePath: tempState.filePath,
        createDefaultState: createDefaultOpencodeTbotState,
    }));
    const loadedBinding = await repositoryTwo.getByChatId(7);

    assert.deepEqual(loadedBinding, initialBinding);
    assert.deepEqual(await repositoryTwo.listBySessionId("session-1"), [initialBinding]);

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

    tempState.cleanup();
});

test("FileSessionRepository touch only updates the timestamp", async () => {
    const tempState = createTempStateStore();
    const repository = new FileSessionRepository(tempState.store);
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

    tempState.cleanup();
});

test("FilePendingActionRepository persists and clears pending rename actions", async () => {
    const tempState = createTempStateStore();
    const initialAction = {
        chatId: 12,
        kind: "session_rename" as const,
        sessionId: "session-12",
        menuMessageId: 345,
        returnPage: 2,
        updatedAt: new Date(0).toISOString(),
    };

    const repositoryOne = new FilePendingActionRepository(tempState.store);
    await repositoryOne.set(initialAction);

    const repositoryTwo = new FilePendingActionRepository(new JsonStateStore({
        filePath: tempState.filePath,
        createDefaultState: createDefaultOpencodeTbotState,
    }));

    assert.deepEqual(await repositoryTwo.getByChatId(12), initialAction);

    await repositoryTwo.set({
        ...initialAction,
        menuMessageId: 678,
        returnPage: 3,
        updatedAt: new Date(1_000).toISOString(),
    });

    assert.deepEqual(await repositoryTwo.getByChatId(12), {
        ...initialAction,
        menuMessageId: 678,
        returnPage: 3,
        updatedAt: new Date(1_000).toISOString(),
    });

    await repositoryTwo.clear(12);
    assert.equal(await repositoryTwo.getByChatId(12), null);

    tempState.cleanup();
});

test("FilePermissionApprovalRepository persists approval prompts", async () => {
    const tempState = createTempStateStore();
    const repository = new FilePermissionApprovalRepository(tempState.store);

    const updatedAt = new Date().toISOString();
    await repository.set({
        requestId: "request-1",
        sessionId: "session-1",
        chatId: 42,
        messageId: 99,
        status: "pending",
        updatedAt,
    });

    const repositoryTwo = new FilePermissionApprovalRepository(new JsonStateStore({
        filePath: tempState.filePath,
        createDefaultState: createDefaultOpencodeTbotState,
    }));

    assert.deepEqual(await repositoryTwo.listByRequestId("request-1"), [{
        requestId: "request-1",
        sessionId: "session-1",
        chatId: 42,
        messageId: 99,
        status: "pending",
        updatedAt,
    }]);

    tempState.cleanup();
});
