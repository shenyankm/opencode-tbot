import assert from "node:assert/strict";
import test from "node:test";
import { buildIncomingUpdateLogFields } from "../src/bot/middlewares/logging.js";

test("buildIncomingUpdateLogFields redacts sensitive values and keeps only a preview", () => {
    const fields = buildIncomingUpdateLogFields({
        update: { update_id: 1 },
        chat: { id: 2 },
        from: { id: 3 },
        msg: {
            text: "token=123456:abcdefghijklmnopqrstuvwxyz secret: sk_super_secret_value Bearer abc.def.ghi",
        },
    });

    assert.deepEqual(fields, {
        component: "telegram",
        correlationId: "1",
        event: "telegram.update.received",
        updateId: 1,
        chatId: 2,
        fromId: 3,
        hasText: true,
        textLength: 88,
        operationId: "telegram-1",
    });
});

test("buildIncomingUpdateLogFields omits text content fields when no text exists", () => {
    const fields = buildIncomingUpdateLogFields({
        update: { update_id: 9 },
        chat: { id: 10 },
        from: { id: 11 },
        msg: {},
    });

    assert.deepEqual(fields, {
        component: "telegram",
        correlationId: "9",
        event: "telegram.update.received",
        updateId: 9,
        chatId: 10,
        fromId: 11,
        hasText: false,
        textLength: 0,
        operationId: "telegram-9",
    });
});
