import type { SessionRepository } from "../domain/session/session.repository.js";
import {
    createMessageAbortedError,
    type OpenCodeSessionStatus,
} from "../services/opencode/opencode.client.js";
import type { OpenCodeSessionManager } from "../services/opencode/opencode.ports.js";
import {
    NOOP_FOREGROUND_SESSION_TRACKER,
    type ForegroundSessionTrackerLike,
} from "../services/session-activity/foreground-session-tracker.js";

export interface AbortPromptResult {
    sessionId: string | null;
    status: "aborted" | "no_session" | "not_running";
    sessionStatus: OpenCodeSessionStatus | null;
}

export interface AbortPromptInput {
    chatId: number;
    requestId?: string;
}

export class AbortPromptUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: Pick<OpenCodeSessionManager, "abortSession" | "cancelSessionInput">,
        private readonly foregroundSessionTracker: ForegroundSessionTrackerLike = NOOP_FOREGROUND_SESSION_TRACKER,
    ) { }

    async execute(input: AbortPromptInput): Promise<AbortPromptResult> {
        const requestId = input.requestId ?? this.foregroundSessionTracker.getRequestId(input.chatId);
        if (input.requestId && this.foregroundSessionTracker.getRequestId(input.chatId) !== requestId) {
            return { sessionId: null, status: "not_running", sessionStatus: null };
        }
        const hasForegroundRequest = this.foregroundSessionTracker.hasActiveRequest(input.chatId);
        const sessionId = hasForegroundRequest
            ? this.foregroundSessionTracker.getActiveSessionId(input.chatId)
            : (await this.sessionRepo.getByChatId(input.chatId))?.sessionId ?? null;

        if (this.foregroundSessionTracker.getRequestId(input.chatId) !== requestId) {
            return { sessionId, status: "not_running", sessionStatus: null };
        }
        if (!sessionId) {
            if (hasForegroundRequest) {
                this.foregroundSessionTracker.abort(input.chatId, createMessageAbortedError(), requestId ?? undefined);
            }
            return { sessionId: null, status: hasForegroundRequest ? "aborted" : "no_session", sessionStatus: null };
        }

        try {
            const inputId = this.foregroundSessionTracker.getActiveInputId(input.chatId);
            if (hasForegroundRequest && inputId) {
                await this.opencodeClient.cancelSessionInput(sessionId, inputId);
                if (this.foregroundSessionTracker.getRequestId(input.chatId) !== requestId) {
                    return { sessionId, status: "not_running", sessionStatus: null };
                }
            }
            const interrupted = await this.opencodeClient.abortSession(sessionId);
            return {
                sessionId,
                status: hasForegroundRequest || interrupted ? "aborted" : "not_running",
                sessionStatus: { type: interrupted ? "busy" : "idle" },
            };
        } finally {
            if (hasForegroundRequest) {
                this.foregroundSessionTracker.abort(input.chatId, createMessageAbortedError(), requestId ?? undefined);
            }
        }
    }
}
