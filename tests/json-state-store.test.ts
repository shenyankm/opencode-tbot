import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JsonStateStore } from "../src/services/storage/json-state-store.js";

test("state updates serialize the draft and file without cloning an unused return value", async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "tbot-state-write-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const filePath = join(directory, "state.json");
    const store = new JsonStateStore({ filePath, createDefaultState: () => ({ marker: "state-write", count: 0 }) });
    await store.read();
    const stringify = t.mock.method(JSON, "stringify");
    await store.update((state) => { state.count += 1; });
    const stateSerializations = stringify.mock.calls.filter((call) => call.arguments[0]?.marker === "state-write").length;
    stringify.mock.restore();
    assert.equal(stateSerializations, 2);
    assert.deepEqual(await store.read(), { marker: "state-write", count: 1 });
    assert.deepEqual(JSON.parse(readFileSync(filePath, "utf8")), await store.read());
});

test("queued updates preserve atomic commits and recover after mutator and disk failures", async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "tbot-state-queue-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const parent = join(directory, "state");
    const filePath = join(parent, "state.json");
    mkdirSync(parent);
    const store = new JsonStateStore({ filePath, createDefaultState: () => ({ count: 0 }) });
    await store.read();
    await assert.rejects(store.update((state) => { state.count = 99; throw new Error("invalid mutation"); }), /invalid mutation/);
    assert.deepEqual(await store.read(), { count: 0 });
    rmSync(parent, { recursive: true });
    writeFileSync(parent, "blocked");
    await assert.rejects(store.update((state) => { state.count = 99; }));
    assert.deepEqual(await store.read(), { count: 0 });
    rmSync(parent);
    mkdirSync(parent);
    await Promise.all(Array.from({ length: 10 }, () => store.update((state) => { state.count += 1; })));
    assert.deepEqual(await store.read(), { count: 10 });
    assert.deepEqual(JSON.parse(readFileSync(filePath, "utf8")), { count: 10 });
    const restarted = new JsonStateStore({ filePath, createDefaultState: () => ({ count: -1 }) });
    const result = await restarted.read();
    result.count = 100;
    assert.deepEqual(await restarted.read(), { count: 10 });
});

test("failed initial state loads recover after the file is repaired without resetting stored data", async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "tbot-state-load-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    for (const failure of ["invalid-json", "unreadable"]) {
        const filePath = join(directory, `${failure}.json`);
        if (failure === "invalid-json") writeFileSync(filePath, "{broken");
        else mkdirSync(filePath);
        const store = new JsonStateStore({ filePath, createDefaultState: () => ({ count: 0, keep: "default" }) });
        const results = await Promise.allSettled([
            store.read(), store.select((state) => state.count), store.update((state) => { state.count = -1; }),
        ]);
        assert.ok(results.every((result) => result.status === "rejected"));
        if (failure === "invalid-json") assert.equal(readFileSync(filePath, "utf8"), "{broken");
        rmSync(filePath, { recursive: true });
        writeFileSync(filePath, JSON.stringify({ count: 40, keep: "preserved" }));
        assert.deepEqual(await store.read(), { count: 40, keep: "preserved" });
        await Promise.all(Array.from({ length: 10 }, () => store.update((state) => { state.count += 1; })));
        assert.equal(await store.select((state) => state.count), 50);
        assert.deepEqual(JSON.parse(readFileSync(filePath, "utf8")), { count: 50, keep: "preserved" });
    }
});

test("failed atomic renames remove temporary files without committing drafts and later writes recover", async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "tbot-state-rename-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const filePath = join(directory, "state.json");
    const store = new JsonStateStore({ filePath, createDefaultState: () => ({ count: 0 }) });
    await store.read();
    mkdirSync(filePath);
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await assert.rejects(store.update((state) => { state.count = 99; }), (error: NodeJS.ErrnoException) => error.syscall === "rename");
        assert.deepEqual(await store.read(), { count: 0 });
        assert.deepEqual(readdirSync(directory), ["state.json"]);
    }
    rmSync(filePath, { recursive: true });
    await store.update((state) => { state.count += 1; });
    assert.deepEqual(JSON.parse(readFileSync(filePath, "utf8")), { count: 1 });
});
