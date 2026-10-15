import assert from "node:assert/strict";
import test from "node:test";
import { OpenCode } from "@opencode/client";
import { BOT_COPY, getBotCopy } from "../src/bot/copy.js";
import { presentError } from "../src/bot/presenters/error.presenter.js";

test("presentError adds a tool-calling compatibility hint for thinking-mode API errors", () => {
    const text = presentError({
        type: "APIError",
        message: "tool_choice parameter does not support being set to required or object in thinking mode",
        status: 400,
    }, BOT_COPY);

    assert.match(text, /Provider request failed\./u);
    assert.match(
        text,
        /Current model\/reasoning mode is incompatible with tool calling\. Switch to a compatible model or disable thinking mode\./u,
    );
    assert.match(
        text,
        /tool_choice parameter does not support being set to required or object in thinking mode/u,
    );
    assert.match(text, /status: 400/u);
    assert.doesNotMatch(text, /retryable:/u);
});

test("presentError keeps generic API error details without adding the thinking-mode hint", () => {
    const text = presentError({
        type: "APIError",
        message: "provider exploded",
        status: 500,
    }, BOT_COPY);

    assert.match(text, /Provider request failed\./u);
    assert.match(text, /Cause: provider exploded \| status: 500/u);
    assert.doesNotMatch(text, /Current model\/reasoning mode is incompatible with tool calling/u);
});

test("native V2 provider errors keep localized messages and status without exposing response bodies", () => {
    for (const language of ["en", "zh-CN", "ja"] as const) {
        const copy = getBotCopy(language);
        const text = presentError({
            type: "provider.rate-limit",
            message: "Please try later",
            status: 429,
            response: { body: "PRIVATE PROVIDER RESPONSE" },
        }, copy);
        assert.ok(text.startsWith(copy.errors.providerRequest));
        assert.ok(text.includes(`${copy.errors.statusCodeLabel}: 429`));
        assert.ok(text.includes("Please try later"));
        assert.doesNotMatch(text, /PRIVATE PROVIDER RESPONSE|isRetryable|retryable/u);
    }
});

test("real V2 SDK tagged HTTP failures render validation and not-found details", async () => {
    for (const [tag, status, label] of [
        ["InvalidRequestError", 400, BOT_COPY.errors.badRequest],
        ["SessionNotFoundError", 404, BOT_COPY.errors.notFound],
    ] as const) {
        const client = OpenCode.make({
            baseUrl: "http://opencode.test",
            fetch: async () => Response.json({ _tag: tag, sessionID: "ses_missing", message: "Native V2 failure" }, { status }),
        });
        await assert.rejects(client.session.get({ sessionID: "ses_missing" }), (error) => {
            assert.equal(presentError(error), `${label}\n${BOT_COPY.errors.causeLabel}: Native V2 failure`);
            return true;
        });
    }
});
