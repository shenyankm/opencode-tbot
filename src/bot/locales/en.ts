import type { BotCopy } from "../copy.js";

export const EN_BOT_COPY: BotCopy = {
    locale: "en",
    commands: {
        start: "Show welcome and quick start",
        status: "Show system status",
        new: "Create a new session",
        agents: "Show and switch agents",
        sessions: "Show and switch sessions",
        cancel: "Cancel rename or abort running request",
        model: "Show and switch models",
        language: "Show and switch language",
    },
    start: {
        lines: [
            "# Welcome to opencode-tbot",
            "",
            "Talk to your OpenCode server from Telegram.",
            "",
            "## Quick start",
            "1. Run `/status` to confirm the server is ready.",
            "2. Run `/new [title]` to create a fresh session.",
            "",
            "Send a text or image message directly.",
        ],
    },
    systemStatus: {
        title: "System Status",
    },
    common: {
        notSelected: "Not selected",
        openCodeDefault: "Not selected (using OpenCode default)",
        previousPage: "Previous",
        nextPage: "Next",
        page(currentPage: number, totalPages: number) {
            return `Page ${currentPage}/${totalPages}`;
        },
    },
    status: {
        processing: "Processing...",
        thinking: "Thinking",
        thinkingInProgress: "Thinking…",
        expandThinking: "Expand",
        collapseThinking: "Collapse",
        thinkingUnavailable: "This thinking message is no longer available.",
        thinkingToggleFailed: "Could not update thinking. Please try again.",
        compacting: "Compressing context… Please wait.",
        compacted: "Context compressed.",
        compactionFailed: "Context compression failed.",
        completed: "Completed",
        stopped: "Stopped",
        failed: "Failed",
        stop: "Stop",
        expiredStop: "This request is no longer running.",
        alreadyProcessing: "Another request is still running. Wait for it to finish before sending a new prompt.",
    },
    auth: {
        unauthorizedChat: "Unauthorized chat.",
    },
    prompt: {
        emptyResponse: "OpenCode returned empty response.",
    },
    replyMetrics: {
        contextLabel: "Context",
        durationLabel: "Duration",
        workspaceLabel: "Workspace",
        modelLabel: "Model",
        reasoningLabel: "Reasoning",
        agentLabel: "Agent",
        defaultReasoning: "default",
        remaining: (percent) => `${percent}% left`,
        notAvailable: "n/a",
    },
    abort: {
        noSession: "No active session is bound to this chat yet.",
        notRunning: "No request is currently running for the current session.",
        aborted: "Abort signal sent to the current session.",
    },
    permission: {
        requestTitle: "Permission Request",
        permissionLabel: "Permission",
        sessionLabel: "Session",
        patternsLabel: "Patterns",
        noPatterns: "(none)",
        allowOnce: "Allow once",
        allowAlways: "Always allow",
        reject: "Reject",
        replyFailed: "Failed to reply to the permission request.",
        replyLabels: {
            once: "allow once",
            always: "always allow",
            reject: "reject",
        },
        resolved(requestId: string, replyLabel: string) {
            return [
                "Permission request resolved.",
                "",
                `Request: ${requestId}`,
                `Reply: ${replyLabel}`,
            ].join("\n");
        },
    },
    sessionEvents: {
        unknownError: "Unknown session error.",
        failed(sessionId: string, error: string) {
            return [
                "Session failed.",
                "",
                `Session: ${sessionId}`,
                `Error: ${error}`,
            ].join("\n");
        },
    },
    errors: {
        unexpected: "Unexpected error.",
        providerAuth: "Provider authentication failed.",
        requestAborted: "Request was aborted.",
        promptTimeout: "OpenCode request timed out.",
        structuredOutput: "Structured output validation failed.",
        voiceUnsupported: "Voice messages are not supported. Send text or an image instead.",
        imageDownload: "Failed to download the Telegram image file.",
        imageUnsupported: "Image file is too large or unsupported.",
        outputLength: "Reply hit the model output limit.",
        contextOverflow: "Conversation exceeded the model context window.",
        providerRequest: "Provider request failed.",
        notFound: "Requested resource was not found.",
        badRequest: "Request was rejected by OpenCode.",
        causeLabel: "Cause",
        statusCodeLabel: "status",
    },
    health: {
        title: "Server Health",
        status(healthy: boolean) {
            return `Status: ${healthy ? "healthy" : "unhealthy"}`;
        },
        version(version: string) {
            return `Version: ${version}`;
        },
    },
    path: {
        title: "Current Paths",
        home(path: string) {
            return `Home: ${path}`;
        },
        state(path: string) {
            return `State: ${path}`;
        },
        config(path: string) {
            return `Config: ${path}`;
        },
        worktree(path: string) {
            return `Worktree: ${path}`;
        },
        directory(path: string) {
            return `Current working directory: ${path}`;
        },
    },
    sessions: {
        none: "No sessions available in the current project.",
        title: "Session List",
        actionTitle: "Session Actions",
        chooseAction: "Choose an action for this session.",
        currentProject(worktree: string) {
            return `Current project: ${worktree}`;
        },
        currentSession(session: string) {
            return `Current session: ${session}`;
        },
        selectedSession(session: string) {
            return `Selected session: ${session}`;
        },
        switched: "Session switched.",
        created: "Session created.",
        renamed: "Session renamed.",
        renameCancelled: "Session rename cancelled.",
        renameEmpty: "Session name cannot be empty. Send a new name or /cancel.",
        renameExpired: "The session is no longer available. Run /sessions again.",
        renamePendingInput: "Waiting for the new session name. Send plain text or /cancel.",
        renamePrompt(session: string) {
            return [
                `Rename session: ${session}`,
                "Send the new session name as your next text message.",
                "Send /cancel to cancel.",
            ].join("\n");
        },
        switchAction: "Switch",
        renameAction: "Rename",
        backToList: "Back to list",
        expired: "The session is no longer available. Run /sessions again.",
    },
    lsp: {
        none: "No LSP servers detected for the current project.",
        unavailable: "Status unavailable: the OpenCode V2 API does not expose LSP status.",
        title: "LSP Servers",
        currentProject(worktree: string) {
            return `Current project: ${worktree}`;
        },
        connected: "connected",
        error: "error",
    },
    mcp: {
        none: "No MCP servers configured for the current project.",
        title: "MCP Servers",
        currentProject(worktree: string) {
            return `Current project: ${worktree}`;
        },
        connected: "connected",
        disabled: "disabled",
        pending: "connecting",
        needsAuth: "needs auth",
        failed(error: string) {
            return `failed: ${error}`;
        },
    },
    agents: {
        none: "No agents available.",
        title: "Agent List",
        current(agent: string) {
            return `Current agent: ${agent}`;
        },
        switched: "Agent switched.",
        expired: "The agent is no longer available. Run /agents again.",
    },
    models: {
        none: "No models available.",
        title: "Choose a model",
        choose: "Choose a number below to switch models.",
        current(model: string) {
            return `Current model: ${model}`;
        },
        switched: "Model switched.",
        currentReasoningLevel(variant: string) {
            return `Current reasoning level: ${variant}`;
        },
        noReasoningLevels: "This model has no selectable reasoning levels.",
        reasoningLevelsTitle: "Reasoning Levels",
        model(model: string) {
            return `Model: ${model}`;
        },
        modelNumber(modelIndex: number) {
            return `Model number: ${modelIndex}`;
        },
        expired: "The model is no longer available. Run /model again.",
        reasoningLevelExpired: "The reasoning level is no longer available. Run /model again.",
        defaultReasoningLevel: "default",
    },
    language: {
        title: "Language",
        choose: "Choose the display language for bot menus and replies.",
        current(label: string) {
            return `Current language: ${label}`;
        },
        switched: "Language switched.",
        expired: "The language option is no longer available. Run /language again.",
        labels: {
            en: "English",
            "zh-CN": "简体中文",
            ja: "日本語",
        },
    },
};

