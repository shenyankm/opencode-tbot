import { InlineKeyboard } from "grammy";
import type { OpenCodeProject } from "../../services/opencode/opencode.client.js";

export const PROJECTS_PAGE_SIZE = 10;
const PROJECT_BUTTONS_PER_ROW = 5;

export interface ProjectsPage {
    items: OpenCodeProject[];
    page: number;
    startIndex: number;
    totalPages: number;
}

export function buildProjectsKeyboard(projects: OpenCodeProject[], requestedPage: number) {
    const page = getProjectsPage(projects, requestedPage);
    const keyboard = new InlineKeyboard();

    page.items.forEach((project, index) => {
        const displayIndex = page.startIndex + index + 1;

        keyboard.text(`${displayIndex}`, `projects:select:${project.id}`);

        if ((index + 1) % PROJECT_BUTTONS_PER_ROW === 0 || index === page.items.length - 1) {
            keyboard.row();
        }
    });

    if (page.totalPages > 1) {
        if (page.page > 0) {
            keyboard.text("上一页", `projects:page:${page.page - 1}`);
        }

        if (page.page < page.totalPages - 1) {
            keyboard.text("下一页", `projects:page:${page.page + 1}`);
        }
    }

    return { keyboard, page };
}

export function getProjectsPage(projects: OpenCodeProject[], requestedPage: number): ProjectsPage {
    const totalPages = Math.max(1, Math.ceil(projects.length / PROJECTS_PAGE_SIZE));
    const safePage = clampPage(requestedPage, totalPages);
    const startIndex = safePage * PROJECTS_PAGE_SIZE;

    return {
        items: projects.slice(startIndex, startIndex + PROJECTS_PAGE_SIZE),
        page: safePage,
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
