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
import test, { mock } from "node:test";
import { createOpenCodeAppLogger } from "../src/infra/logger/index.js";

test("createOpenCodeAppLogger sends redacted structured entries to the host console", async () => {
    const log = mock.method(console, "info", () => undefined);
    try {
        const logger = createOpenCodeAppLogger({
            sinks: { file: false, host: true },
        });
        logger.info({ component: "runtime", event: "runtime.started", token: "sk-secret-token" }, "hello");
        await logger.flush();
        assert.equal(log.mock.callCount(), 1);
        const entry = JSON.parse(log.mock.calls[0]!.arguments[0] as string);
        assert.equal(entry.service, "opencode-tbot");
        assert.equal(entry.level, "info");
        assert.equal(entry.message, "hello");
        assert.equal(entry.token, "[REDACTED]");
        assert.match(entry.runtimeId, /^[0-9a-f-]{36}$/u);
        assert.match(entry.ts, /^\d{4}-\d{2}-\d{2}T/u);
    } finally {
        log.mock.restore();
    }
});

test("createOpenCodeAppLogger writes metadata-only JSONL file logs", async () => {
    const logDir = mkdtempSync(join(tmpdir(), "opencode-tbot-logs-"));
    const logger = createOpenCodeAppLogger({
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
    const log = mock.method(console, "warn", () => undefined);
    try {
        writeFileSync(blockedFile, "blocked", "utf8");
        const logger = createOpenCodeAppLogger({
            file: { dir: join(blockedFile, "nested") },
            sinks: { file: true, host: true },
        });
        logger.warn({ component: "runtime", event: "runtime.file_sink_failed" }, "host still works");
        await logger.flush();
        assert.equal(log.mock.callCount(), 1);
        assert.equal(JSON.parse(log.mock.calls[0]!.arguments[0] as string).message, "host still works");
    } finally {
        log.mock.restore();
        rmSync(blockedRoot, { force: true, recursive: true });
    }
});
