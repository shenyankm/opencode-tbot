import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { OPENCODE_TBOT_VERSION } from "../src/app/package-info.js";
import { getChatCopy } from "../src/bot/i18n.js";
import { handleStatusCommand } from "../src/bot/commands/status.js";
import { presentStatusMarkdownMessage } from "../src/bot/presenters/message.presenter.js";
import type { AppLogger } from "../src/infra/logger/index.js";
import { InMemorySessionRepository } from "../src/repositories/session.repo.js";
import type {
    OpenCodeClientLike,
    OpenCodeProject,
} from "../src/services/opencode/opencode.client.js";
import { renderMarkdownToTelegramMarkdownV2 } from "../src/services/telegram/telegram-format.js";
import { GetHealthUseCase } from "../src/use-cases/get-health.usecase.js";
import { GetPathUseCase } from "../src/use-cases/get-path.usecase.js";
import { GetStatusUseCase } from "../src/use-cases/get-status.usecase.js";
import { ListLspUseCase } from "../src/use-cases/list-lsp.usecase.js";
import { ListMcpUseCase } from "../src/use-cases/list-mcp.usecase.js";
import { ListSessionsUseCase } from "../src/use-cases/list-sessions.usecase.js";

const logger = {
    error() { },
    info() { },
} as unknown as AppLogger;

interface StatusReply {
    options?: {
        parse_mode: "MarkdownV2";
    };
    text: string;
}

function createProject(id: string, worktree: string): OpenCodeProject {
    return {
        id,
        worktree,
        time: { created: 1, updated: 1 },
        sandboxes: [],
    } as OpenCodeProject;
}

function createDependencies(client: OpenCodeClientLike) {
    const sessionRepo = new InMemorySessionRepository();
    const getHealthUseCase = new GetHealthUseCase(client);
    const getPathUseCase = new GetPathUseCase(client);
    const listLspUseCase = new ListLspUseCase(sessionRepo, client);
    const listMcpUseCase = new ListMcpUseCase(sessionRepo, client);
    const listSessionsUseCase = new ListSessionsUseCase(sessionRepo, client);
    const getStatusUseCase = new GetStatusUseCase(
        getHealthUseCase,
        getPathUseCase,
        listLspUseCase,
        listMcpUseCase,
        listSessionsUseCase,
        sessionRepo,
    );

    return {
        dependencies: {
            getStatusUseCase,
            logger,
            sessionRepo,
        } as never,
        getStatusUseCase,
        sessionRepo,
    };
}

function renderStatusMarkdown(
    result: Awaited<ReturnType<GetStatusUseCase["execute"]>>,
    copy: Awaited<ReturnType<typeof getChatCopy>>,
): string {
    return presentStatusMarkdownMessage(result, copy);
}

function renderExpectedStatusMarkdown(
    result: Awaited<ReturnType<GetStatusUseCase["execute"]>>,
    copy: Awaited<ReturnType<typeof getChatCopy>>,
): string {
    const rendered = renderMarkdownToTelegramMarkdownV2(renderStatusMarkdown(result, copy));

    assert.ok(rendered);

    return rendered;
}

function countOccurrences(text: string, value: string): number {
    return text.split(value).length - 1;
}

function createOpenCodeConfigFile(config: Record<string, unknown>): string {
    const directory = mkdtempSync(join(tmpdir(), "opencode-tbot-status-"));
    const filePath = join(directory, "opencode.json");

    writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    return filePath;
}

function createOpenCodeConfigDirectory(config: Record<string, unknown>): string {
    return dirname(createOpenCodeConfigFile(config));
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("/status aggregates health, path, plugins, LSP, and MCP into one reply", async () => {
    const project = createProject("project-1", "E:/repo-1");
    const configDirectoryPath = createOpenCodeConfigDirectory({
        plugin: [
            "opencode-tbot@latest",
            "workspace-tools",
        ],
    });
    const replies: StatusReply[] = [];
    const { dependencies, getStatusUseCase, sessionRepo } = createDependencies({
        async getCurrentProject() {
            return project;
        },
        async getHealth() {
            return {
                healthy: true,
                version: "1.0.0",
            };
        },
        async getPath() {
            return {
                home: "E:/Users/demo",
                state: "E:/Users/demo/.opencode",
                config: configDirectoryPath,
                worktree: "E:/repo",
                directory: "E:/repo-1",
            };
        },
        async listSessions() {
            return [
                {
                    id: "session-1",
                    slug: "build-status",
                    title: "Build status",
                    projectID: "project-1",
                },
            ] as never;
        },
        async listProjects() {
            return [project];
        },
        async listLspStatuses(directory) {
            assert.equal(directory, "E:/repo-1");

            return [
                { id: "ts-2", name: "TypeScript", root: "E:/repo-1/packages/app", status: "connected" },
                { id: "go-1", name: "Go", root: "E:/repo-1/server", status: "error" },
                { id: "ts-1", name: "TypeScript", root: "E:/repo-1", status: "connected" },
            ] as never;
        },
        async listMcpStatuses(directory) {
            assert.equal(directory, "E:/repo-1");

            return {
                zed: { status: "needs_auth" },
                alpha: { status: "connected" },
                beta: { status: "disabled" },
                delta: { status: "failed", error: "timeout" },
                gamma: { status: "needs_client_registration", error: "missing metadata" },
            };
        },
    } as never);

    await sessionRepo.setCurrent({
        chatId: 1,
        sessionId: "session-1",
        projectId: "project-1",
        directory: "E:/repo-1",
        agentName: null,
        modelProviderId: null,
        modelId: null,
        modelVariant: null,
        language: null,
        updatedAt: new Date(0).toISOString(),
    });

    await handleStatusCommand(
        {
            chat: { id: 1 },
            async reply(text, options) {
                replies.push({ text, options });
                return {};
            },
        },
        dependencies,
    );

    const copy = await getChatCopy(sessionRepo, 1);
    const result = await getStatusUseCase.execute({ chatId: 1 });
    const markdown = renderStatusMarkdown(result, copy);
    const expected = renderExpectedStatusMarkdown(result, copy);

    assert.equal(replies[0]?.text, expected);
    assert.deepEqual(replies[0]?.options, { parse_mode: "MarkdownV2" });
    assert.match(markdown, /^# 📊 Service Status$/mu);
    assert.match(markdown, /^## 🖥️ Overview$/mu);
    assert.match(markdown, /^## 📁 Workspace$/mu);
    assert.match(markdown, /^## 🧩 Plugins$/mu);
    assert.match(markdown, /^## 🔌 MCP$/mu);
    assert.match(markdown, /^## 🧠 LSP$/mu);
    assert.match(markdown, /- \*\*Connectivity:\*\* 🟢/u);
    assert.match(markdown, /- \*\*OpenCode Version:\*\* 1\.0\.0/u);
    assert.match(markdown, new RegExp(`- \\*\\*opencode-tbot Version:\\*\\* ${escapeRegExp(OPENCODE_TBOT_VERSION)}`));
    assert.match(markdown, /- \*\*Current Project:\*\* `E:\/repo-1`/u);
    assert.match(markdown, /- \*\*Current Session:\*\* Build status \(build-status\)/u);
    assert.match(markdown, /opencode-tbot@latest/u);
    assert.match(markdown, /workspace-tools/u);
    assert.match(markdown, /- \*\*Status:\*\* 🟢/u);
    assert.doesNotMatch(markdown, /Config File/u);
    assert.doesNotMatch(markdown, /Model Context Protocol/u);
    assert.doesNotMatch(markdown, /Language Server/u);
    assert.doesNotMatch(markdown, /connected/u);
    assert.doesNotMatch(markdown, /Service\s+\|\s+Status\s+\|\s+Notes/u);
    assert.doesNotMatch(markdown, /Language\s+\|\s+Status\s+\|\s+Root/u);
    assert.doesNotMatch(markdown, /```/u);
    assert.doesNotMatch(markdown, /Last updated/u);
    assert.equal(countOccurrences(markdown, "Current Project"), 1);
});

test("/status keeps successful sections when one section fails", async () => {
    const project = createProject("project-1", "E:/repo-1");
    const replies: StatusReply[] = [];
    const { dependencies, getStatusUseCase, sessionRepo } = createDependencies({
        async getCurrentProject() {
            return project;
        },
        async getHealth() {
            throw new Error("health boom");
        },
        async getPath() {
            return {
                home: "E:/Users/demo",
                state: "E:/Users/demo/.opencode",
                config: "E:/repo/opencode.json",
                worktree: "E:/repo",
                directory: "E:/repo/src",
            };
        },
        async listLspStatuses() {
            return [];
        },
        async listMcpStatuses() {
            throw new Error("mcp boom");
        },
    } as never);

    await handleStatusCommand(
        {
            chat: { id: 2 },
            async reply(text, options) {
                replies.push({ text, options });
                return {};
            },
        },
        dependencies,
    );

    const copy = await getChatCopy(sessionRepo, 2);
    const result = await getStatusUseCase.execute({ chatId: 2 });
    const markdown = renderStatusMarkdown(result, copy);

    assert.deepEqual(replies[0]?.options, { parse_mode: "MarkdownV2" });
    assert.match(markdown, /- \*\*Connectivity:\*\* 🔴/u);
    assert.match(markdown, /- \*\*Details:\*\* Unexpected error\./u);
    assert.match(markdown, /- \*\*Details:\*\* Cause: health boom/u);
    assert.match(markdown, new RegExp(`- \\*\\*opencode-tbot Version:\\*\\* ${escapeRegExp(OPENCODE_TBOT_VERSION)}`));
    assert.match(markdown, /- \*\*Current Project:\*\* `E:\/repo\/src`/u);
    assert.match(markdown, /No LSP servers detected for the current project\./u);
    assert.match(markdown, /mcp boom/u);
    assert.doesNotMatch(markdown, /Last updated/u);
    assert.equal(await sessionRepo.getByChatId(2), null);
});

test("/status uses the selected chat language", async () => {
    const project = createProject("project-1", "E:/repo-1");
    const replies: StatusReply[] = [];
    const { dependencies, getStatusUseCase, sessionRepo } = createDependencies({
        async getCurrentProject() {
            return project;
        },
        async getHealth() {
            return {
                healthy: true,
                version: "1.0.0",
            };
        },
        async getPath() {
            return {
                home: "E:/Users/demo",
                state: "E:/Users/demo/.opencode",
                config: "E:/repo/opencode.json",
                worktree: "E:/repo",
                directory: "E:/repo/src",
            };
        },
        async listSessions() {
            return [] as never;
        },
        async listLspStatuses() {
            return [];
        },
        async listMcpStatuses() {
            return {};
        },
    } as never);

    await sessionRepo.setCurrent({
        chatId: 3,
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

    await handleStatusCommand(
        {
            chat: { id: 3 },
            async reply(text, options) {
                replies.push({ text, options });
                return {};
            },
        },
        dependencies,
    );

    const copy = await getChatCopy(sessionRepo, 3);
    const result = await getStatusUseCase.execute({ chatId: 3 });
    const markdown = renderStatusMarkdown(result, copy);
    const expected = renderExpectedStatusMarkdown(result, copy);

    assert.equal(replies[0]?.text, expected);
    assert.deepEqual(replies[0]?.options, { parse_mode: "MarkdownV2" });
    assert.match(markdown, /^# 📊 服务状态$/mu);
    assert.match(markdown, /^## 🖥️ 概览$/mu);
    assert.match(markdown, /^## 📁 工作区$/mu);
    assert.match(markdown, /^## 🧩 插件$/mu);
    assert.match(markdown, /^## 🔌 MCP$/mu);
    assert.match(markdown, /^## 🧠 LSP$/mu);
    assert.match(markdown, /- \*\*连通性:\*\* 🟢/u);
    assert.match(markdown, /- \*\*OpenCode版本:\*\* 1\.0\.0/u);
    assert.match(markdown, new RegExp(`- \\*\\*opencode-tbot版本:\\*\\* ${escapeRegExp(OPENCODE_TBOT_VERSION)}`));
    assert.match(markdown, /- \*\*当前项目:\*\* `E:\/repo-1`/u);
    assert.match(markdown, /- \*\*当前会话:\*\* 未选择/u);
    assert.doesNotMatch(markdown, /最后更新/u);
});
