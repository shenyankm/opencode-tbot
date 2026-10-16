import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { arch, cpus, platform } from "node:os";
import { join, resolve } from "node:path";
import { mock } from "node:test";
import { setImmediate, setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import type { TelegramProgressReply } from "../src/services/telegram/prompt-progress.js";

// Run with pnpm exec tsx tests/performance.bench.ts [source-checkout]. No services or credentials are used.
const root = resolve(process.argv[2] ?? ".");
const { TelegramPromptProgress } = await import(pathToFileURL(join(root, "src/services/telegram/prompt-progress.ts")).href) as typeof import("../src/services/telegram/prompt-progress.js");
const { OpenCodeClient } = await import(pathToFileURL(join(root, "src/services/opencode/opencode.client.ts")).href) as typeof import("../src/services/opencode/opencode.client.js");
const { getBotCopy } = await import(pathToFileURL(join(root, "src/bot/copy.ts")).href) as typeof import("../src/bot/copy.js");
const copy = getBotCopy("en");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const reasoning = "中文😀. A short paragraph.\n".repeat(4_000);

async function staticThinking() {
    mock.timers.enable({ apis: ["setTimeout"] });
    const segmentation = mock.method(Intl.Segmenter.prototype, "segment");
    let final: TelegramProgressReply[] = [];
    let answer = "";
    const progress = new TelegramPromptProgress(copy, async (replies) => { final = replies; },
        (error) => { throw error; }, async (text) => { answer = text; });
    const started = performance.now();
    try {
        progress.accept({ type: "session.reasoning.ended", data: { assistantMessageID: "a", ordinal: 0, text: reasoning } });
        for (let index = 0; index < 10; index += 1) {
            progress.accept({ type: "session.text.delta", data: { assistantMessageID: "a", ordinal: 0, delta: "answer" } });
            mock.timers.tick(1_000);
            await setImmediate();
        }
        await progress.finish("completed");
        const elapsedMs = performance.now() - started;
        assert.equal(final.map((reply) => reply.thinking!.text).join(""), reasoning);
        assert.equal(answer, "answer".repeat(10));
        assert.ok(final.every((reply) => reply.thinking!.phase === "completed"));
        return { elapsedMs, segmentations: segmentation.mock.callCount(), chunks: final.length, fingerprint: hash([final, answer]) };
    } finally {
        segmentation.mock.restore();
        mock.timers.reset();
    }
}

async function slowDelivery() {
    mock.timers.enable({ apis: ["setTimeout"] });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let writes = 0;
    let final: TelegramProgressReply[] = [];
    let answer = "";
    const progress = new TelegramPromptProgress(copy, async (replies) => {
        writes += 1;
        final = replies;
        if (writes === 1) await blocked;
    }, (error) => { throw error; }, async (text) => { answer = text; });
    const renders = mock.method(progress as unknown as { render(): TelegramProgressReply[] }, "render");
    try {
        for (let index = 0; index < 50; index += 1) {
            progress.accept({ type: "session.reasoning.delta", data: { assistantMessageID: "a", ordinal: 0, delta: "思考😀" } });
            progress.accept({ type: "session.text.delta", data: { assistantMessageID: "a", ordinal: 0, delta: "answer" } });
            mock.timers.tick(1_000);
            await setImmediate();
        }
        const finishing = progress.finish("stopped");
        release();
        await finishing;
        assert.equal(final.map((reply) => reply.thinking!.text).join(""), "思考😀".repeat(50));
        assert.equal(answer, "answer".repeat(50));
        assert.ok(final.every((reply) => reply.thinking!.phase === "stopped"));
        return { timerWindows: 50, renders: renders.mock.callCount(), writes, fingerprint: hash([final, answer]) };
    } finally {
        release();
        renders.mock.restore();
        mock.timers.reset();
    }
}

async function contextLatency() {
    let requests = 0;
    const wait = async () => { requests += 1; await delay(10); };
    const client = new OpenCodeClient(undefined, {
        session: { async get() { await wait(); return { model: { providerID: "p", id: "m" }, agent: "build" }; } },
        model: { async list() { await wait(); return { data: [{ id: "m", providerID: "p", limit: { context: 1000 } }] }; } },
        agent: { async list() { await wait(); return { data: [{ id: "build", name: "Build" }] }; } },
        message: { async list() {
            await wait();
            return { data: [{ type: "assistant", tokens: { input: 100, output: 20, reasoning: 5, cache: { read: 10, write: 0 } } }], cursor: {} };
        } },
    } as never);
    const started = performance.now();
    const result = await client.getSessionContext("s");
    const elapsedMs = performance.now() - started;
    assert.equal(result.used, 135);
    assert.equal(result.capacity, 1000);
    assert.equal(requests, 4);
    return { elapsedMs, requests, fingerprint: hash(result) };
}

await staticThinking();
await contextLatency();
const thinkingSamples = [];
const contextSamples = [];
for (let index = 0; index < 5; index += 1) {
    thinkingSamples.push(await staticThinking());
    contextSamples.push(await contextLatency());
}
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const sourceFiles = ["src/services/telegram/prompt-progress.ts", "src/services/telegram/thinking-messages.ts", "src/services/opencode/opencode.client.ts"];
console.log(JSON.stringify({
    environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
    sourceHashes: Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, hash(await readFile(join(root, file), "utf8"))]))),
    staticThinking: { characters: reasoning.length, answerUpdates: 10, samples: thinkingSamples, medianMs: median(thinkingSamples.map((sample) => sample.elapsedMs)) },
    slowDelivery: await slowDelivery(),
    coldContext: { simulatedRequestLatencyMs: 10, samples: contextSamples, medianMs: median(contextSamples.map((sample) => sample.elapsedMs)) },
}, null, 2));
