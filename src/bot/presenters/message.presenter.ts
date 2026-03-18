import type {
    OpenCodeAgent,
    OpenCodeConfiguredModel,
    OpenCodeHealth,
    OpenCodeProject,
} from "../../services/opencode/opencode.client.js";
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

export function presentHealthMessage(health: OpenCodeHealth): string {
    return [
        "服务器健康状态",
        `状态：${health.healthy ? "healthy" : "unhealthy"}`,
        `版本：${health.version}`,
    ].join("\n");
}

export function presentProjectsMessage(input: ProjectsMessageInput): string {
    if (input.projects.length === 0) {
        return "暂无可用项目。";
    }

    const page = getProjectsPage(input.projects, input.page);
    const currentProject = input.projects.find((project) => project.id === input.currentProjectId);
    const currentDirectory = currentProject?.worktree ?? input.currentDirectory ?? "未选择";
    const lines = [
        "项目列表",
        `当前项目：${currentDirectory}`,
        `第 ${page.page + 1}/${page.totalPages} 页`,
        "",
        ...page.items.map((project, index) => `${page.startIndex + index + 1}. ${project.worktree}`),
    ];

    return lines.join("\n");
}

export function presentProjectSwitchMessage(worktree: string): string {
    return [
        "已切换项目。",
        `当前项目：${worktree}`,
    ].join("\n");
}

export function presentAgentsMessage(input: AgentsMessageInput): string {
    if (input.agents.length === 0) {
        return "暂无可用代理。";
    }

    const page = getAgentsPage(input.agents, input.page);
    const currentAgent = input.currentAgentName
        ? input.agents.find((agent) => agent.name === input.currentAgentName) ?? null
        : null;
    const lines = [
        "代理列表",
        `当前代理：${currentAgent ? formatAgentLabel(currentAgent) : "未选择（使用 OpenCode 默认）"}`,
        `第 ${page.page + 1}/${page.totalPages} 页`,
        "",
        ...page.items.map((agent, index) => `${page.startIndex + index + 1}. ${formatAgentLabel(agent)}`),
    ];

    return lines.join("\n");
}

export function presentAgentSwitchMessage(agent: OpenCodeAgent): string {
    return [
        "已切换代理。",
        `当前代理：${formatAgentLabel(agent)}`,
    ].join("\n");
}

export function presentModelsMessage(input: ModelsMessageInput): string {
    if (input.models.length === 0) {
        return "暂无已配置模型。";
    }

    const page = getModelsPage(input.models, input.page);
    const currentModel = input.currentModelId && input.currentModelProviderId
        ? input.models.find((model) =>
            model.id === input.currentModelId && model.providerID === input.currentModelProviderId,
        ) ?? null
        : null;
    const currentModelLine = currentModel
        ? formatModelSelection(currentModel, input.currentModelVariant)
        : "未选择（使用 OpenCode 默认）";
    const lines = [
        "模型列表",
        "仅显示 OpenCode 当前已配置的模型。",
        `当前模型：${currentModelLine}`,
        `第 ${page.page + 1}/${page.totalPages} 页`,
        "",
        ...page.items.map((model, index) => formatModelListLine(model, page.startIndex + index + 1)),
    ];

    return lines.join("\n");
}

export function presentModelVariantsMessage(model: OpenCodeConfiguredModel, modelIndex: number): string {
    const variants = getModelVariants(model);

    if (variants.length === 0) {
        return [
            "该模型没有可选推理强度。",
            `模型：${formatModelLabel(model)}`,
        ].join("\n");
    }

    const lines = [
        "推理强度列表",
        `模型：${formatModelLabel(model)}`,
        `模型编号：${modelIndex}`,
        "",
        ...variants.map((variant, index) => `${index + 1}. ${variant}`),
    ];

    return lines.join("\n");
}

export function presentModelSwitchMessage(model: OpenCodeConfiguredModel, variant: string | null): string {
    return [
        "已切换模型。",
        `当前模型：${formatModelLabel(model)}`,
        `当前强度：${variant ?? "默认"}`,
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
    return `${formatModelLabel(model)} | 强度：${variant ?? "默认"}`;
}

function formatModelLabel(model: OpenCodeConfiguredModel): string {
    return `${model.providerName} / ${model.name}`;
}
