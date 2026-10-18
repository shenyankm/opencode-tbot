import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { arch, cpus, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mock } from "node:test";
import { setImmediate } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import type { TelegramProgressReply } from "../src/services/telegram/prompt-progress.js";

// pnpm exec tsx tests/stream-storage.bench.ts [source-checkout] [scenario]
const root = resolve(process.argv[2] ?? ".");
const scenario = process.argv[3] ?? "stream-long";
const load = (file: string) => import(pathToFileURL(join(root, file)).href);
const { TelegramPromptProgress } = await load("src/services/telegram/prompt-progress.ts") as typeof import("../src/services/telegram/prompt-progress.js");
const { FileThinkingMessageRepository } = await load("src/repositories/thinking-message.repo.ts") as typeof import("../src/repositories/thinking-message.repo.js");
const { TelegramThinkingMessages } = await load("src/services/telegram/thinking-messages.ts") as typeof import("../src/services/telegram/thinking-messages.js");
const { JsonStateStore } = await load("src/services/storage/json-state-store.ts") as typeof import("../src/services/storage/json-state-store.js");
const { FilePermissionApprovalRepository } = await load("src/repositories/permission-approval.repo.ts") as typeof import("../src/repositories/permission-approval.repo.js");
const { createDefaultOpencodeTbotState } = await load("src/services/storage/bot-state.ts") as typeof import("../src/services/storage/bot-state.js");
const { getBotCopy } = await load("src/bot/copy.ts") as typeof import("../src/bot/copy.js");
const copy = getBotCopy("en");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const directory = await fs.mkdtemp(join(tmpdir(), "tbot-stream-storage-"));
let sequence = 0;

async function streaming() {
    mock.timers.enable({ apis: ["setTimeout"] });
    const reasoning = "中文😀. A short paragraph.\n".repeat(scenario === "stream-long" ? 2_000 : 2);
    const writes: Array<{ replies: TelegramProgressReply[]; terminal: boolean }> = [];
    const answers: string[] = [];
    const progress = new TelegramPromptProgress(copy, async (replies, terminal) => { writes.push({ replies, terminal }); },
        (error) => { throw error; }, async (text) => { answers.push(text); });
    const internal = progress as unknown as { render(): TelegramProgressReply[] };
    const render = internal.render.bind(progress);
    let renders = 0;
    internal.render = () => { renders += 1; return render(); };
    const cpuStarted = process.cpuUsage();
    const started = performance.now();
    try {
        progress.accept({ type: "session.reasoning.ended", data: { assistantMessageID: "a", ordinal: 0, text: reasoning } });
        for (let index = 0; index < 60; index += 1) {
            if (scenario === "stream-changing") progress.accept({ type: "session.reasoning.delta", data: { assistantMessageID: "a", ordinal: 0, delta: "更多思考😀。 " } });
            progress.accept({ type: "session.text.delta", data: { assistantMessageID: "a", ordinal: 0, delta: "answer" } });
            mock.timers.tick(1_000);
            await setImmediate();
        }
        await progress.finish("completed");
        const elapsedMs = performance.now() - started;
        const cpu = process.cpuUsage(cpuStarted);
        const final = writes.at(-1)!;
        assert.equal(final.replies.map((reply) => reply.thinking!.text).join(""), reasoning + (scenario === "stream-changing" ? "更多思考😀。 ".repeat(60) : ""));
        assert.ok(final.terminal && final.replies.every((reply) => reply.thinking!.phase === "completed"));
        assert.equal(answers.at(-1), "answer".repeat(60));
        return { elapsedMs, cpuMs: (cpu.user + cpu.system) / 1_000, renders, writes: writes.length, reasoningCharacters: reasoning.length, answerUpdates: answers.length, fingerprint: hash([writes, answers]) };
    } finally {
        mock.timers.reset();
    }
}

async function storage(instrument = false) {
    const path = join(directory, String(sequence++));
    await fs.mkdir(path);
    const repository = new FileThinkingMessageRepository(path);
    const service = new TelegramThinkingMessages(repository);
    const edits: unknown[] = [];
    const write = async (payload: unknown, keyboard: unknown) => { edits.push([payload, keyboard]); };
    await service.update(1, 1, { phase: "running", text: "initial" }, "request", copy, write);
    if (scenario === "storage-expanded") await service.setExpanded(1, 1, true, "request", copy, write);
    edits.length = 0;
    const mkdir = instrument ? mock.method(fs, "mkdir") : null;
    const read = instrument ? mock.method(fs, "readFile") : null;
    const writeFile = instrument ? mock.method(fs, "writeFile") : null;
    const rename = instrument ? mock.method(fs, "rename") : null;
    if (instrument) syncBuiltinESMExports();
    let io;
    const cpuStarted = process.cpuUsage();
    const started = performance.now();
    try {
        for (let index = 0; index < 30; index += 1) {
            if (scenario === "storage-cold") {
                const store = new JsonStateStore({ filePath: join(path, String(index), "state.json"), createDefaultState: () => ({ count: 0 }) });
                await store.update((state) => { state.count = 1; });
            } else {
                await service.update(1, 1, { phase: "running", text: `chunk ${index}: ` + "中文😀. ".repeat(140) }, "request", copy, write);
            }
        }
        const elapsedMs = performance.now() - started;
        const cpu = process.cpuUsage(cpuStarted);
        if (instrument) io = { mkdir: mkdir!.mock.callCount(), reads: read!.mock.callCount(), writes: writeFile!.mock.callCount(), renames: rename!.mock.callCount() };
        const final = await new FileThinkingMessageRepository(path).get(1, 1);
        assert.equal(final!.text, scenario === "storage-cold" ? "initial" : "chunk 29: " + "中文😀. ".repeat(140));
        if (scenario !== "storage-cold") assert.equal(final!.expanded, scenario === "storage-expanded");
        return { elapsedMs, cpuMs: (cpu.user + cpu.system) / 1_000, updates: 30, edits: edits.length, io, fingerprint: hash([final, edits]) };
    } finally {
        for (const spy of [mkdir, read, writeFile, rename]) spy?.mock.restore();
        if (instrument) syncBuiltinESMExports();
    }
}

async function stateWrites(instrument = false) {
    const count = scenario === "storage-batch-small" ? 20 : 5_000;
    const state = createDefaultOpencodeTbotState();
    for (let index = 0; index < count; index += 1) state.pendingPermissions[`r${index}:1`] = {
        requestId: `r${index}`, sessionId: `s${index}`, chatId: 1, messageId: index + 1,
        status: "once", updatedAt: new Date(0).toISOString(),
    };
    const filePath = join(directory, `${sequence++}.json`);
    await fs.writeFile(filePath, JSON.stringify(state));
    const store = new JsonStateStore({ filePath, createDefaultState: createDefaultOpencodeTbotState });
    const repository = new FilePermissionApprovalRepository(store);
    await store.read();
    const write = instrument ? mock.method(fs, "writeFile") : null;
    const rename = instrument ? mock.method(fs, "rename") : null;
    if (instrument) syncBuiltinESMExports();
    try {
        const cpuStarted = process.cpuUsage();
        const started = performance.now();
        for (let burst = 0; burst < 3; burst += 1) {
            const pending: Promise<void>[] = [];
            for (let index = 0; index < 20; index += 1) {
                const update = repository.set({ ...state.pendingPermissions[`r${index}:1`]!, messageId: burst * 20 + index + 1 });
                if (scenario === "storage-serial-large") await update;
                else pending.push(update);
            }
            await Promise.all(pending);
        }
        const elapsedMs = performance.now() - started;
        const cpu = process.cpuUsage(cpuStarted);
        const io = instrument ? {
            writes: write!.mock.callCount(), renames: rename!.mock.callCount(),
            bytesWritten: write!.mock.calls.reduce((total, call) => total + Buffer.byteLength(call.arguments[1] as string), 0),
        } : undefined;
        const saved = await fs.readFile(filePath, "utf8");
        assert.deepEqual(await store.read(), JSON.parse(saved));
        assert.equal((await store.read()).pendingPermissions["r19:1"]!.messageId, 60);
        return { elapsedMs, cpuMs: (cpu.user + cpu.system) / 1_000, updates: 60, permissions: count, stateBytes: Buffer.byteLength(saved), io, fingerprint: hash(JSON.parse(saved)) };
    } finally {
        write?.mock.restore();
        rename?.mock.restore();
        if (instrument) syncBuiltinESMExports();
    }
}

try {
    assert.ok(["stream-long", "stream-short", "stream-changing", "storage-expanded", "storage-collapsed", "storage-cold", "storage-batch-small", "storage-batch-large", "storage-serial-large"].includes(scenario));
    const runStorage = scenario.startsWith("storage-batch-") || scenario === "storage-serial-large" ? stateWrites : storage;
    const run = scenario.startsWith("stream-") ? streaming : runStorage;
    const warmups = scenario === "stream-short" ? 1_000 : scenario.startsWith("stream-") ? 10 : 1;
    for (let index = 0; index < warmups; index += 1) await run();
    const samples = [];
    for (let index = 0; index < 7; index += 1) samples.push(await run());
    assert.equal(new Set(samples.map((sample) => sample.fingerprint)).size, 1);
    const ioSample = scenario.startsWith("storage-") ? await runStorage(true) : null;
    const sourceFiles = ["src/services/telegram/prompt-progress.ts", "src/services/storage/json-state-store.ts", "src/repositories/thinking-message.repo.ts", "src/services/telegram/thinking-messages.ts", "src/services/telegram/telegram-format.ts"];
    console.log(JSON.stringify({
        environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
        sourceHashes: Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, createHash("sha256").update(await fs.readFile(join(root, file))).digest("hex")]))),
        scenario, warmups, samples, medianMs: median(samples.map((sample) => sample.elapsedMs)), ioSample,
    }, null, 2));
} finally {
    await fs.rm(directory, { recursive: true, force: true });
}
