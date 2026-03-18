import type {
    OpenCodeAgent,
    OpenCodeConfiguredModel,
    OpenCodeHealth,
    OpenCodePath,
    OpenCodeProject,
    OpenCodeSession,
} from "../../services/opencode/opencode.client.js";
import {
    BOT_COPY,
    getLanguageLabel,
    type BotCopy,
    type BotLanguage,
} from "../copy.js";
import {
    getAgentsPage,
    getModelsPage,
    getProjectsPage,
    getSessionsPage,
} from "./keyboard.presenter.js";

interface ProjectsMessageInput {
    currentDirectory: string | null;
    currentProjectId: string | null;
    page: number;
    projects: OpenCodeProject[];
}

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

const VARIANT_ORDER = ["minimal", "none", "low", "medium", "high", "xhigh", "max"];
export function presentHealthMessage(health: OpenCodeHealth, copy: BotCopy = BOT_COPY): string {
    return [
        copy.health.title,
        copy.health.status(health.healthy),
        copy.health.version(health.version),
    ].join("\n");
}

export function presentPathMessage(path: OpenCodePath, copy: BotCopy = BOT_COPY): string {
    return [
        copy.path.title,
        copy.path.home(path.home),
        copy.path.state(path.state),
        copy.path.config(path.config),
        copy.path.worktree(path.worktree),
        copy.path.directory(path.directory),
    ].join("\n");
}

export function presentProjectsMessage(input: ProjectsMessageInput, copy: BotCopy = BOT_COPY): string {
    if (input.projects.length === 0) {
        return copy.projects.none;
    }

    const page = getProjectsPage(input.projects, input.page);
    const currentProject = input.projects.find((project) => project.id === input.currentProjectId);
    const currentDirectory = currentProject?.worktree ?? input.currentDirectory ?? copy.common.notSelected;
    const lines = [
        copy.projects.title,
        copy.projects.current(currentDirectory),
        copy.common.page(page.page + 1, page.totalPages),
        "",
        ...page.items.map((project, index) => `${page.startIndex + index + 1}. ${project.worktree}`),
    ];

    return lines.join("\n");
}

export function presentProjectSwitchMessage(worktree: string, copy: BotCopy = BOT_COPY): string {
    return [
        copy.projects.switched,
        copy.projects.current(worktree),
    ].join("\n");
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
