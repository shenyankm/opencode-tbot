import { isAbsolute } from "node:path";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type {
    OpenCodeHealth,
    OpenCodePath,
    OpenCodeSession,
} from "../services/opencode/opencode.client.js";
import type { GetHealthUseCase } from "./get-health.usecase.js";
import type { GetPathUseCase } from "./get-path.usecase.js";
import type { ListLspResult, ListLspUseCase } from "./list-lsp.usecase.js";
import type { ListMcpResult, ListMcpUseCase } from "./list-mcp.usecase.js";
import type { ListSessionsUseCase } from "./list-sessions.usecase.js";

export interface StatusSectionOk<TData> {
    data: TData;
    status: "ok";
}

export interface StatusSectionError {
    error: unknown;
    status: "error";
}

export type StatusSectionResult<TData> = StatusSectionOk<TData> | StatusSectionError;

export interface ConfiguredPluginsResult {
    plugins: string[];
}

interface ConfiguredPluginReader {
    listConfiguredPlugins(): Promise<string[]>;
}

export interface WorkspaceStatusResult {
    currentProject: string;
    currentSession: string | null;
}

export interface GetStatusResult {
    health: StatusSectionResult<OpenCodeHealth>;
    lsp: StatusSectionResult<ListLspResult>;
    mcp: StatusSectionResult<ListMcpResult>;
    path: StatusSectionResult<OpenCodePath>;
    plugins: StatusSectionResult<ConfiguredPluginsResult>;
    workspace: StatusSectionResult<WorkspaceStatusResult>;
}

export class GetStatusUseCase {
    constructor(
        private readonly getHealthUseCase: GetHealthUseCase,
        private readonly getPathUseCase: GetPathUseCase,
        private readonly listLspUseCase: ListLspUseCase,
        private readonly listMcpUseCase: ListMcpUseCase,
        private readonly listSessionsUseCase: ListSessionsUseCase,
        private readonly sessionRepo: SessionRepository,
        private readonly configuredPluginReader: ConfiguredPluginReader,
    ) { }

    async execute(input: { chatId: number }): Promise<GetStatusResult> {
        const [health, path, lsp, mcp, plugins] = await Promise.allSettled([
            this.getHealthUseCase.execute(),
            this.getPathUseCase.execute(),
            this.listLspUseCase.execute({ chatId: input.chatId }),
            this.listMcpUseCase.execute({ chatId: input.chatId }),
            this.configuredPluginReader.listConfiguredPlugins(),
        ]);
        const pathResult = mapSettledResult(path);
        const pluginResult = loadConfiguredPluginsResult(plugins);
        const workspace = await loadWorkspaceStatusResult(
            input.chatId,
            pathResult,
            this.listSessionsUseCase,
            this.sessionRepo,
        );

        return {
            health: mapSettledResult(health),
            path: pathResult,
            plugins: pluginResult,
            workspace,
            lsp: mapSettledResult(lsp),
            mcp: mapSettledResult(mcp),
        };
    }
}

function mapSettledResult<TData>(result: PromiseSettledResult<TData>): StatusSectionResult<TData> {
    if (result.status === "fulfilled") {
        return {
            data: result.value,
            status: "ok",
        };
    }

    return {
        error: result.reason,
        status: "error",
    };
}

function loadConfiguredPluginsResult(
    result: PromiseSettledResult<string[]>,
): StatusSectionResult<ConfiguredPluginsResult> {
    if (result.status === "rejected") {
        return {
            error: result.reason,
            status: "error",
        };
    }

    return {
        data: {
            plugins: normalizeConfiguredPluginLabels(result.value),
        },
        status: "ok",
    };
}

async function loadWorkspaceStatusResult(
    chatId: number,
    path: StatusSectionResult<OpenCodePath>,
    listSessionsUseCase: ListSessionsUseCase,
    sessionRepo: SessionRepository,
): Promise<StatusSectionResult<WorkspaceStatusResult>> {
    if (path.status === "error") {
        return {
            error: path.error,
            status: "error",
        };
    }

    const binding = await sessionRepo.getByChatId(chatId);
    let currentProject = resolveWorkspaceProjectPath(path.data);
    let currentSession = binding?.sessionId ?? null;

    try {
        const sessions = await listSessionsUseCase.execute({ chatId });

        currentProject = resolveWorkspaceProjectPath(path.data, sessions.currentDirectory);
        currentSession = sessions.currentSessionId
            ? formatSessionStatusLabel(
                sessions.sessions.find((session) => session.id === sessions.currentSessionId) ?? null,
                sessions.currentSessionId,
            )
            : null;
    } catch {
        // Keep path/session binding fallbacks when session listing is unavailable.
    }

    return {
        data: {
            currentProject,
            currentSession,
        },
        status: "ok",
    };
}

function formatSessionStatusLabel(session: OpenCodeSession | null, fallbackId: string): string {
    if (!session) {
        return fallbackId;
    }

    const title = session.title.trim() || session.slug || session.id;

    return title === session.slug
        ? title
        : `${title} (${session.slug})`;
}

function resolveWorkspaceProjectPath(path: OpenCodePath, preferredPath?: string | null): string {
    const candidates = [
        preferredPath,
        path.worktree,
        path.directory,
    ];

    for (const candidate of candidates) {
        if (isUsableWorkspacePath(candidate)) {
            return candidate;
        }
    }

    return preferredPath ?? path.worktree ?? path.directory;
}

function isUsableWorkspacePath(value: string | null | undefined): value is string {
    if (typeof value !== "string") {
        return false;
    }

    const normalized = value.trim();

    return normalized.length > 0
        && normalized !== "/"
        && normalized !== "\\"
        && isAbsolute(normalized);
}

function normalizeConfiguredPluginLabels(plugins: string[]): string[] {
    const normalizedPlugins: string[] = [];
    const seenPlugins = new Set<string>();

    for (const plugin of plugins) {
        const normalizedPlugin = normalizeConfiguredPluginLabel(plugin);

        if (normalizedPlugin.length === 0 || seenPlugins.has(normalizedPlugin)) {
            continue;
        }

        seenPlugins.add(normalizedPlugin);
        normalizedPlugins.push(normalizedPlugin);
    }

    return normalizedPlugins;
}

function normalizeConfiguredPluginLabel(plugin: string): string {
    const normalizedPlugin = plugin.trim();
    const localPluginName = extractLocalPluginName(normalizedPlugin);

    return localPluginName
        ? `${localPluginName} (local plugin)`
        : normalizedPlugin;
}

function extractLocalPluginName(plugin: string): string | null {
    const filePath = parseFilePluginPath(plugin);

    if (!filePath) {
        return null;
    }

    const pathSegments = filePath.split("/").filter((segment) => segment.length > 0);
    const fileName = pathSegments.at(-1);
    const parentDirectoryName = pathSegments.at(-2);

    if (!fileName || parentDirectoryName !== "plugins") {
        return null;
    }

    const pluginName = fileName.replace(/\.(?:[cm]?js|[cm]?ts)$/iu, "");

    return pluginName.trim().length > 0
        ? pluginName.trim()
        : null;
}

function parseFilePluginPath(plugin: string): string | null {
    if (!plugin.startsWith("file://")) {
        return null;
    }

    try {
        const fileUrl = new URL(plugin);

        if (fileUrl.protocol !== "file:") {
            return null;
        }

        const normalizedPath = decodeURIComponent(fileUrl.pathname)
            .replace(/^\/([A-Za-z]:)/u, "$1")
            .replace(/\\/gu, "/");

        return normalizedPath.length > 0
            ? normalizedPath
            : null;
    } catch {
        return null;
    }
}
