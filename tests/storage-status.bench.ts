import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { arch, cpus, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import type { ChatSessionBinding } from "../src/domain/session/session.entity.js";

// Run with pnpm exec tsx tests/storage-status.bench.ts [source-checkout]. Uses only synthetic state and SDK responses.
const root = resolve(process.argv[2] ?? ".");
const load = (file: string) => import(pathToFileURL(join(root, file)).href);
const { JsonStateStore } = await load("src/services/storage/json-state-store.ts") as typeof import("../src/services/storage/json-state-store.js");
const { createDefaultOpencodeTbotState } = await load("src/services/storage/bot-state.ts") as typeof import("../src/services/storage/bot-state.js");
const { FileSessionRepository, InMemorySessionRepository } = await load("src/repositories/session.repo.ts") as typeof import("../src/repositories/session.repo.js");
const { OpenCodeClient } = await load("src/services/opencode/opencode.client.ts") as typeof import("../src/services/opencode/opencode.client.js");
const { ListLspUseCase } = await load("src/use-cases/list-lsp.usecase.ts") as typeof import("../src/use-cases/list-lsp.usecase.js");
const { ListMcpUseCase } = await load("src/use-cases/list-mcp.usecase.ts") as typeof import("../src/use-cases/list-mcp.usecase.js");
const { ListSessionsUseCase } = await load("src/use-cases/list-sessions.usecase.ts") as typeof import("../src/use-cases/list-sessions.usecase.js");
const { GetHealthUseCase } = await load("src/use-cases/get-health.usecase.ts") as typeof import("../src/use-cases/get-health.usecase.js");
const { GetPathUseCase } = await load("src/use-cases/get-path.usecase.ts") as typeof import("../src/use-cases/get-path.usecase.js");
const { createStatusSectionProviders, GetStatusUseCase } = await load("src/use-cases/get-status.usecase.ts") as typeof import("../src/use-cases/get-status.usecase.js");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const binding: ChatSessionBinding = {
    chatId: 1, sessionId: "s999", projectId: "p", directory: "/external-worktree", agentName: null,
    modelProviderId: null, modelId: null, modelVariant: null, language: "en", updatedAt: new Date(0).toISOString(),
};
const directory = await mkdtemp(join(tmpdir(), "tbot-storage-bench-"));

async function storage(permissionCount: number) {
    const state = createDefaultOpencodeTbotState();
    state.sessions["1"] = binding;
    for (let index = 0; index < permissionCount; index += 1) {
        state.pendingPermissions[`r${index}:1`] = {
            requestId: `r${index}`, sessionId: `s${index}`, chatId: 1, messageId: index + 1,
            status: "once", updatedAt: new Date(0).toISOString(),
        };
    }
    const repository = new FileSessionRepository(new JsonStateStore({
        filePath: join(directory, `${permissionCount}.json`), createDefaultState: () => state,
    }));
    assert.deepEqual(await repository.getByChatId(1), binding);
    const samplesMs: number[] = [];
    for (let sample = 0; sample < 5; sample += 1) {
        const start = performance.now();
        for (let index = 0; index < 50; index += 1) await repository.getByChatId(1);
        samplesMs.push(performance.now() - start);
    }
    const result = await repository.getByChatId(1);
    assert.deepEqual(result, binding);
    return { permissionCount, stateBytes: Buffer.byteLength(JSON.stringify(state)), readsPerSample: 50, samplesMs, medianMs: median(samplesMs), fingerprint: hash(result) };
}

async function catalogs(status: boolean) {
    const sessionCount = 1_000;
    const sessions = Array.from({ length: sessionCount }, (_, index) => ({
        id: `s${index}`, projectID: "p", location: { directory: "/external-worktree" },
        title: `Session ${index}`, time: { created: 1, updated: 1 },
    }));
    let pages = 0;
    let lookups = 0;
    const client = new OpenCodeClient(undefined, {
        session: {
            async list(input: { cursor?: string }) {
                pages += 1;
                await delay(2);
                const offset = Number(input.cursor ?? 0);
                return { data: sessions.slice(offset, offset + 100), cursor: { next: offset + 100 < sessionCount ? `${offset + 100}` : null } };
            },
            async get(input: { sessionID: string }) { lookups += 1; await delay(2); return sessions.find((session) => session.id === input.sessionID); },
        },
        project: { async list() { return [{ id: "p", canonical: "/repo", sandboxes: [] }]; } },
        server: { async info() { return { version: "2.0.29" }; } },
        location: { async get() { return { directory: "/repo", project: { id: "p", directory: "/repo" } }; } },
        plugin: { async list() { return { data: [] }; } },
        mcp: { async list() { return { data: [] }; } },
    } as never);
    const repository = new InMemorySessionRepository();
    await repository.setCurrent({ ...binding });
    const lsp = new ListLspUseCase(repository, client);
    const mcp = new ListMcpUseCase(repository, client);
    const started = performance.now();
    const result = status ? await new GetStatusUseCase(createStatusSectionProviders({
        configuredPluginReader: client, sessionRepo: repository,
        getHealthUseCase: new GetHealthUseCase(client), getPathUseCase: new GetPathUseCase(client),
        listSessionsUseCase: new ListSessionsUseCase(repository, client), listLspUseCase: lsp, listMcpUseCase: mcp,
    })).execute({ chatId: 1 }) : await Promise.all([lsp.execute({ chatId: 1 }), mcp.execute({ chatId: 1 })]);
    const elapsedMs = performance.now() - started;
    assert.deepEqual(await repository.getByChatId(1), binding);
    return { elapsedMs, pages, lookups, fingerprint: hash(result) };
}

try {
    const storageResults = [];
    for (const count of [10, 1_000, 10_000]) storageResults.push(await storage(count));
    await catalogs(false);
    await catalogs(true);
    const validationSamples = [];
    const statusSamples = [];
    for (let sample = 0; sample < 5; sample += 1) {
        validationSamples.push(await catalogs(false));
        statusSamples.push(await catalogs(true));
    }
    const sourceFiles = ["src/services/storage/json-state-store.ts", "src/repositories/session.repo.ts", "src/repositories/pending-action.repo.ts", "src/repositories/permission-approval.repo.ts", "src/use-cases/project-binding.ts", "src/use-cases/list-lsp.usecase.ts", "src/use-cases/list-mcp.usecase.ts", "src/use-cases/list-sessions.usecase.ts", "src/use-cases/get-status.usecase.ts"];
    console.log(JSON.stringify({
        environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
        sourceHashes: Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, hash(await readFile(join(root, file), "utf8"))]))),
        storage: storageResults,
        externalWorktreeValidation: { sessionCount: 1_000, simulatedRequestLatencyMs: 2, samples: validationSamples, medianMs: median(validationSamples.map((sample) => sample.elapsedMs)) },
        status: { sessionCount: 1_000, simulatedRequestLatencyMs: 2, samples: statusSamples, medianMs: median(statusSamples.map((sample) => sample.elapsedMs)) },
    }, null, 2));
} finally {
    await rm(directory, { recursive: true, force: true });
}
