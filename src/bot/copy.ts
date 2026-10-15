export type BotLanguage = "en" | "zh-CN" | "ja";

export interface BotCopy {
    locale: BotLanguage;
    commands: {
        start: string;
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
        thinking: string;
        thinkingInProgress: string;
        expandThinking: string;
        collapseThinking: string;
        thinkingUnavailable: string;
        thinkingToggleFailed: string;
        compacting: string;
        compacted: string;
        compactionFailed: string;
        completed: string;
        stopped: string;
        failed: string;
        stop: string;
        expiredStop: string;
        alreadyProcessing: string;
    };
    auth: {
        unauthorizedChat: string;
    };
    prompt: {
        emptyResponse: string;
    };
    replyMetrics: {
        contextLabel: string;
        durationLabel: string;
        workspaceLabel: string;
        modelLabel: string;
        reasoningLabel: string;
        agentLabel: string;
        defaultReasoning: string;
        remaining(percent: number): string;
        notAvailable: string;
    };
    abort: {
        noSession: string;
        notRunning: string;
        aborted: string;
    };
    permission: {
        requestTitle: string;
        permissionLabel: string;
        sessionLabel: string;
        patternsLabel: string;
        noPatterns: string;
        allowOnce: string;
        allowAlways: string;
        reject: string;
        replyFailed: string;
        replyLabels: {
            once: string;
            always: string;
            reject: string;
        };
        resolved(requestId: string, replyLabel: string): string;
    };
    sessionEvents: {
        unknownError: string;
        failed(sessionId: string, error: string): string;
    };
    errors: {
        unexpected: string;
        providerAuth: string;
        requestAborted: string;
        promptTimeout: string;
        structuredOutput: string;
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
        unavailable: string;
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
        pending: string;
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
export const SUPPORTED_BOT_LANGUAGES: readonly BotLanguage[] = ["en", "zh-CN", "ja"];

const EN_BOT_COPY: BotCopy = {
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
        configuredOnly: "Only models exposed by OpenCode for connected providers are shown.",
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
            "zh-CN": "简体中文",
            ja: "日本語",
        },
    },
};

const ZH_CN_BOT_COPY: BotCopy = {
    locale: "zh-CN",
    commands: {
        start: "查看欢迎信息与快速开始",
        status: "查看系统状态",
        new: "新建会话",
        agents: "查看并切换 Agent",
        sessions: "查看并切换会话",
        cancel: "取消重命名或中止当前请求",
        model: "查看并切换模型",
        language: "查看并切换语言",
    },
    start: {
        lines: [
            "# 欢迎使用 opencode-tbot",
            "",
            "通过 Telegram 直接和 OpenCode 服务对话。",
            "",
            "## 快速开始",
            "1. 先运行 `/status` 确认服务状态正常。",
            "2. 运行 `/new [title]` 创建一个新会话。",
            "",
            "直接发送文本或图片消息即可。",
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
        thinking: "思考",
        thinkingInProgress: "思考中…",
        expandThinking: "展开",
        collapseThinking: "收起",
        thinkingUnavailable: "这条思考内容已不可用。",
        thinkingToggleFailed: "无法更新思考消息，请重试。",
        compacting: "正在压缩上下文，请稍候…",
        compacted: "上下文已压缩。",
        compactionFailed: "上下文压缩失败。",
        completed: "已完成",
        stopped: "已停止",
        failed: "失败",
        stop: "停止",
        expiredStop: "该请求已结束。",
        alreadyProcessing: "另一个请求仍在运行。请等待其完成后再发送新的提示词。",
    },
    auth: {
        unauthorizedChat: "当前聊天未获授权。",
    },
    prompt: {
        emptyResponse: "OpenCode 返回了空响应。",
    },
    replyMetrics: {
        contextLabel: "上下文",
        durationLabel: "耗时",
        workspaceLabel: "工作区",
        modelLabel: "模型",
        reasoningLabel: "思考强度",
        agentLabel: "Agent",
        defaultReasoning: "默认",
        remaining: (percent) => `剩余 ${percent}%`,
        notAvailable: "不可用",
    },
    abort: {
        noSession: "当前聊天还没有绑定活动会话。",
        notRunning: "当前会话没有正在运行的请求。",
        aborted: "已向当前会话发送中止信号。",
    },
    permission: {
        requestTitle: "权限请求",
        permissionLabel: "权限",
        sessionLabel: "会话",
        patternsLabel: "匹配范围",
        noPatterns: "（无）",
        allowOnce: "本次允许",
        allowAlways: "始终允许",
        reject: "拒绝",
        replyFailed: "回复权限请求失败。",
        replyLabels: {
            once: "本次允许",
            always: "始终允许",
            reject: "拒绝",
        },
        resolved(requestId: string, replyLabel: string) {
            return [
                "权限请求已处理。",
                "",
                `请求：${requestId}`,
                `结果：${replyLabel}`,
            ].join("\n");
        },
    },
    sessionEvents: {
        unknownError: "未知会话错误。",
        failed(sessionId: string, error: string) {
            return [
                "会话执行失败。",
                "",
                `会话：${sessionId}`,
                `错误：${error}`,
            ].join("\n");
        },
    },
    errors: {
        unexpected: "发生未知错误。",
        providerAuth: "Provider 认证失败。",
        requestAborted: "请求已中止。",
        promptTimeout: "OpenCode 响应超时。",
        structuredOutput: "结构化输出校验失败。",
        voiceUnsupported: "暂不支持语音消息，请改发文本或图片。",
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
        chooseAction: "请选择该会话的操作。",
        currentProject(worktree: string) {
            return `当前项目: ${worktree}`;
        },
        currentSession(session: string) {
            return `当前会话: ${session}`;
        },
        selectedSession(session: string) {
            return `已选会话: ${session}`;
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
        unavailable: "状态不可查询：OpenCode V2 API 暂未提供 LSP 状态。",
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
        pending: "连接中",
        needsAuth: "需要认证",
        failed(error: string) {
            return `失败: ${error}`;
        },
        needsClientRegistration(error: string) {
            return `需要客户端注册: ${error}`;
        },
    },
    agents: {
        none: "没有可用 Agent。",
        title: "Agent 列表",
        current(agent: string) {
            return `当前 Agent: ${agent}`;
        },
        switched: "Agent 已切换。",
        expired: "该 Agent 已不可用。请重新运行 /agents。",
    },
    models: {
        none: "没有可用模型。",
        title: "模型列表",
        configuredOnly: "仅显示 OpenCode 为已连接 provider 暴露的模型。",
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
        choose: "选择 Bot 菜单和回复的显示语言。",
        current(label: string) {
            return `当前语言: ${label}`;
        },
        switched: "语言已切换。",
        expired: "该语言选项已不可用。请重新运行 /language。",
        labels: {
            en: "English",
            "zh-CN": "简体中文",
            ja: "日本語",
        },
    },
};

const JA_BOT_COPY: BotCopy = {
    locale: "ja",
    commands: {
        start: "ようこそとクイックスタートを表示",
        status: "システム状態を表示",
        new: "新しいセッションを作成",
        agents: "エージェントを表示して切り替え",
        sessions: "セッションを表示して切り替え",
        cancel: "名前変更を取り消すか実行中のリクエストを中止",
        model: "モデルを表示して切り替え",
        language: "言語を表示して切り替え",
    },
    start: {
        lines: [
            "# opencode-tbot へようこそ",
            "",
            "Telegram から OpenCode サーバーとやり取りできます。",
            "",
            "## クイックスタート",
            "1. `/status` を実行してサーバーの準備完了を確認します。",
            "2. `/new [title]` を実行して新しいセッションを作成します。",
            "",
            "そのままテキストまたは画像メッセージを送信できます。",
        ],
    },
    systemStatus: {
        title: "システム状態",
    },
    common: {
        notSelected: "未選択",
        openCodeDefault: "未選択（OpenCode のデフォルトを使用）",
        previousPage: "前へ",
        nextPage: "次へ",
        page(currentPage: number, totalPages: number) {
            return `ページ ${currentPage}/${totalPages}`;
        },
    },
    status: {
        processing: "処理中...",
        thinking: "思考",
        thinkingInProgress: "思考中…",
        expandThinking: "展開",
        collapseThinking: "折りたたむ",
        thinkingUnavailable: "この思考の内容は利用できません。",
        thinkingToggleFailed: "思考を更新できませんでした。もう一度お試しください。",
        compacting: "コンテキストを圧縮中です。しばらくお待ちください…",
        compacted: "コンテキストを圧縮しました。",
        compactionFailed: "コンテキストの圧縮に失敗しました。",
        completed: "完了",
        stopped: "停止済み",
        failed: "失敗",
        stop: "停止",
        expiredStop: "このリクエストは終了しました。",
        alreadyProcessing: "別のリクエストがまだ実行中です。完了するまで新しいプロンプトを送信しないでください。",
    },
    auth: {
        unauthorizedChat: "このチャットにはアクセス権がありません。",
    },
    prompt: {
        emptyResponse: "OpenCode から空の応答が返されました。",
    },
    replyMetrics: {
        contextLabel: "コンテキスト",
        durationLabel: "所要時間",
        workspaceLabel: "ワークスペース",
        modelLabel: "モデル",
        reasoningLabel: "推論レベル",
        agentLabel: "Agent",
        defaultReasoning: "既定",
        remaining: (percent) => `残り ${percent}%`,
        notAvailable: "該当なし",
    },
    abort: {
        noSession: "このチャットにはまだアクティブなセッションが紐付いていません。",
        notRunning: "現在のセッションで実行中のリクエストはありません。",
        aborted: "現在のセッションに中止シグナルを送信しました。",
    },
    permission: {
        requestTitle: "権限リクエスト",
        permissionLabel: "権限",
        sessionLabel: "セッション",
        patternsLabel: "対象パターン",
        noPatterns: "（なし）",
        allowOnce: "今回のみ許可",
        allowAlways: "常に許可",
        reject: "拒否",
        replyFailed: "権限リクエストへの応答に失敗しました。",
        replyLabels: {
            once: "今回のみ許可",
            always: "常に許可",
            reject: "拒否",
        },
        resolved(requestId: string, replyLabel: string) {
            return [
                "権限リクエストを処理しました。",
                "",
                `リクエスト: ${requestId}`,
                `結果: ${replyLabel}`,
            ].join("\n");
        },
    },
    sessionEvents: {
        unknownError: "不明なセッションエラーです。",
        failed(sessionId: string, error: string) {
            return [
                "セッションの実行に失敗しました。",
                "",
                `セッション: ${sessionId}`,
                `エラー: ${error}`,
            ].join("\n");
        },
    },
    errors: {
        unexpected: "予期しないエラーが発生しました。",
        providerAuth: "Provider の認証に失敗しました。",
        requestAborted: "リクエストは中止されました。",
        promptTimeout: "OpenCode リクエストがタイムアウトしました。",
        structuredOutput: "構造化出力の検証に失敗しました。",
        voiceUnsupported: "音声メッセージには対応していません。代わりにテキストまたは画像を送信してください。",
        imageDownload: "Telegram の画像ファイルをダウンロードできませんでした。",
        imageUnsupported: "画像ファイルが大きすぎるか、サポートされていません。",
        outputLength: "返信がモデルの出力上限に達しました。",
        contextOverflow: "会話がモデルのコンテキスト上限を超えました。",
        providerRequest: "Provider へのリクエストに失敗しました。",
        notFound: "要求されたリソースが見つかりませんでした。",
        badRequest: "リクエストは OpenCode に拒否されました。",
        causeLabel: "原因",
        retryableLabel: "再試行可能",
        statusCodeLabel: "ステータス",
    },
    health: {
        title: "サーバー状態",
        status(healthy: boolean) {
            return `状態: ${healthy ? "正常" : "異常"}`;
        },
        version(version: string) {
            return `バージョン: ${version}`;
        },
    },
    path: {
        title: "現在のパス",
        home(path: string) {
            return `ホーム: ${path}`;
        },
        state(path: string) {
            return `状態: ${path}`;
        },
        config(path: string) {
            return `設定: ${path}`;
        },
        worktree(path: string) {
            return `ワークツリー: ${path}`;
        },
        directory(path: string) {
            return `現在の作業ディレクトリ: ${path}`;
        },
    },
    sessions: {
        none: "現在のプロジェクトで利用できるセッションはありません。",
        title: "セッション一覧",
        actionTitle: "セッション操作",
        chooseAction: "このセッションに対する操作を選択してください。",
        currentProject(worktree: string) {
            return `現在のプロジェクト: ${worktree}`;
        },
        currentSession(session: string) {
            return `現在のセッション: ${session}`;
        },
        selectedSession(session: string) {
            return `選択中のセッション: ${session}`;
        },
        switched: "セッションを切り替えました。",
        created: "セッションを作成しました。",
        renamed: "セッション名を変更しました。",
        renameCancelled: "セッション名の変更を取り消しました。",
        renameEmpty: "セッション名は空にできません。新しい名前を送信するか /cancel を実行してください。",
        renameExpired: "このセッションはもう利用できません。/sessions を再実行してください。",
        renamePendingInput: "新しいセッション名の入力待ちです。プレーンテキストを送るか /cancel を実行してください。",
        renamePrompt(session: string) {
            return [
                `セッション名を変更: ${session}`,
                "次のテキストメッセージで新しいセッション名を送信してください。",
                "/cancel で取り消します。",
            ].join("\n");
        },
        switchAction: "切り替え",
        renameAction: "名前変更",
        backToList: "一覧に戻る",
        expired: "このセッションはもう利用できません。/sessions を再実行してください。",
    },
    lsp: {
        none: "現在のプロジェクトで LSP サーバーは検出されませんでした。",
        unavailable: "状態を取得できません：OpenCode V2 API は LSP 状態を公開していません。",
        title: "LSP サーバー",
        currentProject(worktree: string) {
            return `現在のプロジェクト: ${worktree}`;
        },
        connected: "接続済み",
        error: "エラー",
    },
    mcp: {
        none: "現在のプロジェクトで MCP サーバーは設定されていません。",
        title: "MCP サーバー",
        currentProject(worktree: string) {
            return `現在のプロジェクト: ${worktree}`;
        },
        connected: "接続済み",
        disabled: "無効",
        pending: "接続中",
        needsAuth: "認証が必要",
        failed(error: string) {
            return `失敗: ${error}`;
        },
        needsClientRegistration(error: string) {
            return `クライアント登録が必要: ${error}`;
        },
    },
    agents: {
        none: "利用可能なエージェントはありません。",
        title: "エージェント一覧",
        current(agent: string) {
            return `現在のエージェント: ${agent}`;
        },
        switched: "エージェントを切り替えました。",
        expired: "このエージェントはもう利用できません。/agents を再実行してください。",
    },
    models: {
        none: "利用可能なモデルはありません。",
        title: "モデル一覧",
        configuredOnly: "OpenCode が接続済み provider 向けに公開しているモデルのみ表示します。",
        current(model: string) {
            return `現在のモデル: ${model}`;
        },
        switched: "モデルを切り替えました。",
        currentReasoningLevel(variant: string) {
            return `現在の推論レベル: ${variant}`;
        },
        reasoningLevel(variant: string) {
            return `推論レベル: ${variant}`;
        },
        noReasoningLevels: "このモデルには選択可能な推論レベルがありません。",
        reasoningLevelsTitle: "推論レベル",
        model(model: string) {
            return `モデル: ${model}`;
        },
        modelNumber(modelIndex: number) {
            return `モデル番号: ${modelIndex}`;
        },
        expired: "このモデルはもう利用できません。/model を再実行してください。",
        reasoningLevelExpired: "この推論レベルはもう利用できません。/model を再実行してください。",
        defaultReasoningLevel: "デフォルト",
    },
    language: {
        title: "言語",
        choose: "Bot のメニューと返信に使う表示言語を選択してください。",
        current(label: string) {
            return `現在の言語: ${label}`;
        },
        switched: "言語を切り替えました。",
        expired: "この言語オプションはもう利用できません。/language を再実行してください。",
        labels: {
            en: "English",
            "zh-CN": "简体中文",
            ja: "日本語",
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

    if (normalized === "ja" || normalized === "ja-jp" || normalized === "ja_jp") {
        return "ja";
    }

    return "en";
}

export function getBotCopy(language: BotLanguage | null | undefined = DEFAULT_BOT_LANGUAGE): BotCopy {
    const normalized = normalizeBotLanguage(language);

    if (normalized === "zh-CN") {
        return ZH_CN_BOT_COPY;
    }

    if (normalized === "ja") {
        return JA_BOT_COPY;
    }

    return EN_BOT_COPY;
}

export function getLanguageLabel(language: BotLanguage, copy: BotCopy = BOT_COPY): string {
    return copy.language.labels[language];
}
