import type { SessionRepository } from "../domain/session/session.repository.js";
import {
    createMessageAbortedError,
    type OpenCodeSessionStatus,
} from "../services/opencode/opencode.client.js";
import type { OpenCodeSessionCatalog, OpenCodeSessionManager } from "../services/opencode/opencode.ports.js";
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
}

export class AbortPromptUseCase {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodeSessionCatalog & Pick<OpenCodeSessionManager, "abortSession">,
        private readonly foregroundSessionTracker: ForegroundSessionTrackerLike = NOOP_FOREGROUND_SESSION_TRACKER,
    ) { }

    async execute(input: AbortPromptInput): Promise<AbortPromptResult> {
        const hasForegroundRequest = this.foregroundSessionTracker.hasActiveRequest(input.chatId);
        const activeSessionId = this.foregroundSessionTracker.getActiveSessionId(input.chatId);
        const binding = activeSessionId
            ? null
            : await this.sessionRepo.getByChatId(input.chatId);
        const sessionId = activeSessionId ?? binding?.sessionId ?? null;

        if (!hasForegroundRequest && !sessionId) {
            return {
                sessionId: null,
                status: "no_session",
                sessionStatus: null,
            };
        }

        const sessionStatuses = sessionId
            ? await this.opencodeClient.getSessionStatuses()
            : {};
        const sessionStatus = sessionId
            ? (sessionStatuses[sessionId] ?? null)
            : null;

        if (hasForegroundRequest) {
            if (sessionId && sessionStatus && sessionStatus.type !== "idle") {
                await this.opencodeClient.abortSession(sessionId);
            }

            this.foregroundSessionTracker.abort(
                input.chatId,
                createMessageAbortedError(),
            );

            return {
                sessionId,
                status: "aborted",
                sessionStatus,
            };
        }

        if (!sessionStatus || sessionStatus.type === "idle") {
            return {
                sessionId,
                status: "not_running",
                sessionStatus,
            };
        }

        if (!sessionId) {
            return {
                sessionId: null,
                status: "not_running",
                sessionStatus,
            };
        }

        const runningSessionId = sessionId;
        const aborted = await this.opencodeClient.abortSession(runningSessionId);

        return {
            sessionId: runningSessionId,
            status: aborted ? "aborted" : "not_running",
            sessionStatus,
        };
    }
}
