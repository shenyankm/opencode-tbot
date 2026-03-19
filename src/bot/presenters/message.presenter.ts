import type {
    OpenCodeAgent,
    OpenCodeConfiguredModel,
    OpenCodeHealth,
    OpenCodeLspStatus,
    OpenCodeMcpStatus,
    OpenCodePath,
    OpenCodeSession,
} from "../../services/opencode/opencode.client.js";
import type { GetStatusResult } from "../../use-cases/get-status.usecase.js";
import {
    BOT_COPY,
    getLanguageLabel,
    type BotCopy,
    type BotLanguage,
} from "../copy.js";
import { presentError } from "./error.presenter.js";
import {
    getAgentsPage,
    getModelsPage,
    getSessionsPage,
} from "./keyboard.presenter.js";

interface ModelsMessageInput {
    currentModelId: string | null;
    currentModelProviderId: string | null;
    currentModelVariant: string | null;
    models: OpenCodeConfiguredModel[];
    page: number;
}

interface AgentsMessageInput {
    agents: OpenCodeAgent[];
    currentAgentName: string | null;
    page: number;
}

interface SessionsMessageInput {
    currentDirectory: string;
    currentSessionId: string | null;
    page: number;
    sessions: OpenCodeSession[];
}

interface McpMessageInput {
    currentDirectory: string;
    statuses: Array<{
        name: string;
        status: OpenCodeMcpStatus;
    }>;
}

interface LspMessageInput {
    currentDirectory: string;
    statuses: OpenCodeLspStatus[];
}

interface StatusLayoutCopy {
    currentDirectoryLabel: string;
    detailsLabel: string;
    divider: string;
    errorStatus: string;
    healthyStatus: string;
    languageLabel: string;
    lastUpdatedLabel: string;
    lspTitle: string;
    mcpNotesLabel: string;
    mcpRegistrationRequiredStatus: string;
    mcpTitle: string;
    mcpFailedStatus: string;
    noneStatus: string;
    okLabel: string;
    pageTitle: string;
    rootLabel: string;
    serverTitle: string;
    serviceLabel: string;
    statusLabel: string;
    versionLabel: string;
    workspaceTitle: string;
}

const VARIANT_ORDER = ["minimal", "none", "low", "medium", "high", "xhigh", "max"];

export function presentHealthMessage(health: OpenCodeHealth, copy: BotCopy = BOT_COPY): string {
    return [
        copy.health.title,
        copy.health.status(health.healthy),
        copy.health.version(health.version),
    ].join("\n");
}

export function presentPathMessage(path: OpenCodePath, copy: BotCopy = BOT_COPY): string {
    return copy.path.directory(path.directory);
}

export function presentStatusMessage(input: GetStatusResult, copy: BotCopy = BOT_COPY): string {
    const layout = getStatusLayoutCopy(copy);
    const sections = [
        presentStatusPlainSection(layout.serverTitle, presentStatusPlainServerLines(input, copy, layout)),
        presentStatusPlainSection(layout.workspaceTitle, presentStatusPlainWorkspaceLines(input, copy, layout)),
        presentStatusPlainSection(layout.mcpTitle, presentStatusPlainMcpLines(input, copy, layout)),
        presentStatusPlainSection(layout.lspTitle, presentStatusPlainLspLines(input, copy, layout)),
        layout.divider,
        `${layout.lastUpdatedLabel}: ${formatStatusDate(new Date())}`,
    ];

    return presentStatusSections(layout.pageTitle, sections);
}

export function presentStatusMarkdownMessage(input: GetStatusResult, copy: BotCopy = BOT_COPY): string {
    const layout = getStatusLayoutCopy(copy);
    const sections = [
        presentStatusMarkdownSection(layout.serverTitle, presentStatusMarkdownServerLines(input, copy, layout)),
        presentStatusMarkdownSection(layout.workspaceTitle, presentStatusMarkdownWorkspaceLines(input, copy, layout)),
        presentStatusMarkdownSection(layout.mcpTitle, presentStatusMarkdownMcpLines(input, copy, layout)),
        presentStatusMarkdownSection(layout.lspTitle, presentStatusMarkdownLspLines(input, copy, layout)),
        layout.divider,
        `_${layout.lastUpdatedLabel}: ${formatStatusDate(new Date())}_`,
    ];

    return presentStatusSections(`# ${layout.pageTitle}`, sections);
}

export function presentMcpMessage(input: McpMessageInput, copy: BotCopy = BOT_COPY): string {
    const lines = [
        copy.mcp.title,
        copy.mcp.currentProject(input.currentDirectory),
        "",
    ];

    if (input.statuses.length === 0) {
        lines.push(copy.mcp.none);
        return lines.join("\n");
    }

    lines.push(...input.statuses.map(({ name, status }) => `${name}: ${formatMcpStatus(status, copy)}`));

    return lines.join("\n");
}

export function presentLspMessage(input: LspMessageInput, copy: BotCopy = BOT_COPY): string {
    const lines = [
        copy.lsp.title,
        copy.lsp.currentProject(input.currentDirectory),
        "",
    ];

    if (input.statuses.length === 0) {
        lines.push(copy.lsp.none);
        return lines.join("\n");
    }

    lines.push(...input.statuses.map((status) => `${status.name}: ${formatLspStatus(status, copy)}`));

    return lines.join("\n");
}

function presentStatusSections(title: string, sections: string[]): string {
    return [
        title,
        "",
        ...sections.flatMap((section, index) => index === 0 ? [section] : ["", section]),
    ].join("\n");
}

function presentStatusPlainSection(title: string, lines: string[]): string {
    return [
        title,
        ...lines,
    ].join("\n");
}

function presentStatusMarkdownSection(title: string, lines: string[]): string {
    return [
        `## ${title}`,
        ...lines,
    ].join("\n");
}

function presentStatusPlainServerLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    if (input.health.status === "error") {
        return presentStatusPlainErrorLines(input.health.error, copy, layout);
    }

    return [
        presentPlainStatusBullet(layout.statusLabel, formatHealthBadge(input.health.data.healthy, layout)),
        presentPlainStatusBullet(layout.versionLabel, input.health.data.version),
    ];
}

function presentStatusMarkdownServerLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    if (input.health.status === "error") {
        return presentStatusMarkdownErrorLines(input.health.error, copy, layout);
    }

    return [
        presentMarkdownStatusBullet(layout.statusLabel, formatHealthBadge(input.health.data.healthy, layout)),
        presentMarkdownStatusBullet(layout.versionLabel, input.health.data.version),
    ];
}

function presentStatusPlainWorkspaceLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    if (input.path.status === "error") {
        return presentStatusPlainErrorLines(input.path.error, copy, layout);
    }

    return [
        presentPlainStatusBullet(layout.currentDirectoryLabel, input.path.data.directory),
    ];
}

function presentStatusMarkdownWorkspaceLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    if (input.path.status === "error") {
        return presentStatusMarkdownErrorLines(input.path.error, copy, layout);
    }

    return [
        presentMarkdownStatusBullet(layout.currentDirectoryLabel, input.path.data.directory, {
            codeValue: true,
        }),
    ];
}

function presentStatusPlainLspLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    return buildPlainStatusTable(
        [layout.languageLabel, layout.statusLabel, layout.rootLabel],
        buildLspStatusRows(input, copy, layout),
    );
}

function presentStatusMarkdownLspLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    return buildMarkdownStatusTable(
        [layout.languageLabel, layout.statusLabel, layout.rootLabel],
        buildLspStatusRows(input, copy, layout),
    );
}

function presentStatusPlainMcpLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    return buildPlainStatusTable(
        [layout.serviceLabel, layout.statusLabel, layout.mcpNotesLabel],
        buildMcpStatusRows(input, copy, layout),
    );
}

function presentStatusMarkdownMcpLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    return buildMarkdownStatusTable(
        [layout.serviceLabel, layout.statusLabel, layout.mcpNotesLabel],
        buildMcpStatusRows(input, copy, layout),
    );
}

function buildLspStatusRows(
    input: GetStatusResult,
    copy: BotCopy,
    layout: StatusLayoutCopy,
): string[][] {
    if (input.lsp.status === "error") {
        return [["-", layout.errorStatus, flattenStatusError(input.lsp.error, copy)]];
    }

    if (input.lsp.data.statuses.length === 0) {
        return [["-", layout.noneStatus, copy.lsp.none]];
    }

    return input.lsp.data.statuses.map((status) => [
        status.name,
        formatLspStatusBadge(status, copy),
        status.root || "-",
    ]);
}

function buildMcpStatusRows(
    input: GetStatusResult,
    copy: BotCopy,
    layout: StatusLayoutCopy,
): string[][] {
    if (input.mcp.status === "error") {
        return [["-", layout.errorStatus, flattenStatusError(input.mcp.error, copy)]];
    }

    if (input.mcp.data.statuses.length === 0) {
        return [["-", layout.noneStatus, copy.mcp.none]];
    }

    return input.mcp.data.statuses.map(({ name, status }) => [
        name,
        formatMcpStatusBadge(status, copy, layout),
        formatMcpStatusNotes(status, layout),
    ]);
}

function buildPlainStatusTable(headers: string[], rows: string[][]): string[] {
    return [
        formatPlainTableRow(headers),
        formatPlainTableSeparator(headers.length),
        ...rows.map((row) => formatPlainTableRow(row)),
    ];
}

function buildMarkdownStatusTable(headers: string[], rows: string[][]): string[] {
    return [
        `| ${headers.map(sanitizeTableCell).join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...rows.map((row) => `| ${row.map(sanitizeTableCell).join(" | ")} |`),
    ];
}

function formatPlainTableRow(columns: string[]): string {
    return `| ${columns.map(sanitizeTableCell).join(" | ")} |`;
}

function formatPlainTableSeparator(columnCount: number): string {
    return `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`;
}

function sanitizeTableCell(value: string): string {
    return value
        .replace(/\r\n?/g, " / ")
        .replace(/\|/g, "/")
        .trim();
}

function presentStatusPlainErrorLines(error: unknown, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    const detailLines = splitStatusLines(presentError(error, copy));

    return [
        presentPlainStatusBullet(layout.statusLabel, layout.errorStatus),
        ...detailLines.map((line) => presentPlainStatusBullet(layout.detailsLabel, line)),
    ];
}

function presentStatusMarkdownErrorLines(error: unknown, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    const detailLines = splitStatusLines(presentError(error, copy));

    return [
        presentMarkdownStatusBullet(layout.statusLabel, layout.errorStatus),
        ...detailLines.map((line) => presentMarkdownStatusBullet(layout.detailsLabel, line)),
    ];
}

function flattenStatusError(error: unknown, copy: BotCopy): string {
    const lines = splitStatusLines(presentError(error, copy));

    return lines.join(" / ");
}

function presentPlainStatusBullet(label: string, value: string): string {
    return `- ${label}: ${value}`;
}

function presentMarkdownStatusBullet(
    label: string,
    value: string,
    options: {
        codeValue?: boolean;
    } = {},
): string {
    return options.codeValue
        ? `- **${label}:** \`${value}\``
        : `- **${label}:** ${value}`;
}

function splitStatusLines(text: string): string[] {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

function formatHealthBadge(healthy: boolean, layout: StatusLayoutCopy): string {
    return healthy ? layout.healthyStatus : layout.errorStatus;
}

function formatLspStatusBadge(status: OpenCodeLspStatus, copy: BotCopy): string {
    switch (status.status) {
        case "connected":
            return `🟢 ${copy.lsp.connected}`;
        case "error":
            return `🔴 ${copy.lsp.error}`;
    }

    const exhaustiveStatus: never = status.status;

    return exhaustiveStatus;
}

function formatMcpStatusBadge(status: OpenCodeMcpStatus, copy: BotCopy, layout: StatusLayoutCopy): string {
    switch (status.status) {
        case "connected":
            return `🟢 ${copy.mcp.connected}`;
        case "disabled":
            return `⚪ ${copy.mcp.disabled}`;
        case "needs_auth":
            return `🟡 ${copy.mcp.needsAuth}`;
        case "failed":
            return layout.mcpFailedStatus;
        case "needs_client_registration":
            return layout.mcpRegistrationRequiredStatus;
    }

    const exhaustiveStatus: never = status;

    return exhaustiveStatus;
}

function formatMcpStatusNotes(status: OpenCodeMcpStatus, layout: StatusLayoutCopy): string {
    switch (status.status) {
        case "connected":
            return layout.okLabel;
        case "disabled":
            return "-";
        case "needs_auth":
            return "-";
        case "failed":
            return status.error;
        case "needs_client_registration":
            return status.error;
    }

    const exhaustiveStatus: never = status;

    return exhaustiveStatus;
}

function formatStatusDate(value: Date): string {
    return value.toISOString().slice(0, 10);
}

function getStatusLayoutCopy(copy: BotCopy): StatusLayoutCopy {
    const isEnglish = copy.systemStatus.title === BOT_COPY.systemStatus.title;

    if (isEnglish) {
        return {
            currentDirectoryLabel: "Current Directory",
            detailsLabel: "Details",
            divider: "────────────────",
            errorStatus: "🔴 Unhealthy",
            healthyStatus: "🟢 Healthy",
            languageLabel: "Language",
            lastUpdatedLabel: "Last updated",
            lspTitle: "🧠 LSP (Language Server)",
            mcpNotesLabel: "Notes",
            mcpRegistrationRequiredStatus: "🟡 Registration Required",
            mcpTitle: "🔌 MCP (Model Context Protocol)",
            mcpFailedStatus: "🔴 Failed",
            noneStatus: "⚪ None",
            okLabel: "OK",
            pageTitle: "📊 Service Status",
            rootLabel: "Root",
            serverTitle: "🖥️ Server",
            serviceLabel: "Service",
            statusLabel: "Status",
            versionLabel: "Version",
            workspaceTitle: "📁 Workspace",
        };
    }

    return {
        currentDirectoryLabel: "当前目录",
        detailsLabel: "详情",
        divider: "────────────────",
        errorStatus: "🔴 异常",
        healthyStatus: "🟢 健康",
        languageLabel: "语言",
        lastUpdatedLabel: "最后更新",
        lspTitle: "🧠 LSP (Language Server)",
        mcpNotesLabel: "说明",
        mcpRegistrationRequiredStatus: "🟡 需要注册",
        mcpTitle: "🔌 MCP (Model Context Protocol)",
        mcpFailedStatus: "🔴 失败",
        noneStatus: "⚪ 无",
        okLabel: "正常",
        pageTitle: "📊 服务状态",
        rootLabel: "根目录",
        serverTitle: "🖥️ 服务端",
        serviceLabel: "服务",
        statusLabel: "状态",
        versionLabel: "版本",
        workspaceTitle: "📁 工作区",
    };
}

export function presentSessionsMessage(input: SessionsMessageInput, copy: BotCopy = BOT_COPY): string {
    if (input.sessions.length === 0) {
        return copy.sessions.none;
    }

    const page = getSessionsPage(input.sessions, input.page);
    const currentSession = input.currentSessionId
        ? input.sessions.find((session) => session.id === input.currentSessionId) ?? null
        : null;
    const lines = [
        copy.sessions.title,
        copy.sessions.currentProject(input.currentDirectory),
        copy.sessions.currentSession(currentSession ? formatSessionLabel(currentSession) : copy.common.notSelected),
        copy.common.page(page.page + 1, page.totalPages),
        "",
        ...page.items.map((session, index) => `${page.startIndex + index + 1}. ${formatSessionLabel(session)}`),
    ];

    return lines.join("\n");
}

export function presentSessionSwitchMessage(session: OpenCodeSession, copy: BotCopy = BOT_COPY): string {
    return [
        copy.sessions.switched,
        copy.sessions.currentSession(formatSessionLabel(session)),
    ].join("\n");
}

export function presentSessionCreatedMessage(session: OpenCodeSession, copy: BotCopy = BOT_COPY): string {
    return [
        copy.sessions.created,
        copy.sessions.currentSession(formatSessionLabel(session)),
    ].join("\n");
}

export function presentSessionActionsMessage(
    input: { currentDirectory: string; session: OpenCodeSession },
    copy: BotCopy = BOT_COPY,
): string {
    return [
        copy.sessions.actionTitle,
        copy.sessions.currentProject(input.currentDirectory),
        copy.sessions.selectedSession(formatSessionLabel(input.session)),
        "",
        copy.sessions.chooseAction,
    ].join("\n");
}

export function presentSessionRenamePromptMessage(session: OpenCodeSession, copy: BotCopy = BOT_COPY): string {
    return copy.sessions.renamePrompt(formatSessionLabel(session));
}

export function presentSessionRenamedMessage(session: OpenCodeSession, copy: BotCopy = BOT_COPY): string {
    return [
        copy.sessions.renamed,
        copy.sessions.currentSession(formatSessionLabel(session)),
    ].join("\n");
}

export function presentAgentsMessage(input: AgentsMessageInput, copy: BotCopy = BOT_COPY): string {
    if (input.agents.length === 0) {
        return copy.agents.none;
    }

    const page = getAgentsPage(input.agents, input.page);
    const currentAgent = input.currentAgentName
        ? input.agents.find((agent) => agent.name === input.currentAgentName) ?? null
        : null;
    const lines = [
        copy.agents.title,
        copy.agents.current(currentAgent ? formatAgentLabel(currentAgent) : copy.common.openCodeDefault),
        copy.common.page(page.page + 1, page.totalPages),
        "",
        ...page.items.map((agent, index) => `${page.startIndex + index + 1}. ${formatAgentLabel(agent)}`),
    ];

    return lines.join("\n");
}

export function presentAgentSwitchMessage(agent: OpenCodeAgent, copy: BotCopy = BOT_COPY): string {
    return [
        copy.agents.switched,
        copy.agents.current(formatAgentLabel(agent)),
    ].join("\n");
}

export function presentModelsMessage(input: ModelsMessageInput, copy: BotCopy = BOT_COPY): string {
    if (input.models.length === 0) {
        return copy.models.none;
    }

    const page = getModelsPage(input.models, input.page);
    const currentModel = input.currentModelId && input.currentModelProviderId
        ? input.models.find((model) =>
            model.id === input.currentModelId && model.providerID === input.currentModelProviderId,
        ) ?? null
        : null;
    const currentModelLine = currentModel
        ? formatModelSelection(currentModel, input.currentModelVariant, copy)
        : copy.common.openCodeDefault;
    const lines = [
        copy.models.title,
        copy.models.configuredOnly,
        copy.models.current(currentModelLine),
        copy.common.page(page.page + 1, page.totalPages),
        "",
        ...page.items.map((model, index) => formatModelListLine(model, page.startIndex + index + 1)),
    ];

    return lines.join("\n");
}

export function presentModelVariantsMessage(
    model: OpenCodeConfiguredModel,
    modelIndex: number,
    copy: BotCopy = BOT_COPY,
): string {
    const variants = getModelVariants(model);

    if (variants.length === 0) {
        return [
            copy.models.noReasoningLevels,
            copy.models.model(formatModelLabel(model)),
        ].join("\n");
    }

    const lines = [
        copy.models.reasoningLevelsTitle,
        copy.models.model(formatModelLabel(model)),
        copy.models.modelNumber(modelIndex),
        "",
        ...variants.map((variant, index) => `${index + 1}. ${variant}`),
    ];

    return lines.join("\n");
}

export function presentModelSwitchMessage(
    model: OpenCodeConfiguredModel,
    variant: string | null,
    copy: BotCopy = BOT_COPY,
): string {
    return [
        copy.models.switched,
        copy.models.current(formatModelLabel(model)),
        copy.models.currentReasoningLevel(variant ?? copy.models.defaultReasoningLevel),
    ].join("\n");
}

export function presentLanguageMessage(currentLanguage: BotLanguage, copy: BotCopy = BOT_COPY): string {
    return [
        copy.language.title,
        copy.language.current(getLanguageLabel(currentLanguage, copy)),
        "",
        copy.language.choose,
    ].join("\n");
}

export function presentLanguageSwitchMessage(currentLanguage: BotLanguage, copy: BotCopy = BOT_COPY): string {
    return [
        copy.language.switched,
        copy.language.current(getLanguageLabel(currentLanguage, copy)),
    ].join("\n");
}

export function getModelVariants(model: OpenCodeConfiguredModel): string[] {
    return Object.keys(model.variants)
        .sort((left, right) => compareVariantNames(left, right));
}

function compareVariantNames(left: string, right: string): number {
    const leftIndex = VARIANT_ORDER.indexOf(left);
    const rightIndex = VARIANT_ORDER.indexOf(right);

    if (leftIndex === -1 && rightIndex === -1) {
        return left.localeCompare(right);
    }

    if (leftIndex === -1) {
        return 1;
    }

    if (rightIndex === -1) {
        return -1;
    }

    return leftIndex - rightIndex;
}

function formatAgentLabel(agent: OpenCodeAgent): string {
    return `${agent.name} [${agent.mode}]`;
}

function formatModelListLine(model: OpenCodeConfiguredModel, displayIndex: number): string {
    return `${displayIndex}. ${formatModelLabel(model)}`;
}

function formatModelSelection(
    model: OpenCodeConfiguredModel,
    variant: string | null,
    copy: BotCopy,
): string {
    return `${formatModelLabel(model)} | ${copy.models.reasoningLevel(variant ?? copy.models.defaultReasoningLevel)}`;
}

function formatModelLabel(model: OpenCodeConfiguredModel): string {
    return `${model.providerName} / ${model.name}`;
}

function formatSessionLabel(session: OpenCodeSession): string {
    const title = session.title.trim() || session.slug || session.id;

    return title === session.slug
        ? title
        : `${title} [${session.slug}]`;
}

function formatMcpStatus(status: OpenCodeMcpStatus, copy: BotCopy): string {
    switch (status.status) {
        case "connected":
            return copy.mcp.connected;
        case "disabled":
            return copy.mcp.disabled;
        case "needs_auth":
            return copy.mcp.needsAuth;
        case "failed":
            return copy.mcp.failed(status.error);
        case "needs_client_registration":
            return copy.mcp.needsClientRegistration(status.error);
    }

    const exhaustiveStatus: never = status;

    return exhaustiveStatus;
}

function formatLspStatus(status: OpenCodeLspStatus, copy: BotCopy): string {
    switch (status.status) {
        case "connected":
            return copy.lsp.connected;
        case "error":
            return copy.lsp.error;
    }

    const exhaustiveStatus: never = status.status;

    return exhaustiveStatus;
}
