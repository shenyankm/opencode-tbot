import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { JsonStateStore } from "../src/services/storage/json-state-store.js";

test("concurrent updates use bounded atomic batches while failed mutators leave no partial changes", async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "tbot-state-batch-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const filePath = join(directory, "state.json");
    const write = t.mock.method(fs, "writeFile");
    syncBuiltinESMExports();
    t.after(() => { write.mock.restore(); syncBuiltinESMExports(); });
    const store = new JsonStateStore({ filePath, createDefaultState: () => ({ count: 0 }) });
    const updates = Array.from({ length: 61 }, (_, index) => store.update((state) => {
        state.count += 1;
        if (index === 10) throw new Error("invalid mutation");
    }));
    const results = await Promise.allSettled(updates);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(write.mock.callCount(), 4);
    assert.deepEqual(await store.read(), { count: 60 });
    assert.deepEqual(JSON.parse(readFileSync(filePath, "utf8")), { count: 60 });
});

test("updates arriving during a write form a later batch and resolve only after their durable commit", { timeout: 5_000 }, async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "tbot-state-durable-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const filePath = join(directory, "nested", "state.json");
    const store = new JsonStateStore({ filePath, createDefaultState: () => ({ count: 0 }) });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    t.after(() => release());
    const originalWrite = fs.writeFile;
    const write = t.mock.method(fs, "writeFile", async (...args: Parameters<typeof fs.writeFile>) => {
        await blocked;
        return originalWrite(...args);
    });
    syncBuiltinESMExports();
    t.after(() => { write.mock.restore(); syncBuiltinESMExports(); });
    let acknowledged = 0;
    const update = () => store.update((state) => { state.count += 1; }).then(() => { acknowledged += 1; });
    const first = update();
    while (!write.mock.callCount()) await setImmediate();
    const later = Array.from({ length: 10 }, update);
    await setImmediate();
    assert.equal(acknowledged, 0);
    assert.deepEqual(await store.read(), { count: 0 });
    release();
    await Promise.all([first, ...later]);
    assert.equal(write.mock.callCount(), 2);
    assert.equal(acknowledged, 11);
    assert.deepEqual(JSON.parse(readFileSync(filePath, "utf8")), { count: 11 });
});

test("a failed batch rejects every pending update without committing drafts and later writes recover", async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "tbot-state-io-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const filePath = join(directory, "state.json");
    const store = new JsonStateStore({ filePath, createDefaultState: () => ({ count: 0 }) });
    await store.update((state) => { state.count = 1; });
    const error = Object.assign(new Error("disk failure"), { code: "EIO" });
    const write = t.mock.method(fs, "writeFile", async () => { throw error; });
    syncBuiltinESMExports();
    t.after(() => { write.mock.restore(); syncBuiltinESMExports(); });
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => store.update((state) => { state.count += 1; })));
    assert.ok(results.every((result) => result.status === "rejected" && result.reason === error));
    assert.equal(write.mock.callCount(), 1);
    assert.deepEqual(await store.read(), { count: 1 });
    assert.deepEqual(JSON.parse(readFileSync(filePath, "utf8")), { count: 1 });
    assert.deepEqual(readdirSync(directory), ["state.json"]);
    write.mock.restore();
    syncBuiltinESMExports();
    await store.update((state) => { state.count += 1; });
    assert.deepEqual(await store.read(), { count: 2 });
});

test("batched updates let event-loop work run between state mutations", async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "tbot-state-yield-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const store = new JsonStateStore({ filePath: join(directory, "state.json"), createDefaultState: () => ({ count: 0 }) });
    let handled = false;
    await Promise.all([
        store.update((state) => { state.count += 1; void setImmediate().then(() => { handled = true; }); }),
        store.update((state) => { assert.equal(handled, true); state.count += 1; }),
    ]);
    assert.deepEqual(await store.read(), { count: 2 });
});

test("non-serializable updates reject individually without poisoning other updates in the batch", async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "tbot-state-serialize-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const store = new JsonStateStore<{ count: number; cycle?: unknown }>({
        filePath: join(directory, "state.json"), createDefaultState: () => ({ count: 0 }),
    });
    const results = await Promise.allSettled([
        store.update((state) => { state.count += 1; }),
        store.update((state) => { state.count = 99; state.cycle = state; }),
        store.update((state) => { state.count += 1; }),
    ]);
    assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected", "fulfilled"]);
    assert.deepEqual(await store.read(), { count: 2 });
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "state.json"), "utf8")), { count: 2 });
});

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
