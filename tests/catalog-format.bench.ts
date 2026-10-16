import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { arch, cpus, platform } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

// Run with pnpm exec tsx tests/catalog-format.bench.ts [source-checkout]. No services or credentials are used.
const root = resolve(process.argv[2] ?? ".");
const load = (file: string) => import(pathToFileURL(join(root, file)).href);
const { OpenCodeClient } = await load("src/services/opencode/opencode.client.ts") as typeof import("../src/services/opencode/opencode.client.js");
const { InMemorySessionRepository } = await load("src/repositories/session.repo.ts") as typeof import("../src/repositories/session.repo.js");
const { GetStatusUseCase, createStatusSectionProviders } = await load("src/use-cases/get-status.usecase.ts") as typeof import("../src/use-cases/get-status.usecase.js");
const { GetHealthUseCase } = await load("src/use-cases/get-health.usecase.ts") as typeof import("../src/use-cases/get-health.usecase.js");
const { GetPathUseCase } = await load("src/use-cases/get-path.usecase.ts") as typeof import("../src/use-cases/get-path.usecase.js");
const { ListSessionsUseCase } = await load("src/use-cases/list-sessions.usecase.ts") as typeof import("../src/use-cases/list-sessions.usecase.js");
const { ListMcpUseCase } = await load("src/use-cases/list-mcp.usecase.ts") as typeof import("../src/use-cases/list-mcp.usecase.js");
const { ListLspUseCase } = await load("src/use-cases/list-lsp.usecase.ts") as typeof import("../src/use-cases/list-lsp.usecase.js");
const { buildTelegramPromptReplies } = await load("src/services/telegram/telegram-format.ts") as typeof import("../src/services/telegram/telegram-format.js");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function statuses(concurrency: number) {
    let requests = 0;
    const client = new OpenCodeClient(undefined, {
        project: { async list() { requests += 1; await delay(2); return [{ id: "p", canonical: "/repo", sandboxes: [] }]; } },
        session: { async get() { return { id: "s", projectID: "p", title: "Session", location: { directory: "/repo" } }; } },
        location: { async get() { return { directory: "/repo", project: { id: "p", directory: "/repo" } }; } },
        server: { async info() { return { version: "2.0.29" }; } },
        plugin: { async list() { return { data: [] }; } },
        mcp: { async list() { return { data: [] }; } },
    } as never);
    const repository = new InMemorySessionRepository();
    await repository.setCurrent({
        chatId: 1, sessionId: "s", projectId: "p", directory: "/repo", agentName: null,
        modelProviderId: null, modelId: null, modelVariant: null, language: "en", updatedAt: new Date(0).toISOString(),
    });
    const useCase = new GetStatusUseCase(createStatusSectionProviders({
        configuredPluginReader: client, sessionRepo: repository,
        getHealthUseCase: new GetHealthUseCase(client), getPathUseCase: new GetPathUseCase(client),
        listSessionsUseCase: new ListSessionsUseCase(repository, client),
        listLspUseCase: new ListLspUseCase(repository, client), listMcpUseCase: new ListMcpUseCase(repository, client),
    }));
    const start = performance.now();
    const results = await Promise.all(Array.from({ length: concurrency }, () => useCase.execute({ chatId: 1 })));
    const elapsedMs = performance.now() - start;
    assert.ok(results.every((result) => result.workspace.status === "ok" && result.workspace.data.currentSession === "Session (s)"));
    const firstBatchRequests = requests;
    await useCase.execute({ chatId: 1 });
    assert.ok(requests > firstBatchRequests);
    return { concurrency, elapsedMs, projectRequests: firstBatchRequests, freshNextBatchRequests: requests - firstBatchRequests, fingerprint: hash(results) };
}

function formatting(body: string) {
    const input = { bodyMd: body, fallbackText: body };
    buildTelegramPromptReplies(input);
    const samplesMs: number[] = [];
    for (let sample = 0; sample < 7; sample += 1) {
        const start = performance.now();
        for (let index = 0; index < 20; index += 1) buildTelegramPromptReplies(input);
        samplesMs.push(performance.now() - start);
    }
    const result = buildTelegramPromptReplies(input);
    assert.ok(result.length > 1);
    assert.ok(result.every((reply) => reply.preferred.text.length > 0 && reply.fallback.text.length > 0));
    return { characters: body.length, rendersPerSample: 20, samplesMs, medianMs: median(samplesMs), chunks: result.length, fingerprint: hash(result) };
}

await statuses(1);
const projectQueries = [];
for (const concurrency of [1, 20]) {
    const samples = [];
    for (let sample = 0; sample < 5; sample += 1) samples.push(await statuses(concurrency));
    projectQueries.push({ concurrency, samples, medianMs: median(samples.map((sample) => sample.elapsedMs)) });
}
const formats = {
    prose: formatting("## Overview\n\nAn ordinary **answer** with 中文😀 and several sentences.\nAnother line explains the same result clearly.\n\n".repeat(300)),
    code: formatting("```ts\n" + "const value: string | null = null; // Keep the original code.\n".repeat(600) + "```"),
    table: formatting("| Name | Value |\n| --- | --- |\n" + "| 中文😀 **row** | A `formatted` result |\n".repeat(600)),
};
const sourceFiles = ["src/services/opencode/opencode.client.ts", "src/services/telegram/telegram-format.ts", "src/infra/utils/markdown-text.ts"];
console.log(JSON.stringify({
    environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
    sourceHashes: Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, hash(await readFile(join(root, file), "utf8"))]))),
    projectQueries, formats,
}, null, 2));
