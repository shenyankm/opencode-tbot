import { EN_BOT_COPY } from "./locales/en.js";
import { ZH_CN_BOT_COPY } from "./locales/zh-cn.js";
import { JA_BOT_COPY } from "./locales/ja.js";

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
        choose: string;
        current(model: string): string;
        switched: string;
        currentReasoningLevel(variant: string): string;
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
