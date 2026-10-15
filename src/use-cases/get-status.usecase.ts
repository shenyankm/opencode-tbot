import { isAbsolute, win32 } from "node:path";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type {
    OpenCodeHealth,
    OpenCodePath,
    OpenCodeSession,
} from "../services/opencode/opencode.client.js";
import type { OpenCodeConfiguredPluginCatalog } from "../services/opencode/opencode.ports.js";
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

export interface GetStatusInput {
    chatId: number;
}

export interface StatusSectionLoadContext {
    chatId: number;
    resolve<TKey extends keyof GetStatusResult>(key: TKey): Promise<GetStatusResult[TKey]>;
}

export interface StatusSectionProvider<TKey extends keyof GetStatusResult = keyof GetStatusResult> {
    key: TKey;
    load(context: StatusSectionLoadContext): Promise<GetStatusResult[TKey]>;
}

export type StatusSectionProviders = {
    [TKey in keyof GetStatusResult]: StatusSectionProvider<TKey>;
};

export interface CreateStatusSectionProvidersInput {
    configuredPluginReader: OpenCodeConfiguredPluginCatalog;
    getHealthUseCase: GetHealthUseCase;
    getPathUseCase: GetPathUseCase;
    listLspUseCase: ListLspUseCase;
    listMcpUseCase: ListMcpUseCase;
    listSessionsUseCase: ListSessionsUseCase;
    sessionRepo: SessionRepository;
}

const STATUS_SECTION_KEYS: Array<keyof GetStatusResult> = [
    "health",
    "path",
    "plugins",
    "workspace",
    "lsp",
    "mcp",
];

export class GetStatusUseCase {
    constructor(private readonly providers: StatusSectionProviders) { }

    async execute(input: GetStatusInput): Promise<GetStatusResult> {
        const sectionPromises = new Map<
            keyof GetStatusResult,
            Promise<GetStatusResult[keyof GetStatusResult]>
        >();
        const resolveSection = <TKey extends keyof GetStatusResult>(
            key: TKey,
        ): Promise<GetStatusResult[TKey]> => {
            const existingSectionPromise = sectionPromises.get(key);

            if (existingSectionPromise) {
                return existingSectionPromise as Promise<GetStatusResult[TKey]>;
            }

            const nextSectionPromise = this.providers[key].load(context);

            sectionPromises.set(
                key,
                nextSectionPromise as Promise<GetStatusResult[keyof GetStatusResult]>,
            );

            return nextSectionPromise;
        };
        const context: StatusSectionLoadContext = {
            chatId: input.chatId,
            resolve: resolveSection,
        };

        await Promise.all(STATUS_SECTION_KEYS.map((key) => resolveSection(key)));

        return {
            health: await resolveSection("health"),
            path: await resolveSection("path"),
            plugins: await resolveSection("plugins"),
            workspace: await resolveSection("workspace"),
            lsp: await resolveSection("lsp"),
            mcp: await resolveSection("mcp"),
        };
    }
}

export function createStatusSectionProviders(
    input: CreateStatusSectionProvidersInput,
): StatusSectionProviders {
    return {
        health: {
            key: "health",
            async load() {
                return loadStatusSection(async () => input.getHealthUseCase.execute());
            },
        },
        path: {
            key: "path",
            async load() {
                return loadStatusSection(async () => input.getPathUseCase.execute());
            },
        },
        plugins: {
            key: "plugins",
            async load(context) {
                const path = await context.resolve("path");

                if (path.status === "error") {
                    return {
                        error: path.error,
                        status: "error",
                    };
                }

                return loadStatusSection(async () => ({
                    plugins: normalizeConfiguredPluginLabels(
                        await input.configuredPluginReader.listConfiguredPlugins(),
                    ),
                }));
            },
        },
        workspace: {
            key: "workspace",
            async load(context) {
                const path = await context.resolve("path");

                if (path.status === "error") {
                    return {
                        error: path.error,
                        status: "error",
                    };
                }

                const binding = await input.sessionRepo.getByChatId(context.chatId);
                let currentProject = resolveWorkspaceProjectPath(path.data);
                let currentSession = binding?.sessionId ?? null;

                try {
                    const sessions = await input.listSessionsUseCase.execute({ chatId: context.chatId });

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
            },
        },
        lsp: {
            key: "lsp",
            async load(context) {
                return loadStatusSection(async () =>
                    input.listLspUseCase.execute({ chatId: context.chatId })
                );
            },
        },
        mcp: {
            key: "mcp",
            async load(context) {
                return loadStatusSection(async () =>
                    input.listMcpUseCase.execute({ chatId: context.chatId })
                );
            },
        },
    };
}

async function loadStatusSection<TData>(
    load: () => Promise<TData>,
): Promise<StatusSectionResult<TData>> {
    try {
        return {
            data: await load(),
            status: "ok",
        };
    } catch (error) {
        return {
            error,
            status: "error",
        };
    }
}

function formatSessionStatusLabel(session: OpenCodeSession | null, fallbackId: string): string {
    if (!session) {
        return fallbackId;
    }

    const title = session.title.trim() || session.id;

    return title === session.id
        ? title
        : `${title} (${session.id})`;
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
        && (isAbsolute(normalized) || win32.isAbsolute(normalized));
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
    return plugin.trim();
}
