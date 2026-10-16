import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
