export const BOT_COPY = {
    commands: {
        start: "Show bot overview",
        health: "Check server health",
        path: "Show current paths",
        config: "Show configuration",
        agents: "View and switch agents",
        projects: "View and switch projects",
        sessions: "View and switch sessions",
        abort: "Abort running request",
        model: "View and switch models",
    },
    start: {
        lines: [
            "opencode-tbot is running.",
            "",
            "Send a text message and I will forward it to OpenCode and reply with the result.",
        ],
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
        alreadyProcessing: "Another request is still running. Wait for it to finish before sending a new prompt.",
    },
    replyMetrics: {
        durationLabel: "Duration",
        tokensLabel: "Tokens",
        totalLabel: "total",
        inputLabel: "input",
        outputLabel: "output",
        reasoningLabel: "reasoning",
        cacheReadLabel: "cache.read",
        cacheWriteLabel: "cache.write",
        notAvailable: "n/a",
    },
    abort: {
        noSession: "No active session is bound to this chat yet.",
        notRunning: "No request is currently running for the current session.",
        aborted: "Abort signal sent to the current session.",
    },
    errors: {
        unexpected: "Unexpected error.",
        providerAuth: "Provider authentication failed.",
        requestAborted: "Request was aborted.",
        structuredOutput: "Structured output validation failed.",
        outputLength: "Reply hit the model output limit.",
        contextOverflow: "Conversation exceeded the model context window.",
        providerRequest: "Provider request failed.",
        notFound: "Requested resource was not found.",
        badRequest: "Request was rejected by OpenCode.",
        causeLabel: "Cause",
        retryableLabel: "retryable",
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
            return `Directory: ${path}`;
        },
    },
    config: {
        title: "Config",
        truncated: "... (truncated)",
    },
    projects: {
        none: "No projects available.",
        title: "Project List",
        current(worktree: string) {
            return `Current project: ${worktree}`;
        },
        switched: "Project switched.",
        expired: "The project is no longer available. Run /projects again.",
    },
    sessions: {
        none: "No sessions available in the current project.",
        title: "Session List",
        currentProject(worktree: string) {
            return `Current project: ${worktree}`;
        },
        currentSession(session: string) {
            return `Current session: ${session}`;
        },
        switched: "Session switched.",
        expired: "The session is no longer available. Run /sessions again.",
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
        title: "Model List",
        configuredOnly: "Configured models and available custom-provider models in OpenCode are shown.",
        current(model: string) {
            return `Current model: ${model}`;
        },
        switched: "Model switched.",
        currentReasoningLevel(variant: string) {
            return `Current reasoning level: ${variant}`;
        },
        reasoningLevel(variant: string) {
            return `Reasoning level: ${variant}`;
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
} as const;
