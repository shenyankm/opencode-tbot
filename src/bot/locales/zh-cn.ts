import type { BotCopy } from "../copy.js";

export const ZH_CN_BOT_COPY: BotCopy = {
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
        title: "选择模型",
        choose: "点击下方编号切换模型。",
        current(model: string) {
            return `当前模型: ${model}`;
        },
        switched: "模型已切换。",
        currentReasoningLevel(variant: string) {
            return `当前推理级别: ${variant}`;
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

