import type {
    OpenCodeAgent,
    OpenCodeConfiguredModel,
    OpenCodeHealth,
    OpenCodeLspStatus,
    OpenCodeMcpStatus,
    OpenCodePath,
    OpenCodeProject,
    OpenCodeSession,
    OpenCodeSessionStatus,
    PromptSessionInput,
    PromptSessionResult,
} from "./opencode.client.js";

export interface OpenCodeAgentCatalog {
    listAgents(signal?: AbortSignal): Promise<OpenCodeAgent[]>;
}

export interface OpenCodeConfiguredPluginCatalog {
    listConfiguredPlugins(): Promise<string[]>;
}

export interface OpenCodeCurrentProjectReader {
    getCurrentProject(signal?: AbortSignal): Promise<OpenCodeProject>;
}

export interface OpenCodeHealthReader {
    getHealth(): Promise<OpenCodeHealth>;
}

export interface OpenCodeLspCatalog {
    listLspStatuses(directory?: string): Promise<OpenCodeLspStatus[] | null>;
}

export interface OpenCodeMcpCatalog {
    listMcpStatuses(directory?: string): Promise<Record<string, OpenCodeMcpStatus>>;
}

export interface OpenCodeModelCatalog {
    listModels(signal?: AbortSignal): Promise<OpenCodeConfiguredModel[]>;
}

export interface OpenCodePathReader {
    getPath(): Promise<OpenCodePath>;
}

export interface OpenCodePermissionResponder {
    replyToPermission(
        sessionId: string,
        requestId: string,
        reply: "always" | "once" | "reject",
    ): Promise<boolean>;
}

export interface OpenCodeProjectCatalog {
    listProjects(signal?: AbortSignal): Promise<OpenCodeProject[]>;
}

export interface OpenCodePromptExecutor {
    promptSession(input: PromptSessionInput): Promise<PromptSessionResult>;
}

export interface OpenCodeSessionCatalog {
    getSession(sessionId: string, signal?: AbortSignal): Promise<OpenCodeSession | null>;
    getSessionStatuses(): Promise<Record<string, OpenCodeSessionStatus>>;
    listSessions(projectId?: string): Promise<OpenCodeSession[]>;
}

export interface OpenCodeSessionManager {
    abortSession(sessionId: string): Promise<boolean>;
    cancelSessionInput(sessionId: string, messageId: string): Promise<void>;
    createSessionForDirectory(directory: string, title?: string, signal?: AbortSignal): Promise<OpenCodeSession>;
    deleteSession(sessionId: string, signal?: AbortSignal): Promise<boolean>;
    forkSession(sessionId: string, messageId?: string, signal?: AbortSignal): Promise<OpenCodeSession>;
    renameSession(sessionId: string, title: string): Promise<OpenCodeSession>;
}

export type OpenCodeAgentGateway = OpenCodeAgentCatalog;
export type OpenCodeModelGateway = OpenCodeModelCatalog;
export type OpenCodeProjectGateway = OpenCodeCurrentProjectReader & OpenCodeProjectCatalog;
export type OpenCodeSessionGateway = OpenCodeCurrentProjectReader & OpenCodeSessionCatalog;
export type OpenCodeMutableSessionGateway = OpenCodeCurrentProjectReader & OpenCodeSessionCatalog & OpenCodeSessionManager;
export type OpenCodePromptGateway =
    & OpenCodeAgentCatalog
    & OpenCodeCurrentProjectReader
    & OpenCodeModelCatalog
    & OpenCodeProjectCatalog
    & OpenCodePromptExecutor
    & OpenCodeSessionCatalog
    & OpenCodeSessionManager;
