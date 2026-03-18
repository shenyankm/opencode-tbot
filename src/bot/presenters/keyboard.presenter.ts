import { InlineKeyboard } from "grammy";
import type {
    OpenCodeAgent,
    OpenCodeConfiguredModel,
    OpenCodeProject,
} from "../../services/opencode/opencode.client.js";

export const PROJECTS_PAGE_SIZE = 10;
export const MODELS_PAGE_SIZE = 10;
export const AGENTS_PAGE_SIZE = 10;
const NUMBERED_BUTTONS_PER_ROW = 5;

export interface ProjectsPage {
    items: OpenCodeProject[];
    page: number;
    startIndex: number;
    totalPages: number;
}

export interface ModelsPage {
    items: OpenCodeConfiguredModel[];
    page: number;
    startIndex: number;
    totalPages: number;
}

export interface AgentsPage {
    items: OpenCodeAgent[];
    page: number;
    startIndex: number;
    totalPages: number;
}

export function buildProjectsKeyboard(projects: OpenCodeProject[], requestedPage: number) {
    const page = getProjectsPage(projects, requestedPage);
    const keyboard = buildNumberedKeyboard(
        page.items,
        page.startIndex,
        (project) => `projects:select:${project.id}`,
    );

    appendPaginationButtons(keyboard, page.page, page.totalPages, "projects:page");

    return { keyboard, page };
}

export function buildModelsKeyboard(models: OpenCodeConfiguredModel[], requestedPage: number) {
    const page = getModelsPage(models, requestedPage);
    const keyboard = buildNumberedKeyboard(
        page.items,
        page.startIndex,
        (_, index) => `model:pick:${page.startIndex + index + 1}`,
    );

    appendPaginationButtons(keyboard, page.page, page.totalPages, "model:page");

    return { keyboard, page };
}

export function buildAgentsKeyboard(agents: OpenCodeAgent[], requestedPage: number) {
    const page = getAgentsPage(agents, requestedPage);
    const keyboard = buildNumberedKeyboard(
        page.items,
        page.startIndex,
        (_, index) => `agents:select:${page.startIndex + index + 1}`,
    );

    appendPaginationButtons(keyboard, page.page, page.totalPages, "agents:page");

    return { keyboard, page };
}

export function buildModelVariantsKeyboard(variants: string[], modelIndex: number) {
    return buildNumberedKeyboard(
        variants,
        0,
        (_, index) => `model:variant:${modelIndex}:${index + 1}`,
    );
}

export function getProjectsPage(projects: OpenCodeProject[], requestedPage: number): ProjectsPage {
    return getPagedItems(projects, requestedPage, PROJECTS_PAGE_SIZE);
}

export function getModelsPage(models: OpenCodeConfiguredModel[], requestedPage: number): ModelsPage {
    return getPagedItems(models, requestedPage, MODELS_PAGE_SIZE);
}

export function getAgentsPage(agents: OpenCodeAgent[], requestedPage: number): AgentsPage {
    return getPagedItems(agents, requestedPage, AGENTS_PAGE_SIZE);
}

function buildNumberedKeyboard<T>(
    items: T[],
    startIndex: number,
    buildCallbackData: (item: T, index: number) => string,
) {
    const keyboard = new InlineKeyboard();

    items.forEach((item, index) => {
        const displayIndex = startIndex + index + 1;

        keyboard.text(`${displayIndex}`, buildCallbackData(item, index));

        if ((index + 1) % NUMBERED_BUTTONS_PER_ROW === 0 || index === items.length - 1) {
            keyboard.row();
        }
    });

    return keyboard;
}

function appendPaginationButtons(
    keyboard: InlineKeyboard,
    page: number,
    totalPages: number,
    prefix: "agents:page" | "projects:page" | "model:page",
) {
    if (totalPages <= 1) {
        return;
    }

    if (page > 0) {
        keyboard.text("上一页", `${prefix}:${page - 1}`);
    }

    if (page < totalPages - 1) {
        keyboard.text("下一页", `${prefix}:${page + 1}`);
    }
}

function getPagedItems<T>(items: T[], requestedPage: number, pageSize: number) {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const page = clampPage(requestedPage, totalPages);
    const startIndex = page * pageSize;

    return {
        items: items.slice(startIndex, startIndex + pageSize),
        page,
        startIndex,
        totalPages,
    };
}

function clampPage(page: number, totalPages: number): number {
    if (!Number.isInteger(page) || page < 0) {
        return 0;
    }

    return Math.min(page, totalPages - 1);
}
