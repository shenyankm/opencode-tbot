import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "pino";
import { handleConfigCommand } from "../src/bot/commands/config.js";
import { handlePathCommand } from "../src/bot/commands/path.js";
import { presentConfigMessage } from "../src/bot/presenters/message.presenter.js";
import type { BotDependencies } from "../src/bot/types.js";

const logger = {
    error() { },
    info() { },
} as unknown as Logger;

function createDependencies() {
    return {
        logger,
        getConfigUseCase: {
            async execute() {
                return {
                    "$schema": "https://opencode.ai/config.json",
                    model: "openai/gpt-5",
                };
            },
        },
        getHealthUseCase: {
            async execute() {
                return {
                    healthy: true,
                    version: "1.0.0",
                };
            },
        },
        getPathUseCase: {
            async execute() {
                return {
                    home: "E:/Users/demo",
                    state: "E:/Users/demo/.opencode",
                    config: "E:/repo/opencode.json",
                    worktree: "E:/repo",
                    directory: "E:/repo/src",
                };
            },
        },
        listAgentsUseCase: {} as never,
        listModelsUseCase: {} as never,
        listProjectsUseCase: {} as never,
        sendPromptUseCase: {} as never,
        switchAgentUseCase: {} as never,
        switchModelUseCase: {} as never,
        switchProjectUseCase: {} as never,
    } as unknown as BotDependencies;
}

test("/path returns the current path information", async () => {
    const dependencies = createDependencies();
    const replies: string[] = [];

    await handlePathCommand(
        {
            async reply(text) {
                replies.push(text);
                return {};
            },
        },
        dependencies,
    );

    assert.equal(
        replies[0],
        [
            "Current Paths",
            "Home: E:/Users/demo",
            "State: E:/Users/demo/.opencode",
            "Config: E:/repo/opencode.json",
            "Worktree: E:/repo",
            "Directory: E:/repo/src",
        ].join("\n"),
    );
});

test("/config returns the current configuration", async () => {
    const dependencies = createDependencies();
    const replies: string[] = [];

    await handleConfigCommand(
        {
            async reply(text) {
                replies.push(text);
                return {};
            },
        },
        dependencies,
    );

    assert.equal(
        replies[0],
        [
            "Config",
            "{",
            "  \"$schema\": \"https://opencode.ai/config.json\",",
            "  \"model\": \"openai/gpt-5\"",
            "}",
        ].join("\n"),
    );
});

test("presentConfigMessage truncates oversized config payloads", () => {
    const message = presentConfigMessage({
        notes: "x".repeat(5000),
    } as never);

    assert.match(message, /^Config\n/);
    assert.match(message, /\.\.\. \(truncated\)$/);
    assert.ok(message.length < 4000);
});
