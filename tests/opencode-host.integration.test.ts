import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import test from "node:test";
import { installPlugin } from "../src/cli.js";

const SHOULD_RUN = process.env.OPENCODE_HOST_E2E === "1";

test("OpenCode host loads the plugin and starts Telegram polling", { skip: !SHOULD_RUN }, async () => {
    const homeDir = mkdtempSync(join(tmpdir(), "opencode-tbot-host-home-"));
    const worktree = mkdtempSync(join(tmpdir(), "opencode-tbot-host-worktree-"));
    const requests: string[] = [];
    const server = createServer((request, response) => {
        requests.push(request.url ?? "");

        if (request.url?.includes("/getMe")) {
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify({
                ok: true,
                result: {
                    id: 123456,
                    is_bot: true,
                    first_name: "OpenCode TBot",
                    username: "opencode_tbot_test",
                },
            }));
            return;
        }

        if (request.url?.includes("/setMyCommands") || request.url?.includes("/getUpdates")) {
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify({
                ok: true,
                result: [],
            }));
            return;
        }

        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, result: true }));
    });

    await new Promise<void>((resolvePromise) => {
        server.listen(0, "127.0.0.1", () => resolvePromise());
    });

    const address = server.address();

    if (!address || typeof address === "string") {
        throw new Error("Failed to start the Telegram mock server.");
    }

    const telegramApiRoot = `http://127.0.0.1:${address.port}`;

    await installPlugin({
        homeDir,
        botToken: "123456:test-token",
        telegramApiRoot,
    });
    writeFileSync(join(worktree, "README.md"), "# opencode-tbot integration\n", "utf8");

    const command = process.platform === "win32"
        ? "opencode.cmd"
        : "opencode";
    const child = spawn(command, ["serve"], {
        cwd: worktree,
        env: {
            ...process.env,
            HOME: homeDir,
            USERPROFILE: homeDir,
        },
        stdio: "pipe",
    });
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
        appendOutputChunk(stdoutChunks, chunk);
    });
    child.stderr.on("data", (chunk: string) => {
        appendOutputChunk(stderrChunks, chunk);
    });

    try {
        await waitFor(() =>
            requests.some((url) => url.includes("/setMyCommands"))
            && requests.some((url) => url.includes("/getUpdates")),
        30_000,
        () => buildFailureContext(requests, stdoutChunks, stderrChunks),
        );
    } finally {
        await terminateChildProcess(child);
        await new Promise((resolvePromise) => {
            child.once("exit", () => resolvePromise(undefined));
            setTimeout(() => resolvePromise(undefined), 5_000);
        });
        await new Promise<void>((resolvePromise, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolvePromise();
            });
        });
    }

    assert.ok(requests.some((url) => url.includes("/setMyCommands")));
    assert.ok(requests.some((url) => url.includes("/getUpdates")));
});

async function waitFor(
    check: () => boolean,
    timeoutMs: number,
    getFailureContext?: () => string,
): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        if (check()) {
            return;
        }

        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }

    throw new Error(
        [
            "Timed out waiting for the OpenCode host integration test.",
            getFailureContext?.(),
        ]
            .filter(Boolean)
            .join("\n"),
    );
}

async function terminateChildProcess(
    child: ChildProcessWithoutNullStreams,
): Promise<void> {
    if (child.killed || child.exitCode !== null) {
        return;
    }

    if (process.platform === "win32" && child.pid) {
        await new Promise<void>((resolvePromise) => {
            const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
                stdio: "ignore",
                windowsHide: true,
            });

            killer.once("exit", () => resolvePromise());
            killer.once("error", () => resolvePromise());
        });

        return;
    }

    child.kill("SIGTERM");
}

function appendOutputChunk(chunks: string[], chunk: string): void {
    chunks.push(chunk);

    while (chunks.join("").length > 8_000) {
        chunks.shift();
    }
}

function buildFailureContext(
    requests: string[],
    stdoutChunks: string[],
    stderrChunks: string[],
): string {
    return [
        `requests=${JSON.stringify(requests)}`,
        stdoutChunks.length > 0
            ? `stdout=${JSON.stringify(stdoutChunks.join("").trim())}`
            : null,
        stderrChunks.length > 0
            ? `stderr=${JSON.stringify(stderrChunks.join("").trim())}`
            : null,
    ]
        .filter(Boolean)
        .join("\n");
}
