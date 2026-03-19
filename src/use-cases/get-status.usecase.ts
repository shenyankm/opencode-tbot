import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
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
    configFilePath: string;
    plugins: string[];
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
    ) { }

    async execute(input: { chatId: number }): Promise<GetStatusResult> {
        const [health, path, lsp, mcp] = await Promise.allSettled([
            this.getHealthUseCase.execute(),
            this.getPathUseCase.execute(),
            this.listLspUseCase.execute({ chatId: input.chatId }),
            this.listMcpUseCase.execute({ chatId: input.chatId }),
        ]);
        const pathResult = mapSettledResult(path);
        const [plugins, workspace] = await Promise.all([
            loadConfiguredPluginsResult(pathResult),
            loadWorkspaceStatusResult(
                input.chatId,
                pathResult,
                this.listSessionsUseCase,
                this.sessionRepo,
            ),
        ]);

        return {
            health: mapSettledResult(health),
            path: pathResult,
            plugins,
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

async function loadConfiguredPluginsResult(
    path: StatusSectionResult<OpenCodePath>,
): Promise<StatusSectionResult<ConfiguredPluginsResult>> {
    if (path.status === "error") {
        return {
            error: path.error,
            status: "error",
        };
    }

    try {
        return {
            data: await loadConfiguredPlugins(path.data.config),
            status: "ok",
        };
    } catch (error) {
        return {
            error,
            status: "error",
        };
    }
}

async function loadConfiguredPlugins(configFilePath: string): Promise<ConfiguredPluginsResult> {
    const resolvedConfigFilePath = await resolveOpenCodeConfigFilePath(configFilePath);
    let content: string;

    try {
        content = await readFile(resolvedConfigFilePath, "utf8");
    } catch (error) {
        if (isMissingFileError(error)) {
            return {
                configFilePath: resolvedConfigFilePath,
                plugins: [],
            };
        }

        throw error;
    }

    const parseErrors: ParseError[] = [];
    const parsed = parse(content, parseErrors, {
        allowTrailingComma: true,
    });

    if (parseErrors.length > 0) {
        const errorSummary = parseErrors
            .map((error) => printParseErrorCode(error.error))
            .join(", ");

        throw new Error(`Failed to parse ${resolvedConfigFilePath}: ${errorSummary}`);
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {
            configFilePath: resolvedConfigFilePath,
            plugins: [],
        };
    }

    const pluginSpecs = Array.isArray((parsed as { plugin?: unknown }).plugin)
        ? (parsed as { plugin: unknown[] }).plugin
        : [];
    const plugins = [...new Set(
        pluginSpecs
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter((value) => value.length > 0),
    )];

    return {
        configFilePath: resolvedConfigFilePath,
        plugins,
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
    let currentProject = path.data.directory;
    let currentSession = binding?.sessionId ?? null;

    try {
        const sessions = await listSessionsUseCase.execute({ chatId });

        currentProject = sessions.currentDirectory;
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
        : `${title} [${session.slug}]`;
}

async function resolveOpenCodeConfigFilePath(configPath: string): Promise<string> {
    try {
        const info = await stat(configPath);

        return info.isDirectory()
            ? join(configPath, "opencode.json")
            : configPath;
    } catch (error) {
        if (isMissingFileError(error)) {
            return configPath;
        }

        throw error;
    }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
