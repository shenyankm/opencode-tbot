import assert from "node:assert/strict";
import test from "node:test";
import type { PromptSessionResult } from "../src/services/opencode/opencode.client.js";
import { getBotCopy } from "../src/bot/copy.js";
import {
    buildTelegramStaticReply,
    buildTelegramPromptReply,
    renderMarkdownToTelegramMarkdownV2,
    stripMarkdownToPlainText,
} from "../src/services/telegram/telegram-format.js";

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
            text: "bad\n\nDuration: n/a | Tokens: n/a",
        },
        fallback: {
            text: "bad\n\nDuration: n/a | Tokens: n/a",
        },
    });
});

test("buildTelegramPromptReply appends a compact metrics footer to markdown replies", () => {
    const result = buildTelegramPromptReply(createPromptReply({
        bodyMd: "## Hello",
        fallbackText: "Hello",
    }));

    assert.deepEqual(result.preferred, {
        text: "*Hello*\n\nDuration: 120 ms \\| Tokens: 42",
        options: {
            parse_mode: "MarkdownV2",
        },
    });
    assert.deepEqual(result.fallback, {
        text: "Hello\n\nDuration: 120 ms | Tokens: 42",
    });
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

test("buildTelegramPromptReply localizes the metrics footer", () => {
    const result = buildTelegramPromptReply(
        createPromptReply({
            bodyMd: "## Hello",
            fallbackText: "Hello",
        }),
        getBotCopy("zh-CN"),
    );

    assert.deepEqual(result.preferred, {
        text: "*Hello*\n\n耗时: 120 ms \\| 令牌数: 42",
        options: {
            parse_mode: "MarkdownV2",
        },
    });
    assert.deepEqual(result.fallback, {
        text: "Hello\n\n耗时: 120 ms | 令牌数: 42",
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
