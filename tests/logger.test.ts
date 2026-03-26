import assert from "node:assert/strict";
import {
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    utimesSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createOpenCodeAppLogger } from "../src/infra/logger/index.js";

test("createOpenCodeAppLogger sends structured log entries through root client.app.log", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const logger = createOpenCodeAppLogger({
        app: {
            async log(input: Record<string, unknown>) {
                calls.push(input);
                return true;
            },
        },
    }, {
        sinks: {
            file: false,
            host: true,
        },
    });

    logger.info(
        {
            component: "runtime",
            event: "runtime.started",
            token: "sk-secret-token",
        },
        "hello",
    );
    await logger.flush();

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
        body: {
            service: "opencode-tbot",
            level: "info",
            message: "hello",
            extra: {
                ts: ((calls[0]?.body as { extra?: Record<string, unknown> } | undefined)?.extra)?.ts,
                component: "runtime",
                event: "runtime.started",
                runtimeId: ((calls[0]?.body as { extra?: Record<string, unknown> } | undefined)?.extra)?.runtimeId,
                operationId: null,
                correlationId: null,
                token: "[REDACTED]",
            },
        },
        responseStyle: "data",
        throwOnError: true,
    });
    assert.match(
        String((((calls[0].body as { extra?: { runtimeId?: unknown } } | undefined)?.extra)?.runtimeId) ?? ""),
        /^[0-9a-f-]{36}$/u,
    );
    assert.match(
        String((((calls[0].body as { extra?: { ts?: unknown } } | undefined)?.extra)?.ts) ?? ""),
        /^\d{4}-\d{2}-\d{2}T/u,
    );
});

test("createOpenCodeAppLogger writes metadata-only JSONL file logs", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "opencode-tbot-logs-"));
    const logger = createOpenCodeAppLogger({
        app: {
            async log() {
                return true;
            },
        },
    }, {
        file: {
            dir: logDir,
        },
        sinks: {
            file: true,
            host: false,
        },
    });

    logger.info(
        {
            callbackData: "permission:once:req-1",
            chatId: 42,
            component: "prompt",
            event: "prompt.submit",
            files: [
                {
                    filename: "a.png",
                    mime: "image/png",
                    url: "https://example.com/a.png",
                },
                {
                    filename: "b.png",
                    mime: "image/png",
                    url: "https://example.com/b.png",
                },
            ],
            prompt: "hello world",
            text: "caption",
            updateId: 7,
            url: "https://example.com/raw",
        },
        "submitting",
    );
    await logger.flush();

    const files = readdirSync(logDir).filter((name) => name.endsWith(".jsonl"));

    assert.equal(files.length, 1);
    const record = JSON.parse(readFileSync(join(logDir, files[0]!), "utf8").trim()) as Record<string, unknown>;

    assert.equal(record.component, "prompt");
    assert.equal(record.event, "prompt.submit");
    assert.equal(record.chatId, 42);
    assert.equal(record.updateId, 7);
    assert.deepEqual(record.prompt, {
        omitted: "[OMITTED]",
        length: 11,
    });
    assert.deepEqual(record.text, {
        omitted: "[OMITTED]",
        length: 7,
    });
    assert.deepEqual(record.url, {
        omitted: "[OMITTED]",
        kind: "url",
    });
    assert.deepEqual(record.files, {
        count: 2,
        items: [
            {
                filename: "a.png",
                hasCaption: false,
                mime: "image/png",
            },
            {
                filename: "b.png",
                hasCaption: false,
                mime: "image/png",
            },
        ],
    });
});

test("createOpenCodeAppLogger keeps only the newest retained file logs", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "opencode-tbot-retain-"));
    const oldFileOne = join(logDir, "2026-01-01T00-00-00.1.old-1.jsonl");
    const oldFileTwo = join(logDir, "2026-01-01T00-00-01.1.old-2.jsonl");

    writeFileSync(oldFileOne, "{\"message\":\"old-1\"}\n", "utf8");
    writeFileSync(oldFileTwo, "{\"message\":\"old-2\"}\n", "utf8");
    utimesSync(oldFileOne, new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"));
    utimesSync(oldFileTwo, new Date("2026-01-01T00:00:01.000Z"), new Date("2026-01-01T00:00:01.000Z"));

    const logger = createOpenCodeAppLogger({
        app: {
            async log() {
                return true;
            },
        },
    }, {
        file: {
            dir: logDir,
            retention: {
                maxFiles: 1,
                maxTotalBytes: 1024,
            },
        },
        sinks: {
            file: true,
            host: false,
        },
    });

    logger.info(
        {
            component: "runtime",
            event: "runtime.started",
        },
        "new log",
    );
    await logger.flush();

    const files = readdirSync(logDir).filter((name) => name.endsWith(".jsonl"));

    assert.equal(files.length, 1);
    assert.match(readFileSync(join(logDir, files[0]!), "utf8"), /new log/u);
});

test("createOpenCodeAppLogger keeps host logging alive when the file sink cannot write", async () => {
    const blockedRoot = mkdtempSync(join(tmpdir(), "opencode-tbot-blocked-"));
    const blockedFile = join(blockedRoot, "blocked");
    const calls: Array<Record<string, unknown>> = [];

    writeFileSync(blockedFile, "blocked", "utf8");

    const logger = createOpenCodeAppLogger({
        app: {
            async log(input) {
                calls.push(input);
                return true;
            },
        },
    }, {
        file: {
            dir: join(blockedFile, "nested"),
        },
        sinks: {
            file: true,
            host: true,
        },
    });

    logger.warn(
        {
            component: "runtime",
            event: "runtime.file_sink_failed",
        },
        "host still works",
    );
    await logger.flush();

    assert.equal(calls.length, 1);
    assert.equal((calls[0]?.body as { message?: string } | undefined)?.message, "host still works");

    rmSync(blockedRoot, { force: true, recursive: true });
});
