import assert from "node:assert/strict";
import test from "node:test";
import { calculateDisplayedTokenTotal } from "../src/domain/token/token-settings.entity.js";

test("calculateDisplayedTokenTotal sums the displayed token metrics", () => {
    const total = calculateDisplayedTokenTotal({
        input: 10,
        output: 12,
        reasoning: 5,
        cacheRead: 15,
        cacheWrite: 3,
    });

    assert.equal(total, 45);
});

test("calculateDisplayedTokenTotal returns null when every displayed metric is unavailable", () => {
    const total = calculateDisplayedTokenTotal({
        input: null,
        output: null,
        reasoning: null,
        cacheRead: null,
        cacheWrite: null,
    });

    assert.equal(total, null);
});
