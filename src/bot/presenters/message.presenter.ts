import type {
    OpenCodeAgent,
    OpenCodeConfiguredModel,
    OpenCodeHealth,
    OpenCodeLspStatus,
    OpenCodeMcpStatus,
    OpenCodePath,
    OpenCodeSession,
} from "../../services/opencode/opencode.client.js";
import { OPENCODE_TBOT_VERSION } from "../../app/package-info.js";
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
    connectivityLabel: string;
    currentProjectLabel: string;
    currentSessionLabel: string;
    defaultSessionValue: string;
    detailsLabel: string;
    errorStatus: string;
    lspTitle: string;
    mcpFailedStatus: string;
    mcpNotesLabel: string;
    mcpRegistrationRequiredStatus: string;
    mcpTitle: string;
    noPluginsMessage: string;
    noneStatus: string;
    openCodeVersionLabel: string;
    okLabel: string;
    overviewTitle: string;
    pageTitle: string;
    pluginsTitle: string;
    rootLabel: string;
    statusLabel: string;
    tbotVersionLabel: string;
    voiceRecognitionLabel: string;
    workspaceTitle: string;
}

interface StatusDetailLine {
    codeValue?: boolean;
    label: string;
    value: string;
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
        presentStatusPlainSection(layout.overviewTitle, presentStatusPlainOverviewLines(input, copy, layout)),
        presentStatusPlainSection(layout.workspaceTitle, presentStatusPlainWorkspaceLines(input, copy, layout)),
        presentStatusPlainSection(layout.pluginsTitle, presentStatusPlainPluginLines(input, copy, layout)),
        presentStatusPlainSection(layout.mcpTitle, presentStatusPlainMcpLines(input, copy, layout)),
        presentStatusPlainSection(layout.lspTitle, presentStatusPlainLspLines(input, copy, layout)),
    ];

    return presentStatusSections(layout.pageTitle, sections);
}

export function presentStatusMarkdownMessage(input: GetStatusResult, copy: BotCopy = BOT_COPY): string {
    const layout = getStatusLayoutCopy(copy);
    const sections = [
        presentStatusMarkdownSection(layout.overviewTitle, presentStatusMarkdownOverviewLines(input, copy, layout)),
        presentStatusMarkdownSection(layout.workspaceTitle, presentStatusMarkdownWorkspaceLines(input, copy, layout)),
        presentStatusMarkdownSection(layout.pluginsTitle, presentStatusMarkdownPluginLines(input, copy, layout)),
        presentStatusMarkdownSection(layout.mcpTitle, presentStatusMarkdownMcpLines(input, copy, layout)),
        presentStatusMarkdownSection(layout.lspTitle, presentStatusMarkdownLspLines(input, copy, layout)),
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

function presentStatusPlainOverviewLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    const lines = [
        presentPlainStatusBullet(
            layout.connectivityLabel,
            input.health.status === "error"
                ? layout.errorStatus
                : formatHealthBadge(input.health.data.healthy, layout),
        ),
        presentPlainStatusBullet(
            layout.voiceRecognitionLabel,
            formatVoiceRecognitionBadge(input.voiceRecognition.enabled),
        ),
    ];

    if (input.health.status === "error") {
        return [
            ...lines,
            ...presentStatusPlainErrorDetailLines(input.health.error, copy, layout),
            presentPlainStatusBullet(layout.tbotVersionLabel, OPENCODE_TBOT_VERSION),
        ];
    }

    return [
        ...lines,
        presentPlainStatusBullet(layout.openCodeVersionLabel, input.health.data.version),
        presentPlainStatusBullet(layout.tbotVersionLabel, OPENCODE_TBOT_VERSION),
    ];
}

function presentStatusMarkdownOverviewLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    const lines = [
        presentMarkdownStatusBullet(
            layout.connectivityLabel,
            input.health.status === "error"
                ? layout.errorStatus
                : formatHealthBadge(input.health.data.healthy, layout),
        ),
        presentMarkdownStatusBullet(
            layout.voiceRecognitionLabel,
            formatVoiceRecognitionBadge(input.voiceRecognition.enabled),
        ),
    ];

    if (input.health.status === "error") {
        return [
            ...lines,
            ...presentStatusMarkdownErrorDetailLines(input.health.error, copy, layout),
            presentMarkdownStatusBullet(layout.tbotVersionLabel, OPENCODE_TBOT_VERSION),
        ];
    }

    return [
        ...lines,
        presentMarkdownStatusBullet(layout.openCodeVersionLabel, input.health.data.version),
        presentMarkdownStatusBullet(layout.tbotVersionLabel, OPENCODE_TBOT_VERSION),
    ];
}

function presentStatusPlainWorkspaceLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    if (input.workspace.status === "error") {
        return presentStatusPlainErrorLines(input.workspace.error, copy, layout);
    }

    return [
        presentPlainStatusBullet(layout.currentProjectLabel, input.workspace.data.currentProject),
        presentPlainStatusBullet(layout.currentSessionLabel, input.workspace.data.currentSession ?? layout.defaultSessionValue),
    ];
}

function presentStatusMarkdownWorkspaceLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    if (input.workspace.status === "error") {
        return presentStatusMarkdownErrorLines(input.workspace.error, copy, layout);
    }

    return [
        presentMarkdownStatusBullet(layout.currentProjectLabel, input.workspace.data.currentProject, {
            codeValue: true,
        }),
        presentMarkdownStatusBullet(layout.currentSessionLabel, input.workspace.data.currentSession ?? layout.defaultSessionValue),
    ];
}

function presentStatusPlainPluginLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    if (input.plugins.status === "error") {
        return presentStatusPlainErrorLines(input.plugins.error, copy, layout);
    }

    if (input.plugins.data.plugins.length === 0) {
        return [
            ...presentPlainEmptyStatusLines(layout.noPluginsMessage, layout),
        ];
    }

    return input.plugins.data.plugins.map((plugin) => `- ${plugin}`);
}

function presentStatusMarkdownPluginLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    if (input.plugins.status === "error") {
        return presentStatusMarkdownErrorLines(input.plugins.error, copy, layout);
    }

    if (input.plugins.data.plugins.length === 0) {
        return [
            ...presentMarkdownEmptyStatusLines(layout.noPluginsMessage, layout),
        ];
    }

    return input.plugins.data.plugins.map((plugin) => `- \`${plugin}\``);
}

function presentStatusPlainLspLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    if (input.lsp.status === "error") {
        return presentStatusPlainErrorLines(input.lsp.error, copy, layout);
    }

    if (input.lsp.data.statuses.length === 0) {
        return presentPlainEmptyStatusLines(copy.lsp.none, layout);
    }

    return input.lsp.data.statuses.flatMap((status) => presentPlainStatusGroup(status.name, [
        {
            label: layout.statusLabel,
            value: formatLspStatusBadge(status),
        },
        {
            codeValue: !!status.root,
            label: layout.rootLabel,
            value: status.root || "-",
        },
    ]));
}

function presentStatusMarkdownLspLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    if (input.lsp.status === "error") {
        return presentStatusMarkdownErrorLines(input.lsp.error, copy, layout);
    }

    if (input.lsp.data.statuses.length === 0) {
        return presentMarkdownEmptyStatusLines(copy.lsp.none, layout);
    }

    return input.lsp.data.statuses.flatMap((status) => presentMarkdownStatusGroup(status.name, [
        {
            label: layout.statusLabel,
            value: formatLspStatusBadge(status),
        },
        {
            codeValue: !!status.root,
            label: layout.rootLabel,
            value: status.root || "-",
        },
    ]));
}

function presentStatusPlainMcpLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    if (input.mcp.status === "error") {
        return presentStatusPlainErrorLines(input.mcp.error, copy, layout);
    }

    if (input.mcp.data.statuses.length === 0) {
        return presentPlainEmptyStatusLines(copy.mcp.none, layout);
    }

    return input.mcp.data.statuses.flatMap(({ name, status }) =>
        presentPlainStatusGroup(name, getMcpStatusDetailLines(status, copy, layout)),
    );
}

function presentStatusMarkdownMcpLines(input: GetStatusResult, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    if (input.mcp.status === "error") {
        return presentStatusMarkdownErrorLines(input.mcp.error, copy, layout);
    }

    if (input.mcp.data.statuses.length === 0) {
        return presentMarkdownEmptyStatusLines(copy.mcp.none, layout);
    }

    return input.mcp.data.statuses.flatMap(({ name, status }) =>
        presentMarkdownStatusGroup(name, getMcpStatusDetailLines(status, copy, layout), {
            codeName: true,
        }),
    );
}

function presentStatusPlainErrorLines(error: unknown, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    return [
        presentPlainStatusBullet(layout.statusLabel, layout.errorStatus),
        ...presentStatusPlainErrorDetailLines(error, copy, layout),
    ];
}

function presentStatusPlainErrorDetailLines(error: unknown, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    const detailLines = splitStatusLines(presentError(error, copy));

    return detailLines.map((line) => presentPlainStatusBullet(layout.detailsLabel, line));
}

function presentStatusMarkdownErrorLines(error: unknown, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    return [
        presentMarkdownStatusBullet(layout.statusLabel, layout.errorStatus),
        ...presentStatusMarkdownErrorDetailLines(error, copy, layout),
    ];
}

function presentStatusMarkdownErrorDetailLines(error: unknown, copy: BotCopy, layout: StatusLayoutCopy): string[] {
    const detailLines = splitStatusLines(presentError(error, copy));

    return detailLines.map((line) => presentMarkdownStatusBullet(layout.detailsLabel, line));
}

function presentPlainEmptyStatusLines(message: string, layout: StatusLayoutCopy): string[] {
    return [
        presentPlainStatusBullet(layout.statusLabel, layout.noneStatus),
        presentPlainStatusBullet(layout.detailsLabel, message),
    ];
}

function presentMarkdownEmptyStatusLines(message: string, layout: StatusLayoutCopy): string[] {
    return [
        presentMarkdownStatusBullet(layout.statusLabel, layout.noneStatus),
        presentMarkdownStatusBullet(layout.detailsLabel, message),
    ];
}

function presentPlainStatusGroup(name: string, details: StatusDetailLine[]): string[] {
    return [
        `- ${normalizeStatusInlineValue(name)}`,
        ...details.map((detail) => `  - ${detail.label}: ${formatStatusValue(detail.value)}`),
    ];
}

function presentMarkdownStatusGroup(
    name: string,
    details: StatusDetailLine[],
    options: {
        codeName?: boolean;
    } = {},
): string[] {
    const renderedName = options.codeName
        ? `\`${normalizeStatusInlineValue(name)}\``
        : `**${normalizeStatusInlineValue(name)}**`;

    return [
        `- ${renderedName}`,
        ...details.map((detail) => detail.codeValue
            ? `  - **${detail.label}:** \`${formatStatusValue(detail.value)}\``
            : `  - **${detail.label}:** ${formatStatusValue(detail.value)}`),
    ];
}

function presentPlainStatusBullet(label: string, value: string): string {
    return `- ${label}: ${formatStatusValue(value)}`;
}

function presentMarkdownStatusBullet(
    label: string,
    value: string,
    options: {
        codeValue?: boolean;
    } = {},
): string {
    return options.codeValue
        ? `- **${label}:** \`${formatStatusValue(value)}\``
        : `- **${label}:** ${formatStatusValue(value)}`;
}

function splitStatusLines(text: string): string[] {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

function formatHealthBadge(healthy: boolean, layout: StatusLayoutCopy): string {
    return healthy ? "\uD83D\uDFE2" : layout.errorStatus;
}

function formatVoiceRecognitionBadge(enabled: boolean): string {
    return enabled ? "\uD83D\uDFE2" : "\u26AA";
}

function formatLspStatusBadge(status: OpenCodeLspStatus): string {
    switch (status.status) {
        case "connected":
            return "\uD83D\uDFE2";
        case "error":
            return "\uD83D\uDD34";
    }

    const exhaustiveStatus: never = status.status;

    return exhaustiveStatus;
}

function formatMcpStatusBadge(status: OpenCodeMcpStatus, layout: StatusLayoutCopy): string {
    switch (status.status) {
        case "connected":
            return "\uD83D\uDFE2";
        case "disabled":
            return "\u26AA";
        case "needs_auth":
            return "\uD83D\uDFE1";
        case "failed":
            return layout.mcpFailedStatus;
        case "needs_client_registration":
            return layout.mcpRegistrationRequiredStatus;
    }

    const exhaustiveStatus: never = status;

    return exhaustiveStatus;
}

function getMcpStatusDetailLines(
    status: OpenCodeMcpStatus,
    copy: BotCopy,
    layout: StatusLayoutCopy,
): StatusDetailLine[] {
    const notes = formatMcpStatusNotes(status, copy, layout);

    return notes
        ? [
            {
                label: layout.statusLabel,
                value: formatMcpStatusBadge(status, layout),
            },
            {
                label: layout.mcpNotesLabel,
                value: notes,
            },
        ]
        : [
            {
                label: layout.statusLabel,
                value: formatMcpStatusBadge(status, layout),
            },
        ];
}

function formatMcpStatusNotes(status: OpenCodeMcpStatus, copy: BotCopy, layout: StatusLayoutCopy): string | null {
    switch (status.status) {
        case "connected":
            return layout.okLabel;
        case "disabled":
            return null;
        case "needs_auth":
            return copy.mcp.needsAuth;
        case "failed":
            return status.error;
        case "needs_client_registration":
            return status.error;
    }

    const exhaustiveStatus: never = status;

    return exhaustiveStatus;
}

function formatStatusValue(value: string): string {
    const normalized = value
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join(" / ");

    return normalized.length > 0 ? normalized : "-";
}

function normalizeStatusInlineValue(value: string): string {
    return formatStatusValue(value);
}

function getStatusLayoutCopy(copy: BotCopy): StatusLayoutCopy {
    const isEnglish = copy.systemStatus.title === BOT_COPY.systemStatus.title;

    if (isEnglish) {
        return {
            connectivityLabel: "Connectivity",
            currentProjectLabel: "Current Project",
            currentSessionLabel: "Current Session",
            defaultSessionValue: "OpenCode Default",
            detailsLabel: "Details",
            errorStatus: "\uD83D\uDD34",
            lspTitle: "\uD83E\uDDE0 LSP",
            mcpFailedStatus: "\uD83D\uDD34",
            mcpNotesLabel: "Notes",
            mcpRegistrationRequiredStatus: "\uD83D\uDFE1",
            mcpTitle: "\uD83D\uDD0C MCP",
            noPluginsMessage: "No plugins configured in the OpenCode config.",
            noneStatus: "\u26AA",
            openCodeVersionLabel: "OpenCode Version",
            okLabel: "OK",
            overviewTitle: "\uD83D\uDDA5\uFE0F Overview",
            pageTitle: "\uD83D\uDCCA Service Status",
            pluginsTitle: "\uD83E\uDDE9 Plugins",
            rootLabel: "Root",
            statusLabel: "Status",
            tbotVersionLabel: "opencode-tbot Version",
            voiceRecognitionLabel: "Voice Recognition",
            workspaceTitle: "\uD83D\uDCC1 Workspace",
        };
    }

    return {
        connectivityLabel: "\u8FDE\u901A\u6027",
        currentProjectLabel: "\u5F53\u524D\u9879\u76EE",
        currentSessionLabel: "\u5F53\u524D\u4F1A\u8BDD",
        defaultSessionValue: "OpenCode \u9ED8\u8BA4",
        detailsLabel: "\u8BE6\u60C5",
        errorStatus: "\uD83D\uDD34",
        lspTitle: "\uD83E\uDDE0 LSP",
        mcpFailedStatus: "\uD83D\uDD34",
        mcpNotesLabel: "\u8BF4\u660E",
        mcpRegistrationRequiredStatus: "\uD83D\uDFE1",
        mcpTitle: "\uD83D\uDD0C MCP",
        noPluginsMessage: "\u5F53\u524D OpenCode \u914D\u7F6E\u4E2D\u672A\u914D\u7F6E\u63D2\u4EF6\u3002",
        noneStatus: "\u26AA",
        openCodeVersionLabel: "OpenCode\u7248\u672C",
        okLabel: "\u6B63\u5E38",
        overviewTitle: "\uD83D\uDDA5\uFE0F \u6982\u89C8",
        pageTitle: "\uD83D\uDCCA \u670D\u52A1\u72B6\u6001",
        pluginsTitle: "\uD83E\uDDE9 \u63D2\u4EF6",
        rootLabel: "\u6839\u76EE\u5F55",
        statusLabel: "\u72B6\u6001",
        tbotVersionLabel: "opencode-tbot\u7248\u672C",
        voiceRecognitionLabel: "\u8BED\u97F3\u8BC6\u522B",
        workspaceTitle: "\uD83D\uDCC1 \u5DE5\u4F5C\u533A",
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
