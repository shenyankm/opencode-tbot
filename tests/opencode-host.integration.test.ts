import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { OpenCode } from "@opencode/client";
import { Service, type Endpoint } from "@opencode/client/service";
import { installPlugin } from "../src/cli.js";
import { getGlobalOpenCodeConfigFilePath } from "../src/app/plugin-config.js";
import { BOT_COPY } from "../src/bot/copy.js";
import { createOpenCodeClientFromSdkClient } from "../src/services/opencode/opencode.client.js";
import { ForegroundSessionTracker } from "../src/services/session-activity/foreground-session-tracker.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import { AbortPromptUseCase } from "../src/use-cases/abort-prompt.usecase.js";

const SHOULD_RUN = process.env.OPENCODE_HOST_E2E === "1";

test("OpenCode v2 loads the locally built plugin, handles Telegram commands, and disposes polling", {
    skip: !SHOULD_RUN,
    timeout: 120_000,
}, async (t) => {
    const { Host } = await import("@opencode/plugin/host");
    const temporaryDirectory = realpathSync(mkdtempSync(join(tmpdir(), "opencode-tbot-host-")));
    const homeDir = join(temporaryDirectory, "home");
    const worktree = join(temporaryDirectory, "worktree");
    const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
    const env = {
        PATH: process.env.PATH,
        HOME: homeDir,
        USERPROFILE: homeDir,
        XDG_CONFIG_HOME: join(homeDir, ".config"),
        XDG_STATE_HOME: join(homeDir, ".local", "state"),
        XDG_DATA_HOME: join(homeDir, ".local", "share"),
        XDG_CACHE_HOME: join(homeDir, ".cache"),
    };
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(worktree, { recursive: true });
    let child: ChildProcessWithoutNullStreams | undefined;
    let server: ReturnType<typeof createServer> | undefined;
    t.after(async () => {
        if (child) {
            await terminateChildProcess(child);
        }
        if (server?.listening) {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
        }
        rmSync(temporaryDirectory, { recursive: true, force: true });
    });

    execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["build"], {
        cwd: repositoryRoot,
        stdio: "pipe",
    });
    const packed = JSON.parse(execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", [
        "pack", "--ignore-scripts", "--json", "--pack-destination", temporaryDirectory,
    ], { cwd: repositoryRoot, env, encoding: "utf8" })) as Array<{ filename: string }>;
    execFileSync("tar", ["-xf", join(temporaryDirectory, packed[0]!.filename), "-C", temporaryDirectory]);
    const pluginDirectory = join(temporaryDirectory, "package");
    // shortcut: Dependencies reuse the local install; verify registry installation when publishing.
    symlinkSync(join(repositoryRoot, "node_modules"), join(pluginDirectory, "node_modules"), "junction");
    mkdirSync(join(temporaryDirectory, "node_modules"));
    symlinkSync(pluginDirectory, join(temporaryDirectory, "node_modules", "opencode-tbot"), "junction");
    const entrypoints = Host.resolve({ directory: temporaryDirectory, name: "opencode-tbot" });
    assert.ok(entrypoints.server);
    const packagedPlugin = await Host.load(entrypoints.server) as { default: { id: string; setup: unknown } };
    assert.equal(packagedPlugin.default.id, "opencode-tbot");
    assert.equal(typeof packagedPlugin.default.setup, "function");

    const requests: string[] = [];
    const replies: string[] = [];
    const replyMessages: Array<{
        rich_message?: { html?: string; markdown?: string; blocks?: Array<{ text?: string }> };
        text?: string;
        reply_markup?: { inline_keyboard: Array<Array<{ callback_data: string }>> };
    }> = [];
    const editedReplies: string[] = [];
    const updates: Array<Record<string, unknown>> = [];
    let nextUpdateId = 1;
    server = createServer(async (request, response) => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) {
            chunks.push(Buffer.from(chunk));
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as typeof replyMessages[number];
        const method = request.url?.split("/").at(-1) ?? "";
        requests.push(method);
        let result: unknown = true;

        if (method === "getMe") {
            result = {
                id: 123456,
                is_bot: true,
                first_name: "OpenCode TBot",
                username: "opencode_tbot_test",
            };
        } else if (method === "getUpdates") {
            await new Promise((resolve) => setTimeout(resolve, 100));
            result = updates.splice(0, 1);
        } else if (method === "sendRichMessage" || method === "editMessageText") {
            body.text = body.rich_message?.markdown ?? body.rich_message?.html ?? body.rich_message?.blocks?.map((block) => block.text ?? "").join("\n") ?? "";
            if (method === "sendRichMessage") {
                replies.push(body.text ?? "");
                replyMessages.push(body);
            } else {
                editedReplies.push(body.text ?? "");
            }
            result = {
                message_id: replies.length,
                date: Math.floor(Date.now() / 1000),
                chat: { id: 101, type: "private" },
                rich_message: body.rich_message,
            };
        }

        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, result }));
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    await installPlugin({
        homeDir,
        botToken: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi",
        telegramApiRoot: `http://127.0.0.1:${address.port}`,
    });
    writeFileSync(getGlobalOpenCodeConfigFilePath(homeDir), JSON.stringify({ plugins: [join(pluginDirectory, "dist")] }));
    writeFileSync(join(worktree, "README.md"), "# opencode-tbot integration\n", "utf8");

    child = spawn(process.platform === "win32" ? "opencode.cmd" : "opencode", [
        "serve", "--service", "--hostname", "127.0.0.1", "--port", "0", "--print-logs", "--log-level", "warn",
    ], { cwd: worktree, env, stdio: "pipe" });
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => appendOutputChunk(stdoutChunks, chunk));
    child.stderr.on("data", (chunk: string) => appendOutputChunk(stderrChunks, chunk));
    let spawnError: Error | undefined;
    child.once("error", (error) => { spawnError = error; });
    const failureContext = () => buildFailureContext(requests, replies, stdoutChunks, stderrChunks);
    let endpoint: Endpoint | undefined;
    await waitFor(async () => {
        if (spawnError) {
            throw spawnError;
        }
        endpoint = await Service.discover({ file: join(env.XDG_STATE_HOME, "opencode", "service.json") });
        return Boolean(endpoint);
    }, 30_000, failureContext);
    assert.ok(endpoint);
    const client = OpenCode.make({
        baseUrl: endpoint.url,
        headers: { ...Service.headers(endpoint), "x-opencode-directory": encodeURIComponent(worktree) },
    });
    const location = { directory: worktree };
    assert.match((await client.server.info()).version, /^2\./u);
    await client.location.get({ location });
    await waitFor(() => requests.includes("setMyCommands") && requests.includes("getUpdates"), 30_000, failureContext);
    await waitFor(async () => (await client.plugin.list({ location })).data
        .some((plugin) => plugin.state.status === "active"), 15_000, failureContext);

    async function sendCommand(text: string, expectedReply: string): Promise<string> {
        const previousReplyCount = replies.length;
        updates.push({
            update_id: nextUpdateId++,
            message: {
                message_id: nextUpdateId,
                date: Math.floor(Date.now() / 1000),
                chat: { id: 101, type: "private" },
                from: { id: 101, is_bot: false, first_name: "Test", language_code: "en" },
                text,
                entities: [{ offset: 0, length: text.split(" ")[0]!.length, type: "bot_command" }],
            },
        });
        await waitFor(() => replies.length > previousReplyCount, 15_000, failureContext);
        const reply = replies.at(-1)!;
        assert.ok(reply.includes(expectedReply), failureContext());
        return reply;
    }

    const status = await sendCommand("/status", "Connectivity");
    assert.ok(requests.includes("sendRichMessage"), failureContext());
    assert.ok(!requests.includes("sendMessage"), "Text delivery must use Rich Messages.");
    assert.ok(status.includes("🟢"), failureContext());
    await sendCommand("/new V2 integration session", "V2 integration session");
    const sessions = await client.session.list({ directory: worktree });
    const session = sessions.data.find((entry) => entry.title === "V2 integration session");
    assert.ok(session);
    await sendCommand("/sessions", BOT_COPY.sessions.title);
    const agents = await client.agent.list({ location });
    assert.ok(agents.data.length > 0);
    await sendCommand("/agents", BOT_COPY.agents.title);
    const models = await client.model.list({ location });
    await sendCommand("/models", models.data.length > 0 ? BOT_COPY.models.title : BOT_COPY.models.none);

    await client.session.update({
        sessionID: session.id,
        permissions: [{ action: "tbot.integration", resource: "*", effect: "ask" }],
    });
    const permission = await client.permission.create({
        sessionID: session.id,
        action: "tbot.integration",
        resources: ["integration-resource"],
        save: ["integration-resource"],
    }, { signal: AbortSignal.timeout(15_000) });
    assert.equal(permission.effect, "ask");
    await waitFor(() => replyMessages.some((message) => message.text?.includes(BOT_COPY.permission.requestTitle)),
        15_000, failureContext);
    const approvalMessageIndex = replyMessages.findIndex((message) => message.text?.includes(BOT_COPY.permission.requestTitle));
    const approvalMessage = replyMessages[approvalMessageIndex]!;
    assert.ok(approvalMessage.text?.includes("tbot.integration"));
    assert.ok(approvalMessage.text?.includes("integration-resource"));
    const callbackData = approvalMessage.reply_markup?.inline_keyboard[0]?.[1]?.callback_data;
    assert.ok(callbackData?.startsWith("permission:always:"));
    updates.push({
        update_id: nextUpdateId++,
        callback_query: {
            id: "permission-integration-callback",
            from: { id: 101, is_bot: false, first_name: "Test", language_code: "en" },
            chat_instance: "integration-chat",
            data: callbackData,
            message: {
                message_id: approvalMessageIndex + 1,
                date: Math.floor(Date.now() / 1000),
                chat: { id: 101, type: "private" },
                text: approvalMessage.text,
            },
        },
    });
    await waitFor(() => editedReplies.some((reply) => reply.includes("Permission request resolved.")), 15_000, failureContext);
    assert.deepEqual(await client.permission.list({ sessionID: session.id }), []);
    assert.ok((await client.permission.saved.list()).some((saved) =>
        saved.action === "tbot.integration" && saved.resource === "integration-resource"));

    const messageId = `msg_${randomUUID()}`;
    const attachment = { uri: "data:text/plain;base64,aG9zdCBmaWxl", name: "integration.txt" };
    const admittedPrompt = await client.session.prompt({
        sessionID: session.id,
        id: messageId,
        text: "V2 prompt admission",
        files: [attachment],
        resume: false,
        delivery: "queue",
    });
    assert.equal(admittedPrompt.id, messageId);
    const queuedPrompt = (await client.session.inbox.list({ sessionID: session.id }))
        .find((entry) => entry.id === messageId);
    assert.ok(queuedPrompt?.type === "user");
    assert.equal(queuedPrompt.payload.text, "V2 prompt admission");
    assert.deepEqual(queuedPrompt.payload.files, [{
        data: "aG9zdCBmaWxl",
        mime: "text/plain",
        name: attachment.name,
        source: { type: "inline" },
    }]);
    const tracker = new ForegroundSessionTracker();
    const lease = tracker.acquire(101)!;
    lease.attachSession(session.id);
    lease.attachInput(messageId);
    const abort = new AbortPromptUseCase(new InMemorySessionRepository(), createOpenCodeClientFromSdkClient(client), tracker);
    assert.equal((await abort.execute({ chatId: 101, requestId: lease.id })).status, "aborted");
    assert.equal(lease.signal.aborted, true);
    lease.dispose();
    assert.ok((await client.session.inbox.list({ sessionID: session.id }))
        .every((entry) => entry.id !== messageId));

    await client.debug.location.evict({ location });
    const pollCount = requests.filter((method) => method === "getUpdates").length;
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(requests.filter((method) => method === "getUpdates").length, pollCount, "Plugin cleanup must stop Telegram polling.");
    assert.ok((await client.debug.location.list()).every((entry) => entry.directory !== worktree));
});

async function waitFor(
    check: () => boolean | Promise<boolean>,
    timeoutMs: number,
    getFailureContext?: () => string,
): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        if (await check()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(["Timed out waiting for the OpenCode host integration test.", getFailureContext?.()]
        .filter(Boolean).join("\n"));
}

async function terminateChildProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) {
        return;
    }
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    if (process.platform === "win32") {
        const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        await new Promise<void>((resolve) => {
            killer.once("exit", () => resolve());
            killer.once("error", () => resolve());
        });
    } else {
        child.kill("SIGTERM");
    }
    const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    try {
        await exited;
    } finally {
        clearTimeout(timer);
    }
}

function appendOutputChunk(chunks: string[], chunk: string): void {
    chunks.push(chunk);
    while (chunks.join("").length > 8_000) {
        chunks.shift();
    }
}

function buildFailureContext(
    requests: string[],
    replies: string[],
    stdoutChunks: string[],
    stderrChunks: string[],
): string {
    return [
        `requests=${JSON.stringify(requests.slice(-30))}`,
        `replies=${JSON.stringify(replies)}`,
        `stdout=${JSON.stringify(stdoutChunks.join("").trim())}`,
        `stderr=${JSON.stringify(stderrChunks.join("").trim())}`,
    ].join("\n");
}
