import assert from "node:assert/strict";
import test from "node:test";
import { getBotCopy } from "../src/bot/copy.js";

test("language labels use endonyms consistently across all UI languages", () => {
    assert.deepEqual(getBotCopy("en").language.labels, {
        en: "English",
        "zh-CN": "简体中文",
        ja: "日本語",
    });
    assert.deepEqual(getBotCopy("zh-CN").language.labels, {
        en: "English",
        "zh-CN": "简体中文",
        ja: "日本語",
    });
    assert.deepEqual(getBotCopy("ja").language.labels, {
        en: "English",
        "zh-CN": "简体中文",
        ja: "日本語",
    });
});

test("agent terminology is standardized in Chinese and Japanese menu copy", () => {
    const zhCopy = getBotCopy("zh-CN");
    const jaCopy = getBotCopy("ja");

    assert.equal(zhCopy.commands.agents, "查看并切换 Agent");
    assert.equal(zhCopy.agents.title, "Agent 列表");
    assert.equal(zhCopy.agents.current("build [primary]"), "当前 Agent: build [primary]");

    assert.equal(jaCopy.commands.agents, "エージェントを表示して切り替え");
    assert.equal(jaCopy.agents.title, "エージェント一覧");
    assert.equal(jaCopy.agents.current("build [primary]"), "現在のエージェント: build [primary]");
});
