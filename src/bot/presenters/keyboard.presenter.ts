import { InlineKeyboard } from "grammy";
import {
    BOT_COPY,
    getLanguageLabel,
    SUPPORTED_BOT_LANGUAGES,
    type BotCopy,
    type BotLanguage,
} from "../copy.js";
import type {
    OpenCodeAgent,
    OpenCodeConfiguredModel,
    OpenCodeSession,
} from "../../services/opencode/opencode.client.js";

export const MODELS_PAGE_SIZE = 10;
export const AGENTS_PAGE_SIZE = 10;
export const SESSIONS_PAGE_SIZE = 10;
const NUMBERED_BUTTONS_PER_ROW = 5;

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

export interface SessionsPage {
    items: OpenCodeSession[];
    page: number;
    startIndex: number;
    totalPages: number;
}

export function buildModelsKeyboard(
    models: OpenCodeConfiguredModel[],
    requestedPage: number,
    copy: BotCopy = BOT_COPY,
) {
    const page = getModelsPage(models, requestedPage);
    const keyboard = buildNumberedKeyboard(
        page.items,
        page.startIndex,
        (_, index) => `model:pick:${page.startIndex + index + 1}`,
    );

    appendPaginationButtons(keyboard, page.page, page.totalPages, "model:page", copy);

    return { keyboard, page };
}

export function buildAgentsKeyboard(
    agents: OpenCodeAgent[],
    requestedPage: number,
    copy: BotCopy = BOT_COPY,
) {
    const page = getAgentsPage(agents, requestedPage);
    const keyboard = buildNumberedKeyboard(
        page.items,
        page.startIndex,
        (_, index) => `agents:select:${page.startIndex + index + 1}`,
    );

    appendPaginationButtons(keyboard, page.page, page.totalPages, "agents:page", copy);

    return { keyboard, page };
}

export function buildSessionsKeyboard(
    sessions: OpenCodeSession[],
    requestedPage: number,
    copy: BotCopy = BOT_COPY,
) {
    const page = getSessionsPage(sessions, requestedPage);
    const keyboard = buildNumberedKeyboard(
        page.items,
        page.startIndex,
        (session) => `sessions:select:${session.id}`,
    );

    appendPaginationButtons(keyboard, page.page, page.totalPages, "sessions:page", copy);

    return { keyboard, page };
}

export function buildModelVariantsKeyboard(variants: string[], modelIndex: number) {
    return buildNumberedKeyboard(
        variants,
        0,
        (_, index) => `model:variant:${modelIndex}:${index + 1}`,
    );
}

export function buildLanguageKeyboard(currentLanguage: BotLanguage, copy: BotCopy = BOT_COPY) {
    const keyboard = new InlineKeyboard();

    SUPPORTED_BOT_LANGUAGES.forEach((language, index) => {
        const label = currentLanguage === language
            ? `[${getLanguageLabel(language, copy)}]`
            : getLanguageLabel(language, copy);

        keyboard.text(label, `language:select:${language}`);

        if (index !== SUPPORTED_BOT_LANGUAGES.length - 1) {
            keyboard.row();
        }
    });

    return keyboard;
}

export function getModelsPage(models: OpenCodeConfiguredModel[], requestedPage: number): ModelsPage {
    return getPagedItems(models, requestedPage, MODELS_PAGE_SIZE);
}

export function getAgentsPage(agents: OpenCodeAgent[], requestedPage: number): AgentsPage {
    return getPagedItems(agents, requestedPage, AGENTS_PAGE_SIZE);
}

export function getSessionsPage(sessions: OpenCodeSession[], requestedPage: number): SessionsPage {
    return getPagedItems(sessions, requestedPage, SESSIONS_PAGE_SIZE);
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
    prefix: "agents:page" | "sessions:page" | "model:page",
    copy: BotCopy,
) {
    if (totalPages <= 1) {
        return;
    }

    if (page > 0) {
        keyboard.text(copy.common.previousPage, `${prefix}:${page - 1}`);
    }

    if (page < totalPages - 1) {
        keyboard.text(copy.common.nextPage, `${prefix}:${page + 1}`);
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
