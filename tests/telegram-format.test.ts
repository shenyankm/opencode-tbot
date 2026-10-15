import assert from "node:assert/strict";
import test from "node:test";
import type { PromptSessionResult } from "../src/services/opencode/opencode.client.js";
import { getBotCopy } from "../src/bot/copy.js";
import {
    buildTelegramStaticReply,
    buildTelegramPromptReply,
    buildTelegramPromptReplies,
    prepareTelegramRichMarkdown,
    splitTelegramText,
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

test("native Markdown keeps headings, lists, quotes, links and tables without legacy escapes", () => {
    const markdown = "## Title\n- Item\n1. Step\n> Quote\nUse `cmd`, **bold**, and _italic_.\n[OpenCode](https://opencode.ai)\n\n| Language | Runtime |\n| --- | --- |\n| Java | JVM |";
    assert.equal(prepareTelegramRichMarkdown(markdown), markdown);
});

test("Markdown wrapper fences are removed while actual code fences remain intact", () => {
    assert.equal(prepareTelegramRichMarkdown("```md\n## Title\n- Item\n```"), "## Title\n- Item");
    assert.equal(prepareTelegramRichMarkdown("```ts\nconst x = 1;\n```"), "```ts\nconst x = 1;\n```");
    assert.equal(prepareTelegramRichMarkdown("![remote](https://example.com/a.png)"), null);
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
            text: "<b>bad</b>",
        },
        fallback: {
            text: "<b>bad</b>",
        },
    });
});

test("buildTelegramPromptReply keeps context information out of markdown replies", () => {
    const result = buildTelegramPromptReply(createPromptReply({
        bodyMd: "## Hello",
        fallbackText: "Hello",
    }));

    assert.deepEqual(result.preferred, {
        text: "## Hello",
        options: {
            parse_mode: "Markdown",
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
    assert.ok(replies.every((reply) => reply.preferred.options?.parse_mode === "Markdown" && reply.preferred.text.length <= 1152));
    assert.match(replies.map((reply) => reply.preferred.text).join(""), /value17/);
});

test("long tables repeat their header and preserve every complete row alongside surrounding prose", () => {
    const header = "| 编号 | 说明 |\n| :--- | ---: |\n";
    const rows = Array.from({ length: 100 }, (_, i) => `| ${i} | 完整内容 ${"文字".repeat(18)} |\n`);
    const body = `Before\n\n${header}${rows.join("")}\nAfter`;
    const replies = buildTelegramPromptReplies({ bodyMd: body, fallbackText: body });
    const tables = replies.map((reply) => reply.preferred.text).filter((text) => text.startsWith(header));
    assert.ok(tables.length > 2);
    assert.equal(tables.map((table) => table.slice(header.length)).join(""), rows.join(""));
    assert.ok(tables.every((table) => table.length <= 1152 && table.endsWith("|\n")));
    assert.ok(replies[0].preferred.text.includes("Before"));
    assert.ok(replies.at(-1)!.preferred.text.includes("After"));
});

test("streaming tables buffer incomplete rows and final output includes the unterminated last row", () => {
    const header = "Name | Value\n--- | ---\n";
    const body = header + "first | `a\\|b`\nlast | **incomplete";
    const snapshot = buildTelegramPromptReplies({ bodyMd: body, fallbackText: body }, getBotCopy("en"), true);
    assert.equal(snapshot.map((x) => x.preferred.text).join(""), header + "first | `a\\|b`\n");
    const completeRow = header + "first | value\n";
    assert.equal(buildTelegramPromptReplies({ bodyMd: completeRow, fallbackText: completeRow }, getBotCopy("en"), true)[0].preferred.text, completeRow);
    const final = buildTelegramPromptReplies({ bodyMd: body, fallbackText: body });
    assert.equal(final.map((x) => x.preferred.text).join(""), body);
    const fenced = "```text\n" + header + "last | value\n```";
    assert.equal(buildTelegramPromptReply({ bodyMd: fenced, fallbackText: fenced }).preferred.text, fenced);
});

test("an oversized table row stays intact above the soft target and uses literal chunks above the safe size", () => {
    for (const size of [1500, 5000]) {
        const table = "| Name | Value |\n| --- | --- |\n| row | " + "字".repeat(size) + " |";
        const replies = buildTelegramPromptReplies({ bodyMd: table, fallbackText: table });
        assert.equal(replies.map((x) => x.preferred.text).join(""), table);
        if (size === 1500) assert.equal(replies.length, 1);
        else assert.ok(replies.every((x) => !x.preferred.options && x.preferred.text.length <= 1152));
    }
});

test("single-column tables repeat their header and escaped pipes do not create extra columns", () => {
    for (const header of ["| Name |\n| --- |\n", "| Name\\|Alias | Value |\n| --- | --- |\n"]) {
        const row = header.includes("Value") ? `| a\\|b | ${"text ".repeat(20)} |\n` : `| ${"text ".repeat(20)} |\n`;
        const body = header + row.repeat(30);
        const chunks = buildTelegramPromptReplies({ bodyMd: body, fallbackText: body });
        assert.ok(chunks.length > 1);
        assert.ok(chunks.every((chunk) => chunk.preferred.text.startsWith(header)));
        assert.equal(chunks.map((chunk) => chunk.preferred.text.slice(header.length)).join("").trimEnd(), row.repeat(30).trimEnd());
    }
});

test("punctuation stays readable without MarkdownV2 escape expansion", () => {
    const body = "!".repeat(1000);
    const replies = buildTelegramPromptReplies(createPromptReply({ bodyMd: body, fallbackText: body }));
    assert.equal(replies.length, 1);
    assert.deepEqual(replies[0].preferred, { text: body, options: { parse_mode: "Markdown" } });
});

test("buildTelegramPromptReply keeps Markdown enabled for table content", () => {
    const result = buildTelegramPromptReply(createPromptReply({
        bodyMd: [
            "| Language | Runtime |",
            "| --- | --- |",
            "| Java | JVM |",
            "| Python | CPython |",
        ].join("\n"),
        fallbackText: "table fallback",
    }));

    assert.equal(result.preferred.options?.parse_mode, "Markdown");
    assert.match(result.preferred.text, /^\| Language \| Runtime \|/m);
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
        text: `## Hello`,
        options: {
            parse_mode: "Markdown",
        },
    });
    assert.deepEqual(result.fallback, {
        text: `Hello`,
    });
});

test("buildTelegramStaticReply prefers Markdown when the markdown is supported", () => {
    const result = buildTelegramStaticReply([
        "# Welcome",
        "",
        "- Text",
        "- Image",
    ].join("\n"));

    assert.deepEqual(result.preferred, {
        text: [
            "# Welcome",
            "",
            "- Text",
            "- Image",
        ].join("\n"),
        options: {
            parse_mode: "Markdown",
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


test("long fenced code stays formatted across rich chunks and preserves the source in fallbacks", () => {
    const code = "```ts\n" + "console.log(123);\n".repeat(180) + "```";
    const replies = buildTelegramPromptReplies(createPromptReply({ bodyMd: code }));
    assert.ok(replies.length > 2);
    assert.ok(replies.every((reply) => reply.preferred.text.startsWith("```ts\n") && reply.preferred.text.endsWith("```")));
    assert.equal(replies.map((reply) => reply.preferred.text.replace(/^```ts\n/u, "").replace(/\n?```$/u, "")).join(""), code.slice(6, -3).replace(/\n$/u, ""));
});
