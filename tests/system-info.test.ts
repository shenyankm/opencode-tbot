import assert from "node:assert/strict";
import test from "node:test";
import type { Logger } from "pino";
import { handlePathCommand } from "../src/bot/commands/path.js";
import type { BotDependencies } from "../src/bot/types.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";

const logger = {
    error() { },
    info() { },
} as unknown as Logger;

function createDependencies() {
    const sessionRepo = new InMemorySessionRepository();

    return {
        logger,
        sessionRepo,
        getConfigUseCase: {
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
            chat: { id: 1 },
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

test("/path uses the selected chat language for bot-generated output", async () => {
    const dependencies = createDependencies();
    await dependencies.sessionRepo.setCurrent({
        chatId: 2,
        sessionId: null,
        projectId: null,
        directory: null,
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: "zh-CN",
        updatedAt: new Date(0).toISOString(),
    });
    const replies: string[] = [];

    await handlePathCommand(
        {
            chat: { id: 2 },
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
            "当前路径",
            "主目录: E:/Users/demo",
            "状态目录: E:/Users/demo/.opencode",
            "配置文件: E:/repo/opencode.json",
            "工作树: E:/repo",
            "当前目录: E:/repo/src",
        ].join("\n"),
    );
});
