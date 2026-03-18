export interface ChatSessionBinding {
    chatId: number;
    sessionId: string | null;
    projectId: string | null;
    directory: string | null;
    agentName: string | null;
    modelProviderId: string | null;
    modelId: string | null;
    modelVariant: string | null;
    updatedAt: string;
}
