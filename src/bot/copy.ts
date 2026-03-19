export type BotLanguage = "en" | "zh-CN";

export interface BotCopy {
    commands: {
        start: string;
        help: string;
        status: string;
        new: string;
        agents: string;
        sessions: string;
        cancel: string;
        model: string;
        language: string;
    };
    start: {
        lines: string[];
    };
    help: {
        lines: string[];
    };
    systemStatus: {
        title: string;
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
        voiceNotConfigured: string;
        voiceDownload: string;
        voiceTranscription: string;
        voiceEmpty: string;
        voiceUnsupported: string;
        imageDownload: string;
        imageUnsupported: string;
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
    sessions: {
        none: string;
        title: string;
        actionTitle: string;
        chooseAction: string;
        currentProject(worktree: string): string;
        currentSession(session: string): string;
        selectedSession(session: string): string;
        switched: string;
        created: string;
        renamed: string;
        renameCancelled: string;
        renameEmpty: string;
        renameExpired: string;
        renamePendingInput: string;
        renamePrompt(session: string): string;
        switchAction: string;
        renameAction: string;
        backToList: string;
        expired: string;
    };
    lsp: {
        none: string;
        title: string;
        currentProject(worktree: string): string;
        connected: string;
        error: string;
    };
    mcp: {
        none: string;
        title: string;
        currentProject(worktree: string): string;
        connected: string;
        disabled: string;
        needsAuth: string;
        failed(error: string): string;
        needsClientRegistration(error: string): string;
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
        start: "Welcome and quick start",
        help: "Show commands and examples",
        status: "Show system status",
        new: "Create a new session",
        agents: "View and switch agents",
        sessions: "View and switch sessions",
        cancel: "Cancel rename or abort running request",
        model: "View and switch models",
        language: "View and switch language",
    },
    start: {
        lines: [
            "# Welcome to opencode-tbot",
            "",
            "Talk to your OpenCode server from Telegram.",
            "",
            "## What you can send",
            "- Text prompts",
            "- Images with an optional caption",
            "- Voice messages (requires OpenRouter voice transcription)",
            "",
            "## Quick start",
            "1. Run `/status` to confirm the server is ready.",
            "2. Run `/new [title]` to create a fresh session.",
            "3. Send a text, image, or voice message.",
            "",
            "Use `/help` to see the full command list and examples.",
        ],
    },
    help: {
        lines: [
            "# Help",
            "",
            "Use this bot to chat with OpenCode from Telegram.",
            "",
            "## Commands",
            "- `/status` Check server, workspace, MCP, and LSP status",
            "- `/new [title]` Create a new session",
            "- `/sessions` View, switch, or rename sessions",
            "- `/agents` View and switch agents",
            "- `/model` View and switch models and reasoning levels",
            "- `/language` Switch the bot display language",
            "- `/cancel` Cancel session rename or abort the running request",
            "",
            "## Examples",
            "- `/new bug triage`",
            "- Send a plain text message directly",
            "- Send an image with a caption",
            "- Send a voice message if OpenRouter voice transcription is configured",
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
        voiceNotConfigured: "Voice transcription is not configured.",
        voiceDownload: "Failed to download the Telegram voice file.",
        voiceTranscription: "Voice transcription failed.",
        voiceEmpty: "Voice transcription returned empty text.",
        voiceUnsupported: "Voice message file is too large or unsupported.",
        imageDownload: "Failed to download the Telegram image file.",
        imageUnsupported: "Image file is too large or unsupported.",
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
            return `Current working directory: ${path}`;
        },
    },
    sessions: {
        none: "No sessions available in the current project.",
        title: "Session List",
        actionTitle: "Session Actions",
        chooseAction: "Choose what to do with this session.",
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
        backToList: "Back",
        expired: "The session is no longer available. Run /sessions again.",
    },
    lsp: {
        none: "No LSP servers detected for the current project.",
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
        needsAuth: "needs auth",
        failed(error: string) {
            return `failed: ${error}`;
        },
        needsClientRegistration(error: string) {
            return `needs client registration: ${error}`;
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
        title: "Model List",
        configuredOnly: "Only models currently available in OpenCode and connected providers are shown.",
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
        start: "查看欢迎与快速开始",
        help: "查看命令说明与示例",
        status: "查看系统状态",
        new: "新建会话",
        agents: "查看并切换代理",
        sessions: "查看并切换会话",
        cancel: "取消重命名或中止运行中的请求",
        model: "查看并切换模型",
        language: "查看并切换语言",
    },
    start: {
        lines: [
            "# 欢迎使用 opencode-tbot",
            "",
            "通过 Telegram 直接和 OpenCode 服务对话。",
            "",
            "## 支持的输入",
            "- 文本消息",
            "- 图片 (可附带 caption)",
            "- 语音消息 (需先配置 OpenRouter 语音转写)",
            "",
            "## 快速开始",
            "1. 先运行 `/status` 确认服务状态正常。",
            "2. 运行 `/new [title]` 创建一个新会话。",
            "3. 直接发送文本、图片或语音消息。",
            "",
            "更多命令和示例请查看 `/help`。",
        ],
    },
    help: {
        lines: [
            "# 帮助",
            "",
            "使用这个机器人可以通过 Telegram 与 OpenCode 对话。",
            "",
            "## 命令",
            "- `/status` 查看服务、工作区、MCP 和 LSP 状态",
            "- `/new [title]` 创建一个新会话",
            "- `/sessions` 查看、切换或重命名会话",
            "- `/agents` 查看并切换代理",
            "- `/model` 查看并切换模型与推理级别",
            "- `/language` 切换机器人的显示语言",
            "- `/cancel` 取消会话重命名或中止当前请求",
            "",
            "## 示例",
            "- `/new bug triage`",
            "- 直接发送一条文本消息",
            "- 发送一张带 caption 的图片",
            "- 如果已配置 OpenRouter 语音转写，直接发送语音消息",
        ],
    },
    systemStatus: {
        title: "系统状态",
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
        voiceNotConfigured: "未配置语音转写服务。",
        voiceDownload: "下载 Telegram 语音文件失败。",
        voiceTranscription: "语音转写失败。",
        voiceEmpty: "语音转写结果为空。",
        voiceUnsupported: "语音文件过大或不受支持。",
        imageDownload: "下载 Telegram 图片文件失败。",
        imageUnsupported: "图片文件过大或不受支持。",
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
            return `当前工作目录: ${path}`;
        },
    },
    sessions: {
        none: "当前项目下没有可用会话。",
        title: "会话列表",
        actionTitle: "会话操作",
        chooseAction: "请选择对该会话执行的操作。",
        currentProject(worktree: string) {
            return `当前项目: ${worktree}`;
        },
        currentSession(session: string) {
            return `当前会话: ${session}`;
        },
        selectedSession(session: string) {
            return `目标会话: ${session}`;
        },
        switched: "会话已切换。",
        created: "会话已创建。",
        renamed: "会话已重命名。",
        renameCancelled: "已取消会话重命名。",
        renameEmpty: "会话名称不能为空。请重新发送名称或发送 /cancel。",
        renameExpired: "该会话已不可用。请重新运行 /sessions。",
        renamePendingInput: "当前正在等待新的会话名称。请发送纯文本或 /cancel。",
        renamePrompt(session: string) {
            return [
                `重命名会话: ${session}`,
                "请发送新的会话名称。",
                "发送 /cancel 取消。",
            ].join("\n");
        },
        switchAction: "切换",
        renameAction: "重命名",
        backToList: "返回列表",
        expired: "该会话已不可用。请重新运行 /sessions。",
    },
    lsp: {
        none: "当前项目未检测到 LSP。",
        title: "LSP 服务",
        currentProject(worktree: string) {
            return `当前项目: ${worktree}`;
        },
        connected: "已连接",
        error: "异常",
    },
    mcp: {
        none: "当前项目未配置 MCP。",
        title: "MCP 服务",
        currentProject(worktree: string) {
            return `当前项目: ${worktree}`;
        },
        connected: "已连接",
        disabled: "已禁用",
        needsAuth: "需要认证",
        failed(error: string) {
            return `失败: ${error}`;
        },
        needsClientRegistration(error: string) {
            return `需要客户端注册: ${error}`;
        },
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
        configuredOnly: "仅显示当前在 OpenCode 和已连接 provider 中实际可用的模型。",
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
        choose: "选择机器人菜单和回复信息的显示语言。",
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
