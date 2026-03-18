import assert from "node:assert/strict";
import test from "node:test";
import type { PromptSessionResult } from "../src/services/opencode/opencode.client.js";
import {
    buildTelegramPromptReply,
    renderMarkdownToTelegramMarkdownV2,
    stripMarkdownToPlainText,
} from "../src/services/telegram/telegram-format.js";

function createPromptReply(overrides: Partial<PromptSessionResult> = {}): PromptSessionResult {
    return {
        bodyMd: "Hello",
        fallbackText: "Hello",
        info: null,
        metrics: {
            durationMs: 120,
            totalTokens: 42,
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

test("buildTelegramPromptReply falls back to plain text when markdown is unsupported", () => {
    const result = buildTelegramPromptReply(createPromptReply({
        bodyMd: "<b>bad</b>",
        fallbackText: "plain fallback",
        metrics: {
            durationMs: null,
            totalTokens: null,
        },
        structured: {
            body_md: "<b>bad</b>",
        },
    }));

    assert.deepEqual(result, {
        preferred: {
            text: "plain fallback\n\nDuration: n/a | Tokens: n/a",
        },
        fallback: {
            text: "plain fallback\n\nDuration: n/a | Tokens: n/a",
        },
    });
});
