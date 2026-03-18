import type {
    OpenCodeAgent,
    OpenCodeConfig,
    OpenCodeConfiguredModel,
    OpenCodeHealth,
    OpenCodePath,
    OpenCodeProject,
} from "../../services/opencode/opencode.client.js";
import { BOT_COPY } from "../copy.js";
import {
    getAgentsPage,
    getModelsPage,
    getProjectsPage,
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

const VARIANT_ORDER = ["minimal", "none", "low", "medium", "high", "xhigh", "max"];
const TELEGRAM_TEXT_SOFT_LIMIT = 3900;

export function presentHealthMessage(health: OpenCodeHealth): string {
    return [
        BOT_COPY.health.title,
        BOT_COPY.health.status(health.healthy),
        BOT_COPY.health.version(health.version),
    ].join("\n");
}

export function presentPathMessage(path: OpenCodePath): string {
    return [
        BOT_COPY.path.title,
        BOT_COPY.path.home(path.home),
        BOT_COPY.path.state(path.state),
        BOT_COPY.path.config(path.config),
        BOT_COPY.path.worktree(path.worktree),
        BOT_COPY.path.directory(path.directory),
    ].join("\n");
}

export function presentConfigMessage(config: OpenCodeConfig): string {
    const content = safePrettyJson(config);
    const maxContentLength = TELEGRAM_TEXT_SOFT_LIMIT - BOT_COPY.config.title.length - 1;
    const body = content.length > maxContentLength
        ? `${content.slice(0, maxContentLength - BOT_COPY.config.truncated.length - 1)}\n${BOT_COPY.config.truncated}`
        : content;

    return [
        BOT_COPY.config.title,
        body,
    ].join("\n");
}

export function presentProjectsMessage(input: ProjectsMessageInput): string {
    if (input.projects.length === 0) {
        return BOT_COPY.projects.none;
    }

    const page = getProjectsPage(input.projects, input.page);
    const currentProject = input.projects.find((project) => project.id === input.currentProjectId);
    const currentDirectory = currentProject?.worktree ?? input.currentDirectory ?? BOT_COPY.common.notSelected;
    const lines = [
        BOT_COPY.projects.title,
        BOT_COPY.projects.current(currentDirectory),
        BOT_COPY.common.page(page.page + 1, page.totalPages),
        "",
        ...page.items.map((project, index) => `${page.startIndex + index + 1}. ${project.worktree}`),
    ];

    return lines.join("\n");
}

export function presentProjectSwitchMessage(worktree: string): string {
    return [
        BOT_COPY.projects.switched,
        BOT_COPY.projects.current(worktree),
    ].join("\n");
}

export function presentAgentsMessage(input: AgentsMessageInput): string {
    if (input.agents.length === 0) {
        return BOT_COPY.agents.none;
    }

    const page = getAgentsPage(input.agents, input.page);
    const currentAgent = input.currentAgentName
        ? input.agents.find((agent) => agent.name === input.currentAgentName) ?? null
        : null;
    const lines = [
        BOT_COPY.agents.title,
        BOT_COPY.agents.current(currentAgent ? formatAgentLabel(currentAgent) : BOT_COPY.common.openCodeDefault),
        BOT_COPY.common.page(page.page + 1, page.totalPages),
        "",
        ...page.items.map((agent, index) => `${page.startIndex + index + 1}. ${formatAgentLabel(agent)}`),
    ];

    return lines.join("\n");
}

export function presentAgentSwitchMessage(agent: OpenCodeAgent): string {
    return [
        BOT_COPY.agents.switched,
        BOT_COPY.agents.current(formatAgentLabel(agent)),
    ].join("\n");
}

export function presentModelsMessage(input: ModelsMessageInput): string {
    if (input.models.length === 0) {
        return BOT_COPY.models.none;
    }

    const page = getModelsPage(input.models, input.page);
    const currentModel = input.currentModelId && input.currentModelProviderId
        ? input.models.find((model) =>
            model.id === input.currentModelId && model.providerID === input.currentModelProviderId,
        ) ?? null
        : null;
    const currentModelLine = currentModel
        ? formatModelSelection(currentModel, input.currentModelVariant)
        : BOT_COPY.common.openCodeDefault;
    const lines = [
        BOT_COPY.models.title,
        BOT_COPY.models.configuredOnly,
        BOT_COPY.models.current(currentModelLine),
        BOT_COPY.common.page(page.page + 1, page.totalPages),
        "",
        ...page.items.map((model, index) => formatModelListLine(model, page.startIndex + index + 1)),
    ];

    return lines.join("\n");
}

export function presentModelVariantsMessage(model: OpenCodeConfiguredModel, modelIndex: number): string {
    const variants = getModelVariants(model);

    if (variants.length === 0) {
        return [
            BOT_COPY.models.noReasoningLevels,
            BOT_COPY.models.model(formatModelLabel(model)),
        ].join("\n");
    }

    const lines = [
        BOT_COPY.models.reasoningLevelsTitle,
        BOT_COPY.models.model(formatModelLabel(model)),
        BOT_COPY.models.modelNumber(modelIndex),
        "",
        ...variants.map((variant, index) => `${index + 1}. ${variant}`),
    ];

    return lines.join("\n");
}

export function presentModelSwitchMessage(model: OpenCodeConfiguredModel, variant: string | null): string {
    return [
        BOT_COPY.models.switched,
        BOT_COPY.models.current(formatModelLabel(model)),
        BOT_COPY.models.currentReasoningLevel(variant ?? BOT_COPY.models.defaultReasoningLevel),
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

function formatModelSelection(model: OpenCodeConfiguredModel, variant: string | null): string {
    return `${formatModelLabel(model)} | ${BOT_COPY.models.reasoningLevel(variant ?? BOT_COPY.models.defaultReasoningLevel)}`;
}

function formatModelLabel(model: OpenCodeConfiguredModel): string {
    return `${model.providerName} / ${model.name}`;
}

function safePrettyJson(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2) ?? "null";
    } catch {
        return String(value);
    }
}
