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

function createDependencies(
    client: OpenCodeClientLike,
) {
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

function expectLine(markdown: string, line: string) {
    assert.match(markdown, new RegExp(`^${escapeRegExp(line)}$`, "mu"));
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
    const { dependencies, getStatusUseCase, sessionRepo } = createDependencies(
        {
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
        } as never,
    );

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
    expectLine(markdown, "## \uD83D\uDDA5\uFE0F Overview");
    expectLine(markdown, "## \uD83D\uDCC1 Workspace");
    expectLine(markdown, "## \uD83E\uDDE9 Plugins");
    expectLine(markdown, "## \uD83D\uDD0C MCP");
    expectLine(markdown, "## \uD83E\uDDE0 LSP");
    expectLine(markdown, "- **Connectivity:** \uD83D\uDFE2");
    expectLine(markdown, "- **OpenCode Version:** 1.0.0");
    expectLine(markdown, `- **opencode-tbot Version:** ${OPENCODE_TBOT_VERSION}`);
    expectLine(markdown, "- **Current Project:** `E:/repo-1`");
    expectLine(markdown, "- **Current Session:** Build status (build-status)");
    expectLine(markdown, "- `opencode-tbot@latest`");
    expectLine(markdown, "- `workspace-tools`");
    assert.match(markdown, /- `alpha`\n  - \*\*Status:\*\* \uD83D\uDFE2\n- `beta`/u);
    assert.match(markdown, /- `beta`\n  - \*\*Status:\*\* \u26AA/u);
    assert.doesNotMatch(markdown, /Configured Plugins/u);
    assert.doesNotMatch(markdown, /beta[\s\S]*disabled/u);
    assert.doesNotMatch(markdown, /Model Context Protocol/u);
    assert.doesNotMatch(markdown, /Language Server/u);
    assert.doesNotMatch(markdown, /Service Status/u);
    assert.doesNotMatch(markdown, /Service\s+\|\s+Status\s+\|\s+Notes/u);
    assert.doesNotMatch(markdown, /Language\s+\|\s+Status\s+\|\s+Root/u);
    assert.doesNotMatch(markdown, /```/u);
    assert.doesNotMatch(markdown, /Last updated/u);
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
    expectLine(markdown, "- **Connectivity:** \uD83D\uDD34");
    expectLine(markdown, "- **Current Project:** `E:/repo`");
    expectLine(markdown, "- **Current Session:** OpenCode Default");
    assert.match(markdown, /- \*\*Details:\*\* Unexpected error\./u);
    assert.match(markdown, /- \*\*Details:\*\* Cause: health boom/u);
    assert.match(markdown, /- \*\*Details:\*\* Cause: mcp boom/u);
    assert.match(markdown, /No plugins configured in the OpenCode config\./u);
    assert.match(markdown, /No LSP servers detected for the current project\./u);
    assert.equal(await sessionRepo.getByChatId(2), null);
});

test("/status uses the selected chat language", async () => {
    const project = createProject("project-1", "/");
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
    expectLine(markdown, "## \uD83D\uDDA5\uFE0F \u6982\u89C8");
    expectLine(markdown, "## \uD83D\uDCC1 \u5DE5\u4F5C\u533A");
    expectLine(markdown, "## \uD83E\uDDE9 \u63D2\u4EF6");
    expectLine(markdown, "## \uD83D\uDD0C MCP");
    expectLine(markdown, "## \uD83E\uDDE0 LSP");
    expectLine(markdown, "- **\u8FDE\u901A\u6027:** \uD83D\uDFE2");
    expectLine(markdown, "- **OpenCode\u7248\u672C:** 1.0.0");
    expectLine(markdown, `- **opencode-tbot\u7248\u672C:** ${OPENCODE_TBOT_VERSION}`);
    expectLine(markdown, "- **\u5F53\u524D\u9879\u76EE:** `E:/repo`");
    expectLine(markdown, "- **\u5F53\u524D\u4F1A\u8BDD:** OpenCode \u9ED8\u8BA4");
    assert.doesNotMatch(markdown, /\u5DF2\u914D\u7F6E\u63D2\u4EF6/u);
    assert.doesNotMatch(markdown, /\u5DF2\u7981\u7528/u);
    assert.doesNotMatch(markdown, /\u670D\u52A1\u72B6\u6001/u);
    assert.doesNotMatch(markdown, /\u6700\u540E\u66F4\u65B0/u);
});
