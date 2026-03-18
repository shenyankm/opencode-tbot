export type BotLanguage = "en" | "zh-CN";

export interface BotCopy {
    commands: {
        start: string;
        health: string;
        path: string;
        agents: string;
        projects: string;
        sessions: string;
        abort: string;
        model: string;
        language: string;
    };
    start: {
        lines: string[];
    };
    common: {
        notSelected: string;
        openCodeDefault: string;
        previousPage: string;
        nextPage: string;
        page(currentPage: number, totalPages: number): string;
    };
    status: {
        processing: string;
        alreadyProcessing: string;
    };
    prompt: {
        emptyResponse: string;
    };
    replyMetrics: {
        durationLabel: string;
        tokensLabel: string;
        totalLabel: string;
        inputLabel: string;
        outputLabel: string;
        reasoningLabel: string;
        cacheReadLabel: string;
        cacheWriteLabel: string;
        notAvailable: string;
    };
    abort: {
        noSession: string;
        notRunning: string;
        aborted: string;
    };
    errors: {
        unexpected: string;
        providerAuth: string;
        requestAborted: string;
        structuredOutput: string;
        outputLength: string;
        contextOverflow: string;
        providerRequest: string;
        notFound: string;
        badRequest: string;
        causeLabel: string;
        retryableLabel: string;
        statusCodeLabel: string;
    };
    health: {
        title: string;
        status(healthy: boolean): string;
        version(version: string): string;
    };
    path: {
        title: string;
        home(path: string): string;
        state(path: string): string;
        config(path: string): string;
        worktree(path: string): string;
        directory(path: string): string;
    };
    projects: {
        none: string;
        title: string;
        current(worktree: string): string;
        switched: string;
        expired: string;
    };
    sessions: {
        none: string;
        title: string;
        currentProject(worktree: string): string;
        currentSession(session: string): string;
        switched: string;
        expired: string;
    };
    agents: {
        none: string;
        title: string;
        current(agent: string): string;
        switched: string;
        expired: string;
    };
    models: {
        none: string;
        title: string;
        configuredOnly: string;
        current(model: string): string;
        switched: string;
        currentReasoningLevel(variant: string): string;
        reasoningLevel(variant: string): string;
        noReasoningLevels: string;
        reasoningLevelsTitle: string;
        model(model: string): string;
        modelNumber(modelIndex: number): string;
        expired: string;
        reasoningLevelExpired: string;
        defaultReasoningLevel: string;
    };
    language: {
        title: string;
        choose: string;
        current(label: string): string;
        switched: string;
        expired: string;
        labels: Record<BotLanguage, string>;
    };
}

export const DEFAULT_BOT_LANGUAGE: BotLanguage = "en";
export const SUPPORTED_BOT_LANGUAGES: readonly BotLanguage[] = ["en", "zh-CN"];

const EN_BOT_COPY: BotCopy = {
    commands: {
        start: "Show bot overview",
        health: "Check server health",
        path: "Show current paths",
        agents: "View and switch agents",
        projects: "View and switch projects",
        sessions: "View and switch sessions",
        abort: "Abort running request",
        model: "View and switch models",
        language: "View and switch language",
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
    prompt: {
        emptyResponse: "OpenCode returned empty response.",
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
        configuredOnly: "Configured models, connected-provider models, and available custom-provider models in OpenCode are shown.",
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
            "zh-CN": "Simplified Chinese",
        },
    },
};

const ZH_CN_BOT_COPY: BotCopy = {
    commands: {
        start: "查看机器人说明",
        health: "检查服务健康状态",
        path: "查看当前路径",
        agents: "查看并切换代理",
        projects: "查看并切换项目",
        sessions: "查看并切换会话",
        abort: "中止正在运行的请求",
        model: "查看并切换模型",
        language: "查看并切换语言",
    },
    start: {
        lines: [
            "opencode-tbot 已运行。",
            "",
            "发送一条文本消息，我会转发给 OpenCode 并返回结果。",
        ],
    },
    common: {
        notSelected: "未选择",
        openCodeDefault: "未选择（使用 OpenCode 默认值）",
        previousPage: "上一页",
        nextPage: "下一页",
        page(currentPage: number, totalPages: number) {
            return `第 ${currentPage}/${totalPages} 页`;
        },
    },
    status: {
        processing: "处理中...",
        alreadyProcessing: "另一个请求仍在运行。请等待其完成后再发送新的提示词。",
    },
    prompt: {
        emptyResponse: "OpenCode 返回了空响应。",
    },
    replyMetrics: {
        durationLabel: "耗时",
        tokensLabel: "令牌数",
        totalLabel: "总计",
        inputLabel: "输入",
        outputLabel: "输出",
        reasoningLabel: "推理",
        cacheReadLabel: "缓存读取",
        cacheWriteLabel: "缓存写入",
        notAvailable: "不可用",
    },
    abort: {
        noSession: "当前聊天还没有绑定活动会话。",
        notRunning: "当前会话没有正在运行的请求。",
        aborted: "已向当前会话发送中止信号。",
    },
    errors: {
        unexpected: "发生未知错误。",
        providerAuth: "Provider 认证失败。",
        requestAborted: "请求已中止。",
        structuredOutput: "结构化输出校验失败。",
        outputLength: "回复触发了模型输出长度上限。",
        contextOverflow: "会话已超过模型上下文窗口。",
        providerRequest: "Provider 请求失败。",
        notFound: "请求的资源不存在。",
        badRequest: "OpenCode 拒绝了该请求。",
        causeLabel: "原因",
        retryableLabel: "可重试",
        statusCodeLabel: "状态码",
    },
    health: {
        title: "服务健康状态",
        status(healthy: boolean) {
            return `状态: ${healthy ? "健康" : "异常"}`;
        },
        version(version: string) {
            return `版本: ${version}`;
        },
    },
    path: {
        title: "当前路径",
        home(path: string) {
            return `主目录: ${path}`;
        },
        state(path: string) {
            return `状态目录: ${path}`;
        },
        config(path: string) {
            return `配置文件: ${path}`;
        },
        worktree(path: string) {
            return `工作树: ${path}`;
        },
        directory(path: string) {
            return `当前目录: ${path}`;
        },
    },
    projects: {
        none: "没有可用项目。",
        title: "项目列表",
        current(worktree: string) {
            return `当前项目: ${worktree}`;
        },
        switched: "项目已切换。",
        expired: "该项目已不可用。请重新运行 /projects。",
    },
    sessions: {
        none: "当前项目下没有可用会话。",
        title: "会话列表",
        currentProject(worktree: string) {
            return `当前项目: ${worktree}`;
        },
        currentSession(session: string) {
            return `当前会话: ${session}`;
        },
        switched: "会话已切换。",
        expired: "该会话已不可用。请重新运行 /sessions。",
    },
    agents: {
        none: "没有可用代理。",
        title: "代理列表",
        current(agent: string) {
            return `当前代理: ${agent}`;
        },
        switched: "代理已切换。",
        expired: "该代理已不可用。请重新运行 /agents。",
    },
    models: {
        none: "没有可用模型。",
        title: "模型列表",
        configuredOnly: "显示 OpenCode 中已配置的模型、已连接 provider 的模型，以及可用的自定义 provider 模型。",
        current(model: string) {
            return `当前模型: ${model}`;
        },
        switched: "模型已切换。",
        currentReasoningLevel(variant: string) {
            return `当前推理级别: ${variant}`;
        },
        reasoningLevel(variant: string) {
            return `推理级别: ${variant}`;
        },
        noReasoningLevels: "该模型没有可选的推理级别。",
        reasoningLevelsTitle: "推理级别",
        model(model: string) {
            return `模型: ${model}`;
        },
        modelNumber(modelIndex: number) {
            return `模型编号: ${modelIndex}`;
        },
        expired: "该模型已不可用。请重新运行 /model。",
        reasoningLevelExpired: "该推理级别已不可用。请重新运行 /model。",
        defaultReasoningLevel: "默认",
    },
    language: {
        title: "语言",
        choose: "选择电报机器人菜单和返回信息的显示语言。",
        current(label: string) {
            return `当前语言: ${label}`;
        },
        switched: "语言已切换。",
        expired: "该语言选项已不可用。请重新运行 /language。",
        labels: {
            en: "English",
            "zh-CN": "简体中文",
        },
    },
};

export const BOT_COPY = EN_BOT_COPY;

export function isBotLanguage(value: string): value is BotLanguage {
    return SUPPORTED_BOT_LANGUAGES.includes(value as BotLanguage);
}

export function normalizeBotLanguage(value: string | null | undefined): BotLanguage {
    if (!value) {
        return DEFAULT_BOT_LANGUAGE;
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === "zh-cn" || normalized === "zh-hans" || normalized === "zh") {
        return "zh-CN";
    }

    return "en";
}

export function getBotCopy(language: BotLanguage | null | undefined = DEFAULT_BOT_LANGUAGE): BotCopy {
    return normalizeBotLanguage(language) === "zh-CN"
        ? ZH_CN_BOT_COPY
        : EN_BOT_COPY;
}

export function getLanguageLabel(language: BotLanguage, copy: BotCopy = BOT_COPY): string {
    return copy.language.labels[language];
}
