import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import { GrammyError, HttpError } from "grammy";
import { retryTelegramNetworkRequest, telegramNetworkRecovery } from "../src/services/telegram/network-recovery.js";

function networkError(code: string): HttpError {
    return new HttpError("Network request failed", Object.assign(new Error("private bot URL"), { code }));
}

async function advance(t: TestContext, ms: number): Promise<void> {
    t.mock.timers.tick(ms);
    await setImmediate();
}

test("read-only requests retry transient failures with a bounded backoff and safe logs", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let calls = 0;
    const logs: unknown[] = [];
    const pending = retryTelegramNetworkRequest("getMe", async () => {
        if (++calls < 4) { throw networkError("ECONNRESET"); }
        return "ok";
    }, undefined, { warn(input) { logs.push(input); }, info(input) { logs.push(input); } });
    await setImmediate();
    for (const ms of [1000, 2000, 4000]) { await advance(t, ms); }
    assert.equal(await pending, "ok");
    assert.equal(calls, 4);
    assert.ok(!JSON.stringify(logs).includes("private bot URL"));
    assert.ok(JSON.stringify(logs).includes("ECONNRESET"));
});

test("message sends retry only failures proven to happen before the request can be delivered", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    for (const error of [networkError("ECONNREFUSED"), new HttpError("Network", Object.assign(new Error("unknown certificate verification error"), { code: "UNKNOWN_CERTIFICATE_VERIFICATION_ERROR" }))]) {
        let calls = 0;
        const pending = retryTelegramNetworkRequest("sendMessage", async () => {
            if (++calls === 1) { throw error; }
            return true;
        });
        await setImmediate();
        await advance(t, 1000);
        assert.equal(await pending, true);
        assert.equal(calls, 2);
    }
    for (const method of ["sendMessage", "sendDocument", "getUpdates"]) {
        let calls = 0;
        await assert.rejects(retryTelegramNetworkRequest(method, async () => { calls += 1; throw networkError("ECONNRESET"); }), HttpError);
        assert.equal(calls, 1);
    }
});

test("network retries stop at their limit and aborting a delay cancels further requests", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let calls = 0;
    const pending = retryTelegramNetworkRequest("getMe", async () => { calls += 1; throw networkError("ETIMEDOUT"); });
    const rejected = assert.rejects(pending, HttpError);
    await setImmediate();
    for (const ms of [1000, 2000, 4000]) { await advance(t, ms); }
    await rejected;
    assert.equal(calls, 4);
    const controller = new AbortController();
    const aborted = retryTelegramNetworkRequest("editMessageText", async () => { throw networkError("ECONNRESET"); }, controller.signal);
    const stopped = assert.rejects(aborted, { name: "AbortError" });
    await setImmediate();
    controller.abort();
    await stopped;
});

test("invalid tokens and API errors are never treated as transient network failures", async () => {
    let calls = 0;
    await assert.rejects(retryTelegramNetworkRequest("getMe", async () => {
        calls += 1;
        throw new GrammyError("Unauthorized", { ok: false, error_code: 401, description: "Unauthorized" }, "getMe", {});
    }), GrammyError);
    assert.equal(calls, 1);
});

test("an edit applied before a lost response is accepted when Telegram says the message is unchanged", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let calls = 0;
    const transformer = telegramNetworkRecovery({ warn() {}, info() {} });
    const pending = transformer((async () => {
        if (++calls === 1) { throw networkError("ECONNRESET"); }
        return { ok: false, error_code: 400, description: "Bad Request: message is not modified" };
    }) as never, "editMessageText", { chat_id: 1, message_id: 2, text: "hello" });
    await setImmediate();
    await advance(t, 1000);
    assert.deepEqual(await pending, { ok: true, result: true });
    assert.equal(calls, 2);
});
