import assert from "node:assert/strict";
import test from "node:test";
import { createRedactedPreview, redactSensitiveText } from "../src/infra/utils/redact.js";

test("redactSensitiveText masks common secret formats", () => {
    const input = "apiKey=abc123 password: hunter2 123456:abcdefghijklmnopqrstuvwxyz Bearer qwerty sk_1234567890";

    assert.equal(
        redactSensitiveText(input),
        "apiKey=[REDACTED] password: [REDACTED] [REDACTED] Bearer [REDACTED] [REDACTED]",
    );
});

test("createRedactedPreview truncates long text after redaction", () => {
    const preview = createRedactedPreview("token=abc123 " + "x".repeat(200), 32);

    assert.equal(preview, "token=[REDACTED] xxxxxxxxxxxx...");
});
