import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { Session } from "node:inspector/promises";
import { syncBuiltinESMExports } from "node:module";
import { arch, cpus, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mock } from "node:test";
import { setImmediate } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import type { TelegramProgressReply } from "../src/services/telegram/prompt-progress.js";

// node --expose-gc --import tsx tests/regression-paired.bench.ts <left> <right> <scenario> <mode> [blocks]
const roots = [resolve(process.argv[2]), resolve(process.argv[3])];
const scenario = process.argv[4];
const mode = process.argv[5];
const blocks = Number(process.argv[6] ?? 6);
assert.ok(Number.isInteger(blocks) && blocks >= 2);
assert.ok(["stream-short", "stream-long", "stream-changing", "thinking-expanded", "thinking-collapsed", "state-small", "state-large", "state-serial"].includes(scenario));
assert.ok(["microtask", "scheduled", "memory", "disk"].includes(mode));
const isStream = scenario.startsWith("stream-");
assert.equal(isStream, mode === "microtask" || mode === "scheduled");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const load = (root: string, file: string) => import(pathToFileURL(join(root, file)).href);

async function api(root: string) {
    const { TelegramPromptProgress } = await load(root, "src/services/telegram/prompt-progress.ts") as typeof import("../src/services/telegram/prompt-progress.js");
    const { FileThinkingMessageRepository } = await load(root, "src/repositories/thinking-message.repo.ts") as typeof import("../src/repositories/thinking-message.repo.js");
    const { TelegramThinkingMessages } = await load(root, "src/services/telegram/thinking-messages.ts") as typeof import("../src/services/telegram/thinking-messages.js");
    const { JsonStateStore } = await load(root, "src/services/storage/json-state-store.ts") as typeof import("../src/services/storage/json-state-store.js");
    const { createDefaultOpencodeTbotState } = await load(root, "src/services/storage/bot-state.ts") as typeof import("../src/services/storage/bot-state.js");
    const { FilePermissionApprovalRepository } = await load(root, "src/repositories/permission-approval.repo.ts") as typeof import("../src/repositories/permission-approval.repo.js");
    const { getBotCopy } = await load(root, "src/bot/copy.ts") as typeof import("../src/bot/copy.js");
    return { TelegramPromptProgress, FileThinkingMessageRepository, TelegramThinkingMessages, JsonStateStore, createDefaultOpencodeTbotState, FilePermissionApprovalRepository, copy: getBotCopy("en") };
}

const implementations = await Promise.all(roots.map(api));
const real = { mkdir: fs.mkdir, readFile: fs.readFile, writeFile: fs.writeFile, rename: fs.rename, unlink: fs.unlink };
const memory = new Map<string, string>();
const io = { mkdir: 0, reads: 0, writes: 0, renames: 0, bytesWritten: 0 };
const missing = () => Object.assign(new Error("Fixture file not found"), { code: "ENOENT" });
const directory = await fs.mkdtemp(join(tmpdir(), "tbot-paired-"));
let sequence = 0;
let renders = 0;

// The same backend wrappers apply to both implementations; no mock call histories enter timing.
fs.mkdir = (async (...args: Parameters<typeof fs.mkdir>) => {
    io.mkdir += 1;
    if (mode !== "memory") return real.mkdir(...args);
}) as typeof fs.mkdir;
fs.readFile = (async (...args: Parameters<typeof fs.readFile>) => {
    io.reads += 1;
    if (mode !== "memory") return real.readFile(...args);
    const value = memory.get(String(args[0]));
    if (value === undefined) throw missing();
    return value;
}) as typeof fs.readFile;
fs.writeFile = async (...args: Parameters<typeof fs.writeFile>) => {
    io.writes += 1;
    assert.equal(typeof args[1], "string");
    io.bytesWritten += Buffer.byteLength(args[1] as string);
    if (mode !== "memory") return real.writeFile(...args);
    memory.set(String(args[0]), args[1] as string);
};
fs.rename = async (...args: Parameters<typeof fs.rename>) => {
    io.renames += 1;
    if (mode !== "memory") return real.rename(...args);
    const value = memory.get(String(args[0]));
    if (value === undefined) throw missing();
    memory.set(String(args[1]), value);
    memory.delete(String(args[0]));
};
fs.unlink = async (...args: Parameters<typeof fs.unlink>) => {
    if (mode !== "memory") return real.unlink(...args);
    if (!memory.delete(String(args[0]))) throw missing();
};
syncBuiltinESMExports();

async function fixture(implementation: Awaited<ReturnType<typeof api>>, instrument = false): Promise<() => Promise<unknown>> {
    const { TelegramPromptProgress, FileThinkingMessageRepository, TelegramThinkingMessages, JsonStateStore, createDefaultOpencodeTbotState, FilePermissionApprovalRepository, copy } = implementation;
    if (isStream) {
        const writes: unknown[] = [];
        const answers: string[] = [];
        const progress = new TelegramPromptProgress(copy, async (replies, terminal) => { writes.push([replies, terminal]); },
            (error) => { throw error; }, async (text) => { answers.push(text); });
        const internal = progress as unknown as { writes: Promise<void>; render(): TelegramProgressReply[] };
        if (instrument) {
            const render = internal.render.bind(progress);
            internal.render = () => { renders += 1; return render(); };
        }
        const reasoning = "中文😀. A short paragraph.\n".repeat(scenario === "stream-long" ? 2_000 : 2);
        return async () => {
            progress.accept({ type: "session.reasoning.ended", data: { assistantMessageID: "a", ordinal: 0, text: reasoning } });
            for (let index = 0; index < 60; index += 1) {
                if (scenario === "stream-changing") progress.accept({ type: "session.reasoning.delta", data: { assistantMessageID: "a", ordinal: 0, delta: "更多思考😀。 " } });
                progress.accept({ type: "session.text.delta", data: { assistantMessageID: "a", ordinal: 0, delta: "answer" } });
                mock.timers.tick(1_000);
                if (mode === "scheduled") await setImmediate();
                else await internal.writes;
            }
            await progress.finish("completed");
            assert.equal(answers.at(-1), "answer".repeat(60));
            return [writes, answers];
        };
    }
    const path = join(directory, String(sequence++));
    await fs.mkdir(path);
    if (scenario.startsWith("thinking-")) {
        const repository = new FileThinkingMessageRepository(path);
        const service = new TelegramThinkingMessages(repository);
        const edits: unknown[] = [];
        const write = async (payload: unknown, keyboard: unknown) => { edits.push([payload, keyboard]); };
        await service.update(1, 1, { phase: "running", text: "initial" }, "request", copy, write);
        if (scenario === "thinking-expanded") await service.setExpanded(1, 1, true, "request", copy, write);
        edits.length = 0;
        return async () => {
            for (let index = 0; index < 30; index += 1) {
                await service.update(1, 1, { phase: "running", text: `chunk ${index}: ` + "中文😀. ".repeat(140) }, "request", copy, write);
            }
            return [await new FileThinkingMessageRepository(path).get(1, 1), edits];
        };
    }
    const state = createDefaultOpencodeTbotState();
    const count = scenario === "state-small" ? 20 : 5_000;
    for (let index = 0; index < count; index += 1) state.pendingPermissions[`r${index}:1`] = {
        requestId: `r${index}`, sessionId: `s${index}`, chatId: 1, messageId: index + 1,
        status: "once", updatedAt: new Date(0).toISOString(),
    };
    const filePath = join(path, "state.json");
    await fs.writeFile(filePath, JSON.stringify(state));
    const store = new JsonStateStore({ filePath, createDefaultState: createDefaultOpencodeTbotState });
    const repository = new FilePermissionApprovalRepository(store);
    await store.read();
    return async () => {
        for (let burst = 0; burst < 3; burst += 1) {
            const pending: Promise<void>[] = [];
            for (let index = 0; index < 20; index += 1) {
                const update = repository.set({ ...state.pendingPermissions[`r${index}:1`]!, messageId: burst * 20 + index + 1 });
                if (scenario === "state-serial") await update;
                else pending.push(update);
            }
            await Promise.all(pending);
        }
        const saved = JSON.parse(await fs.readFile(filePath, "utf8"));
        assert.deepEqual(await store.read(), saved);
        assert.equal(saved.pendingPermissions["r19:1"].messageId, 60);
        return saved;
    };
}

const repetitions = scenario === "stream-short" ? 100 : scenario.startsWith("stream-") ? 10 : mode === "memory" && scenario.startsWith("thinking-") ? 8 : 1;

async function measure(variant: number, repeats = repetitions, instrument = false) {
    const cases = [];
    for (let index = 0; index < repeats; index += 1) cases.push(await fixture(implementations[variant], instrument));
    global.gc?.();
    for (const key of Object.keys(io) as Array<keyof typeof io>) io[key] = 0;
    renders = 0;
    const outputs = [];
    const cpuStarted = process.cpuUsage();
    const started = performance.now();
    for (const run of cases) outputs.push(await run());
    const elapsedMs = performance.now() - started;
    const cpu = process.cpuUsage(cpuStarted);
    const operations = { ...io };
    const fingerprints = outputs.map(hash);
    assert.equal(new Set(fingerprints).size, 1);
    memory.clear();
    return { variant, repetitions: repeats, elapsedMs, cpuMs: (cpu.user + cpu.system) / 1_000, perReplayMs: elapsedMs / repeats, perReplayCpuMs: (cpu.user + cpu.system) / 1_000 / repeats, io: operations, renders: instrument ? renders : undefined, fingerprint: fingerprints[0] };
}

try {
    if (isStream) mock.timers.enable({ apis: ["setTimeout"] });
    await measure(0);
    await measure(1);
    const samples = [];
    for (let block = 0; block < blocks; block += 1) {
        for (const variant of [0, 1, 1, 0]) samples.push({ block, ...await measure(variant) });
    }
    const profiler = new Session();
    profiler.connect();
    let diagnostics;
    let functionCalls;
    try {
        await profiler.post("Profiler.enable");
        await profiler.post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
        diagnostics = [await measure(0, 1, true), await measure(1, 1, true)];
        const coverage = await profiler.post("Profiler.takePreciseCoverage");
        functionCalls = roots.map((root) => Object.fromEntries(
            ["cloneState", "buildThinkingMessageReply", "render"].map((name) => [
                name, coverage.result.filter((script) => script.url.includes(`${root}/src/`))
                    .flatMap((script) => script.functions).filter((fn) => fn.functionName === name)
                    .reduce((total, fn) => total + (fn.ranges[0]?.count ?? 0), 0),
            ]),
        ));
    } finally {
        profiler.disconnect();
    }
    assert.equal(new Set([...samples, ...diagnostics].map((sample) => sample.fingerprint)).size, 1);
    const files = ["src/services/telegram/prompt-progress.ts", "src/services/storage/json-state-store.ts", "src/repositories/thinking-message.repo.ts", "src/services/telegram/thinking-messages.ts", "src/services/telegram/telegram-format.ts"];
    const sourceHashes = await Promise.all(roots.map(async (root) => Object.fromEntries(await Promise.all(files.map(async (file) => [file, createHash("sha256").update(await real.readFile(join(root, file))).digest("hex")])))));
    console.log(JSON.stringify({ environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model }, roots, scenario, mode, blocks, repetitions, sourceHashes, samples, diagnostics, functionCalls }, null, 2));
} finally {
    Object.assign(fs, real);
    syncBuiltinESMExports();
    if (isStream) mock.timers.reset();
    await fs.rm(directory, { recursive: true, force: true });
}
