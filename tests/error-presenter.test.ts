import assert from "node:assert/strict";
import test from "node:test";
import { BOT_COPY } from "../src/bot/copy.js";
import { presentError } from "../src/bot/presenters/error.presenter.js";

test("presentError adds a tool-calling compatibility hint for thinking-mode API errors", () => {
    const text = presentError({
        name: "APIError",
        data: {
            message: "tool_choice parameter does not support being set to required or object in thinking mode",
            statusCode: 400,
            isRetryable: false,
        },
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
    assert.match(text, /retryable: no/u);
});

test("presentError keeps generic API error details without adding the thinking-mode hint", () => {
    const text = presentError({
        name: "APIError",
        data: {
            message: "provider exploded",
            statusCode: 500,
        },
    }, BOT_COPY);

    assert.match(text, /Provider request failed\./u);
    assert.match(text, /Cause: provider exploded \| status: 500/u);
    assert.doesNotMatch(text, /Current model\/reasoning mode is incompatible with tool calling/u);
});
