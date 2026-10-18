import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { arch, cpus, platform } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Run with pnpm exec tsx tests/footer-split.bench.ts [source-checkout] [scenario]. No services or credentials are used.
const root = resolve(process.argv[2] ?? ".");
const scenario = process.argv[3];
const { buildTelegramSessionFooter, formatContextFooter, splitTelegramText } = await import(
    pathToFileURL(join(root, "src/services/telegram/telegram-format.ts")).href
) as typeof import("../src/services/telegram/telegram-format.js");
const { getBotCopy } = await import(pathToFileURL(join(root, "src/bot/copy.ts")).href) as typeof import("../src/bot/copy.js");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function measure(run: () => unknown, iterations: number) {
    for (let index = 0; index < iterations; index += 1) run();
    const samplesMs: number[] = [];
    for (let sample = 0; sample < 9; sample += 1) {
        const started = performance.now();
        for (let index = 0; index < iterations; index += 1) run();
        samplesMs.push(performance.now() - started);
    }
    return { iterations, samplesMs, medianMs: median(samplesMs), fingerprint: hash(run()) };
}

const contexts = [1_000, 128_000, 475_000, 1_000_000].map((capacity) => ({
    capacity, used: capacity / 4,
    session: { directory: "/workspace/project", modelName: "Model", providerID: "provider", variant: "high", agentName: "Build" },
}));
const copies = (["en", "zh-CN", "ja"] as const).map(getBotCopy);
const footers = Object.fromEntries(Object.entries({
    context: { run: () => copies.flatMap((copy) => contexts.map((context) => formatContextFooter(context, copy))), iterations: 1_000 },
    session: { run: () => copies.flatMap((copy) => contexts.map((context) => buildTelegramSessionFooter(context, copy, 1_250))), iterations: 300 },
    unavailable: { run: () => copies.map((copy) => buildTelegramSessionFooter(null, copy, null)), iterations: 5_000 },
}).filter(([name]) => !scenario || name === scenario).map(([name, { run, iterations }]) => [name, measure(run, iterations)]));

const splits = Object.fromEntries(Object.entries({
    sentences: "中文😀。 A complete sentence. Next sentence! ".repeat(2_000),
    paragraphs: "## Overview\n\nAn ordinary **answer** with 中文😀 and several sentences.\nAnother line explains the same result clearly.\n\n".repeat(300),
    unbroken: "无😀".repeat(20_000),
}).filter(([name]) => !scenario || name === scenario).map(([name, text]) => {
    const chunks = splitTelegramText(text);
    assert.equal(chunks.join(""), text);
    assert.ok(chunks.every((chunk) => chunk.length > 0 && chunk.length <= 1152));
    assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/u.test(chunk) && !/^[\uDC00-\uDFFF]/u.test(chunk)));
    return [name, { characters: text.length, chunks: chunks.length, ...measure(() => splitTelegramText(text), 50) }];
}));

assert.ok(Object.keys(footers).length + Object.keys(splits).length > 0, "Unknown benchmark scenario.");

console.log(JSON.stringify({
    environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
    sourceHash: createHash("sha256").update(await readFile(join(root, "src/services/telegram/telegram-format.ts"))).digest("hex"),
    footers, splits,
}, null, 2));
