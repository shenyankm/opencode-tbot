import type { OpenCodeProject } from "../../services/opencode/opencode.client.js";
import { getProjectsPage } from "./keyboard.presenter.js";

interface ProjectsMessageInput {
    currentDirectory: string | null;
    currentProjectId: string | null;
    page: number;
    projects: OpenCodeProject[];
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
