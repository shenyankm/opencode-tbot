export interface ThinkingContent {
    text: string;
    part?: number;
    phase: "running" | "completed" | "stopped" | "failed";
}

export interface ThinkingMessage extends ThinkingContent {
    chatId: number;
    messageId: number;
    expanded: boolean;
    stopCallbackData: string | null;
    lastSentView?: string;
}
