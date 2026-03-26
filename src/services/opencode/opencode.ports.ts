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
    listAgents(): Promise<OpenCodeAgent[]>;
}

export interface OpenCodeConfiguredPluginCatalog {
    listConfiguredPlugins(): Promise<string[]>;
}

export interface OpenCodeCurrentProjectReader {
    getCurrentProject(): Promise<OpenCodeProject>;
}

export interface OpenCodeHealthReader {
    getHealth(): Promise<OpenCodeHealth>;
}

export interface OpenCodeLspCatalog {
    listLspStatuses(directory?: string): Promise<OpenCodeLspStatus[]>;
}

export interface OpenCodeMcpCatalog {
    listMcpStatuses(directory?: string): Promise<Record<string, OpenCodeMcpStatus>>;
}

export interface OpenCodeModelCatalog {
    listModels(): Promise<OpenCodeConfiguredModel[]>;
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
    listProjects(): Promise<OpenCodeProject[]>;
}

export interface OpenCodePromptExecutor {
    promptSession(input: PromptSessionInput): Promise<PromptSessionResult>;
}

export interface OpenCodeSessionCatalog {
    getSessionStatuses(): Promise<Record<string, OpenCodeSessionStatus>>;
    listSessions(): Promise<OpenCodeSession[]>;
}

export interface OpenCodeSessionManager {
    abortSession(sessionId: string): Promise<boolean>;
    createSessionForDirectory(directory: string, title?: string): Promise<OpenCodeSession>;
    deleteSession(sessionId: string): Promise<boolean>;
    forkSession(sessionId: string, messageId?: string): Promise<OpenCodeSession>;
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
