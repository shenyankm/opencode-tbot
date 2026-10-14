import assert from "node:assert/strict";
import test from "node:test";
import type { PromptSessionResult } from "../src/services/opencode/opencode.client.js";
import { getBotCopy } from "../src/bot/copy.js";
import {
    buildTelegramStaticReply,
    buildTelegramPromptReply,
    buildTelegramPromptReplies,
    renderMarkdownToTelegramMarkdownV2,
    splitTelegramText,
    stripMarkdownToPlainText,
} from "../src/services/telegram/telegram-format.js";

test("readable chunks allow a sentence to finish on either side of the target and keep closing quotes", () => {
    for (const size of [950, 1060]) {
        const sentence = "甲".repeat(size) + "。”";
        const text = sentence + "乙".repeat(600) + "。";
        const chunks = splitTelegramText(text);
        assert.equal(chunks[0], sentence);
        assert.equal(chunks.join(""), text);
        assert.ok(chunks.every((chunk) => chunk.length <= 1152));
    }
    const english = "A".repeat(980) + " costs 1.25 units. " + "The next sentence is complete. ".repeat(20);
    const chunks = splitTelegramText(english);
    assert.ok(chunks[0].includes("1.25 units."));
    assert.ok(chunks.slice(0, -1).every((chunk) => chunk.endsWith(". ")));
    assert.equal(chunks.join(""), english);
});

test("readable chunks prefer a paragraph boundary and preserve blank lines and CRLF", () => {
    const first = "甲".repeat(995) + "。\r\n\r\n";
    const text = first + "乙".repeat(600) + "。";
    const chunks = splitTelegramText(text);
    assert.equal(chunks[0], first);
    assert.equal(chunks.join(""), text);
});

test("numbered list markers stay with their sentence instead of forming a closer split point", () => {
    const first = `1. ${"a".repeat(1016)}.\n`;
    const text = first + `2. ${"b".repeat(400)}.\n3. ${"c".repeat(500)}.\n`;
    const chunks = splitTelegramText(text);
    assert.equal(chunks[0], first);
    assert.ok(chunks[1].startsWith("2. "));
    assert.equal(chunks.join(""), text);
});

test("overlong sentences split at words while unbroken text stays bounded without losing Unicode", () => {
    const prose = "word ".repeat(600);
    const chunks = splitTelegramText(prose);
    assert.ok(chunks.slice(0, -1).every((chunk) => chunk.endsWith(" ")));
    for (const text of [prose, "😀".repeat(2500), "文".repeat(5000)]) {
        const parts = splitTelegramText(text);
        assert.equal(parts.join(""), text);
        assert.ok(parts.every((part) => part.length > 0 && part.length <= 1152));
        assert.ok(parts.every((part) => !/[\uD800-\uDBFF]$/u.test(part) && !/^[\uDC00-\uDFFF]/u.test(part)));
    }
});

test("readable chunks balance an otherwise tiny remainder and leave short replies intact", () => {
    const text = "文".repeat(1200);
    assert.deepEqual(splitTelegramText(text), [text.slice(0, 600), text.slice(600)]);
    const short = "句子完整。".repeat(180);
    assert.deepEqual(splitTelegramText(short), [short]);
    assert.deepEqual(splitTelegramText(""), []);
    for (const invalid of [0, 1, -1, NaN, Infinity, 4097, 2.5]) {
        assert.throws(() => splitTelegramText("text", invalid), /target must be an integer/);
    }
});

function createPromptReply(overrides: Partial<PromptSessionResult> = {}): PromptSessionResult {
    return {
        assistantError: null,
        bodyMd: "Hello",
        fallbackText: "Hello",
        info: null,
        metrics: {
            durationMs: 120,
            tokens: {
                total: 42,
                input: 10,
                output: 12,
                reasoning: 5,
                cacheRead: 15,
                cacheWrite: 0,
            },
        },
        parts: [],
        structured: {
            body_md: "Hello",
        },
        ...overrides,
    };
}

test("renderMarkdownToTelegramMarkdownV2 supports the constrained markdown subset", () => {
    const markdown = [
        "## Title",
        "- Item",
        "1. Step",
        "> Quote",
        "Use `cmd`, **bold**, and _italic_.",
        "[OpenCode](https://opencode.ai)",
    ].join("\n");

    assert.equal(
        renderMarkdownToTelegramMarkdownV2(markdown),
        [
            "*Title*",
            "\\- Item",
            "1\\. Step",
            "> Quote",
            "Use `cmd`, *bold*, and _italic_\\.",
            "[OpenCode](https://opencode.ai)",
        ].join("\n"),
    );
    assert.equal(
        stripMarkdownToPlainText(markdown),
        [
            "Title",
            "- Item",
            "1. Step",
            "Quote",
            "Use cmd, bold, and italic.",
            "OpenCode (https://opencode.ai)",
        ].join("\n"),
    );
});

test("renderMarkdownToTelegramMarkdownV2 unwraps markdown code fences and renders the inner markdown", () => {
    const markdown = [
        "# Markdown Test",
        "",
        "```md",
        "## Title",
        "- Item 1",
        "This is **Markdown** text.",
        "```",
    ].join("\n");

    assert.equal(
        renderMarkdownToTelegramMarkdownV2(markdown),
        [
            "*Markdown Test*",
            "",
            "*Title*",
            "\\- Item 1",
            "This is *Markdown* text\\.",
        ].join("\n"),
    );
    assert.equal(
        stripMarkdownToPlainText(markdown),
        [
            "Markdown Test",
            "",
            "Title",
            "- Item 1",
            "This is Markdown text.",
        ].join("\n"),
    );
});

test("renderMarkdownToTelegramMarkdownV2 renders markdown tables as preformatted tables", () => {
    const markdown = [
        "| Language | Runtime |",
        "| --- | --- |",
        "| Java | JVM |",
        "| Python | CPython |",
    ].join("\n");

    assert.equal(
        renderMarkdownToTelegramMarkdownV2(markdown),
        [
            "```",
            "Language | Runtime",
            "---------+--------",
            "Java     | JVM    ",
            "Python   | CPython",
            "```",
        ].join("\n"),
    );
    assert.equal(
        stripMarkdownToPlainText(markdown),
        [
            "Language | Runtime",
            "---------+--------",
            "Java     | JVM    ",
            "Python   | CPython",
        ].join("\n"),
    );
});

test("buildTelegramPromptReply falls back to plain text when markdown is unsupported", () => {
    const result = buildTelegramPromptReply(createPromptReply({
        bodyMd: "<b>bad</b>",
        fallbackText: "<b>bad</b>",
        metrics: {
            durationMs: null,
            tokens: {
                total: null,
                input: null,
                output: null,
                reasoning: null,
                cacheRead: null,
                cacheWrite: null,
            },
        },
        structured: {
            body_md: "<b>bad</b>",
        },
    }));

    assert.deepEqual(result, {
        preferred: {
            text: "bad",
        },
        fallback: {
            text: "bad",
        },
    });
});

test("buildTelegramPromptReply keeps context information out of markdown replies", () => {
    const result = buildTelegramPromptReply(createPromptReply({
        bodyMd: "## Hello",
        fallbackText: "Hello",
    }));

    assert.deepEqual(result.preferred, {
        text: "*Hello*",
        options: {
            parse_mode: "MarkdownV2",
        },
    });
    assert.deepEqual(result.fallback, {
        text: "Hello",
    });
});

test("long replies use readable chunks without reserving space for context information", () => {
    const body = "x".repeat(4096);
    const replies = buildTelegramPromptReplies(createPromptReply({ bodyMd: null, fallbackText: body }));
    assert.ok(replies.length > 1);
    assert.equal(replies.map((reply) => reply.preferred.text).join(""), body);
    assert.ok(replies.every((reply) => reply.preferred.text.length <= 1152));
});

test("table padding cannot expand a short reply into an oversized message", () => {
    const table = [
        "| Column | Value |",
        "| --- | --- |",
        ...Array.from({ length: 18 }, (_, index) => `| ${index === 0 ? "a".repeat(80) : "short"} | value${index} |`),
    ].join("\n");
    const replies = buildTelegramPromptReplies(createPromptReply({ bodyMd: table, fallbackText: table }));
    assert.ok(replies.every((reply) => reply.preferred.options === undefined && reply.preferred.text.length <= 1152));
    assert.match(replies.map((reply) => reply.preferred.text).join(""), /value17/);
});

test("formatting expansion falls back to a readable plain message", () => {
    const body = "!".repeat(1000);
    const replies = buildTelegramPromptReplies(createPromptReply({ bodyMd: body, fallbackText: body }));
    assert.equal(replies.length, 1);
    assert.deepEqual(replies[0].preferred, { text: body });
});

test("buildTelegramPromptReply keeps MarkdownV2 enabled for table content", () => {
    const result = buildTelegramPromptReply(createPromptReply({
        bodyMd: [
            "| Language | Runtime |",
            "| --- | --- |",
            "| Java | JVM |",
            "| Python | CPython |",
        ].join("\n"),
        fallbackText: "table fallback",
    }));

    assert.equal(result.preferred.options?.parse_mode, "MarkdownV2");
    assert.match(result.preferred.text, /^```\nLanguage \| Runtime\n/m);
    assert.doesNotMatch(result.preferred.text, /^table fallback$/m);
});

test("buildTelegramPromptReply keeps context information out of localized replies", () => {
    const copy = getBotCopy("zh-CN");
    const result = buildTelegramPromptReply(
        createPromptReply({
            bodyMd: "## Hello",
            fallbackText: "Hello",
        }),
        copy,
    );

    assert.deepEqual(result.preferred, {
        text: `*Hello*`,
        options: {
            parse_mode: "MarkdownV2",
        },
    });
    assert.deepEqual(result.fallback, {
        text: `Hello`,
    });
});

test("buildTelegramStaticReply prefers MarkdownV2 when the markdown is supported", () => {
    const result = buildTelegramStaticReply([
        "# Welcome",
        "",
        "- Text",
        "- Image",
    ].join("\n"));

    assert.deepEqual(result.preferred, {
        text: [
            "*Welcome*",
            "",
            "\\- Text",
            "\\- Image",
        ].join("\n"),
        options: {
            parse_mode: "MarkdownV2",
        },
    });
    assert.deepEqual(result.fallback, {
        text: [
            "Welcome",
            "",
            "- Text",
            "- Image",
        ].join("\n"),
    });
});

test("buildTelegramStaticReply falls back to plain text when markdown is unsupported", () => {
    const result = buildTelegramStaticReply("<b>bad</b>");

    assert.deepEqual(result, {
        preferred: {
            text: "bad",
        },
        fallback: {
            text: "bad",
        },
    });
});
