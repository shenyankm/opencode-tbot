import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { arch, cpus, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

// Run with pnpm exec tsx tests/session-write.bench.ts [source-checkout]. Uses an isolated temporary directory and synthetic SDK responses.
const root = resolve(process.argv[2] ?? ".");
const load = (file: string) => import(pathToFileURL(join(root, file)).href);
const { OpenCodeClient } = await load("src/services/opencode/opencode.client.ts") as typeof import("../src/services/opencode/opencode.client.js");
const { InMemorySessionRepository } = await load("src/repositories/session.repo.ts") as typeof import("../src/repositories/session.repo.js");
const { ListSessionsUseCase } = await load("src/use-cases/list-sessions.usecase.ts") as typeof import("../src/use-cases/list-sessions.usecase.js");
const { JsonStateStore } = await load("src/services/storage/json-state-store.ts") as typeof import("../src/services/storage/json-state-store.js");
const { FilePermissionApprovalRepository } = await load("src/repositories/permission-approval.repo.ts") as typeof import("../src/repositories/permission-approval.repo.js");
const { createDefaultOpencodeTbotState } = await load("src/services/storage/bot-state.ts") as typeof import("../src/services/storage/bot-state.js");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const directory = await mkdtemp(join(tmpdir(), "tbot-write-bench-"));

async function sessions(stale: boolean) {
    const projects = Array.from({ length: 10 }, (_, index) => ({ id: `p${index}`, canonical: `/repo${index}`, sandboxes: [] }));
    const entries = Array.from({ length: 1_000 }, (_, index) => ({
        id: `s${index}`, projectID: `p${index % 10}`, location: { directory: `/repo${index % 10}` },
        title: `Session ${index}`, time: { created: 1, updated: 1 },
    }));
    let pages = 0;
    let bytes = 0;
    const client = new OpenCodeClient(undefined, {
        session: { async list(input: { project?: string; cursor?: string }) {
            pages += 1;
            await delay(2);
            const matching = entries.filter((entry) => !input.project || entry.projectID === input.project);
            const offset = Number(input.cursor ?? 0);
            const result = { data: matching.slice(offset, offset + 100), cursor: { next: offset + 100 < matching.length ? `${offset + 100}` : null } };
            bytes += Buffer.byteLength(JSON.stringify(result));
            return result;
        } },
        project: { async list() { return projects; } },
        location: { async get() { return { directory: "/repo0", project: { id: "p0", directory: "/repo0" } }; } },
    } as never);
    const repository = new InMemorySessionRepository();
    await repository.setCurrent({
        chatId: 1, sessionId: stale ? "missing" : "s0", projectId: stale ? "missing" : "p0",
        directory: stale ? "/missing" : "/repo0", agentName: null, modelProviderId: null,
        modelId: null, modelVariant: null, language: "en", updatedAt: new Date(0).toISOString(),
    });
    const start = performance.now();
    const result = await new ListSessionsUseCase(repository, client).execute({ chatId: 1 });
    const elapsedMs = performance.now() - start;
    assert.equal(result.sessions.length, 100);
    assert.ok(result.sessions.every((session) => session.projectID === "p0"));
    assert.equal(result.currentSessionId, stale ? null : "s0");
    return { elapsedMs, pages, bytes, fingerprint: hash(result) };
}

async function writes(permissionCount: number) {
    const state = createDefaultOpencodeTbotState();
    for (let index = 0; index < permissionCount; index += 1) state.pendingPermissions[`r${index}:1`] = {
        requestId: `r${index}`, sessionId: `s${index}`, chatId: 1, messageId: index + 1,
        status: "once", updatedAt: new Date(0).toISOString(),
    };
    const filePath = join(directory, `${permissionCount}.json`);
    await writeFile(filePath, JSON.stringify(state));
    const store = new JsonStateStore({ filePath, createDefaultState: createDefaultOpencodeTbotState });
    const repository = new FilePermissionApprovalRepository(store);
    await store.read();
    await repository.set({ ...state.pendingPermissions["r0:1"], messageId: 20 });
    const samplesMs: number[] = [];
    for (let sample = 0; sample < 7; sample += 1) {
        const start = performance.now();
        for (let index = 0; index < 20; index += 1) await repository.set({ ...state.pendingPermissions["r0:1"], messageId: index + 1 });
        samplesMs.push(performance.now() - start);
    }
    const saved = JSON.parse(await readFile(filePath, "utf8"));
    assert.deepEqual(await store.read(), saved);
    assert.equal(saved.pendingPermissions["r0:1"].messageId, 20);
    return { permissionCount, stateBytes: Buffer.byteLength(JSON.stringify(saved)), writesPerSample: 20, samplesMs, medianMs: median(samplesMs), fingerprint: hash(saved) };
}

try {
    await sessions(false);
    const listings = [];
    for (const stale of [false, true]) {
        const samples = [];
        for (let sample = 0; sample < 5; sample += 1) samples.push(await sessions(stale));
        listings.push({ stale, totalSessions: 1_000, selectedProjectSessions: 100, simulatedPageLatencyMs: 2, samples, medianMs: median(samples.map((sample) => sample.elapsedMs)) });
    }
    const writeResults = [];
    for (const size of [10, 1_000, 5_000]) writeResults.push(await writes(size));
    const sourceFiles = ["src/services/opencode/opencode.client.ts", "src/services/opencode/opencode.ports.ts", "src/use-cases/list-sessions.usecase.ts", "src/services/storage/json-state-store.ts"];
    console.log(JSON.stringify({
        environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
        sourceHashes: Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, hash(await readFile(join(root, file), "utf8"))]))),
        listings, writes: writeResults,
    }, null, 2));
} finally {
    await rm(directory, { recursive: true, force: true });
}
