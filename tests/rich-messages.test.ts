import assert from "node:assert/strict";
import test from "node:test";
import { Api, Bot, GrammyError, HttpError } from "grammy";
import { isTelegramFormattingError, telegramRichMessages } from "../src/services/telegram/rich-messages.js";

test("literal fallback requires an explicit Telegram formatting rejection", () => {
    for (const description of ["Cannot parse entities", "unsupported HTML tag", "bad format", "invalid markdown"]) {
        assert.equal(isTelegramFormattingError(new GrammyError(description, { ok: false, error_code: 400, description }, "sendRichMessage", {})), true);
    }
    for (const description of ["chat not found", "message to edit not found", "message is not modified", "message is too long"]) {
        assert.equal(isTelegramFormattingError(new GrammyError(description, { ok: false, error_code: 400, description }, "editMessageText", {})), false);
    }
    assert.equal(isTelegramFormattingError(new HttpError("connection lost", new Error("ECONNRESET"))), false);
    assert.equal(isTelegramFormattingError(new GrammyError("Cannot parse entities", { ok: false, error_code: 500, description: "Cannot parse entities" }, "sendRichMessage", {})), false);
});

function createApi() {
    const calls: Array<{ method: string; payload: unknown; signal?: Parameters<Api["sendMessage"]>[3] }> = [];
    const api = new Api("test-token");
    api.config.use(async (_previous, method, payload, signal) => {
        calls.push({ method, payload, signal });
        return { ok: true, result: { message_id: 123, chat: { id: 1 }, rich_message: {} } } as never;
    });
    api.config.use(telegramRichMessages());
    return { api, calls };
}

test("all text sends become Rich Messages while literal text and delivery options remain intact", async () => {
    const { api, calls } = createApi();
    const text = "<b>literal</b> **not markup** & 😀";
    const options = { message_thread_id: 7, disable_notification: true, reply_parameters: { message_id: 10 }, reply_markup: { inline_keyboard: [[{ text: "Stop", callback_data: "prompt:stop:123" }]] } };
    const message = await api.sendMessage(1, text, options);
    assert.equal(message.message_id, 123);
    assert.deepEqual(calls, [{ method: "sendRichMessage", payload: { chat_id: 1, ...options, rich_message: { blocks: [{ type: "paragraph", text }] } }, signal: undefined }]);
});

test("native Markdown tables and HTML details reach the Rich API without legacy entity parsing", async () => {
    const { api, calls } = createApi();
    const markdown = "## Title\n\n| A | B |\n|---|---|\n| 1 | 2 |";
    const html = "<details><summary>Thinking</summary><p>&lt;literal&gt;</p></details>";
    await api.sendMessage(1, markdown, { parse_mode: "Markdown" });
    await api.sendMessage(1, html, { parse_mode: "HTML" });
    assert.deepEqual(calls.map((call) => call.payload), [
        { chat_id: 1, rich_message: { markdown } },
        { chat_id: 1, rich_message: { html } },
    ]);
});

test("edits preserve the message identity, inline buttons, and abort signal and can accept native rich payloads", async () => {
    const { api, calls } = createApi();
    const signal = new AbortController().signal as unknown as Parameters<Api["sendMessage"]>[3];
    const reply_markup = { inline_keyboard: [] };
    await api.editMessageText(1, 123, "**done**", { parse_mode: "Markdown", reply_markup }, signal);
    assert.deepEqual(calls[0], { method: "editMessageText", payload: { chat_id: 1, message_id: 123, reply_markup, rich_message: { markdown: "**done**" } }, signal });
    const payload = { chat_id: 1, message_id: 123, rich_message: { html: "<p>Native</p>" } };
    await api.raw.editMessageText(payload);
    assert.deepEqual(calls[1].payload, payload);
    await api.editMessageReplyMarkup(1, 123, { reply_markup });
    assert.equal(calls[2].method, "editMessageReplyMarkup");
});

test("grammY context replies inherit rich delivery and callback helpers edit rich messages", async () => {
    const bot = new Bot("test-token", { botInfo: { id: 5, is_bot: true, first_name: "Test", username: "test_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false, can_manage_bots: false, supports_join_request_queries: false } });
    const calls: string[] = [];
    bot.api.config.use(async (_previous, method) => {
        calls.push(method);
        return { ok: true, result: { message_id: 123, chat: { id: 1, type: "private" }, rich_message: {} } } as never;
    });
    bot.api.config.use(telegramRichMessages());
    bot.on("message:text", (ctx) => ctx.reply("Hello"));
    bot.callbackQuery("model:pick:test", (ctx) => ctx.editMessageText("Selected", { reply_markup: { inline_keyboard: [] } }));
    const chat = { id: 1, type: "private" as const, first_name: "User" };
    await bot.handleUpdate({ update_id: 1, message: { message_id: 1, date: 0, chat, from: { id: 1, is_bot: false, first_name: "User" }, text: "Hello" } });
    await bot.handleUpdate({ update_id: 2, callback_query: { id: "callback", from: { id: 1, is_bot: false, first_name: "User" }, chat_instance: "instance", data: "model:pick:test", message: { message_id: 123, date: 0, chat, rich_message: { blocks: [] } } } });
    assert.deepEqual(calls, ["sendRichMessage", "editMessageText"]);
});

test("an ambiguous rich send network failure propagates without an ordinary-message fallback or duplicate send", async () => {
    const api = new Api("test-token");
    let attempts = 0;
    const error = new HttpError("connection lost", new Error("ECONNRESET"));
    api.config.use(async () => { attempts += 1; throw error; });
    api.config.use(telegramRichMessages());
    await assert.rejects(api.sendMessage(1, "Hello", { parse_mode: "Markdown" }), (actual) => actual === error);
    assert.equal(attempts, 1);
});
