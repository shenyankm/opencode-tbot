import type { PendingActionRepository } from "../domain/pending-action/pending-action.repository.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { AppLogger } from "../infra/logger/index.js";
import type { ForegroundSessionTrackerLike } from "../services/session-activity/foreground-session-tracker.js";
import type { PromptSessionFilePartInput } from "../services/opencode/opencode.client.js";
import type {
    AbortPromptInput,
    AbortPromptResult,
} from "../use-cases/abort-prompt.usecase.js";
import type {
    CreateSessionInput,
    CreateSessionResult,
} from "../use-cases/create-session.usecase.js";
import type { GetStatusInput, GetStatusResult } from "../use-cases/get-status.usecase.js";
import type { ListAgentsInput, ListAgentsResult } from "../use-cases/list-agents.usecase.js";
import type { ListLspInput, ListLspResult } from "../use-cases/list-lsp.usecase.js";
import type { ListMcpInput, ListMcpResult } from "../use-cases/list-mcp.usecase.js";
import type { ListModelsInput, ListModelsResult } from "../use-cases/list-models.usecase.js";
import type { ListSessionsInput, ListSessionsResult } from "../use-cases/list-sessions.usecase.js";
import type {
    RenameSessionInput,
    RenameSessionResult,
} from "../use-cases/rename-session.usecase.js";
import type {
    SendPromptInput,
    SendPromptResult,
} from "../use-cases/send-prompt.usecase.js";
import type { SwitchAgentInput, SwitchAgentResult } from "../use-cases/switch-agent.usecase.js";
import type { SwitchModelInput, SwitchModelResult } from "../use-cases/switch-model.usecase.js";
import type { SwitchSessionInput, SwitchSessionResult } from "../use-cases/switch-session.usecase.js";
import type { UploadFileInput } from "../use-cases/upload-file.usecase.js";
import type { BotLanguage } from "./copy.js";

export interface UseCaseExecutor<TInput, TResult> {
    execute(input: TInput): Promise<TResult>;
}

export interface LoggerDependencies {
    logger: AppLogger;
}

export interface ChatStateDependencies extends LoggerDependencies {
    sessionRepo: SessionRepository;
}

export interface PendingActionDependencies extends ChatStateDependencies {
    pendingActionRepo: PendingActionRepository;
}

export interface ForegroundPromptDependencies extends ChatStateDependencies {
    foregroundSessionTracker: ForegroundSessionTrackerLike;
    sendPromptUseCase: UseCaseExecutor<SendPromptInput, SendPromptResult>;
}

export interface AgentsFeatureDependencies extends ChatStateDependencies {
    listAgentsUseCase: UseCaseExecutor<ListAgentsInput, ListAgentsResult>;
    switchAgentUseCase: UseCaseExecutor<SwitchAgentInput, SwitchAgentResult>;
}

export interface ModelsFeatureDependencies extends ChatStateDependencies {
    listModelsUseCase: UseCaseExecutor<ListModelsInput, ListModelsResult>;
    switchModelUseCase: UseCaseExecutor<SwitchModelInput, SwitchModelResult>;
}

export interface SessionsFeatureDependencies extends PendingActionDependencies {
    listSessionsUseCase: UseCaseExecutor<ListSessionsInput, ListSessionsResult>;
    renameSessionUseCase: UseCaseExecutor<RenameSessionInput, RenameSessionResult>;
    switchSessionUseCase: UseCaseExecutor<SwitchSessionInput, SwitchSessionResult>;
}

export interface StatusFeatureDependencies extends ChatStateDependencies {
    getStatusUseCase: UseCaseExecutor<GetStatusInput, GetStatusResult>;
}

export interface SessionCreationDependencies extends ChatStateDependencies {
    createSessionUseCase: UseCaseExecutor<CreateSessionInput, CreateSessionResult>;
}

export interface AbortFeatureDependencies extends ChatStateDependencies {
    abortPromptUseCase: UseCaseExecutor<AbortPromptInput, AbortPromptResult>;
}

export interface UploadFeatureDependencies {
    uploadFileUseCase: UseCaseExecutor<UploadFileInput, PromptSessionFilePartInput>;
}

export interface BotDependencies {
    abortPromptUseCase: UseCaseExecutor<AbortPromptInput, AbortPromptResult>;
    createSessionUseCase: UseCaseExecutor<CreateSessionInput, CreateSessionResult>;
    foregroundSessionTracker: ForegroundSessionTrackerLike;
    getStatusUseCase: UseCaseExecutor<GetStatusInput, GetStatusResult>;
    listAgentsUseCase: UseCaseExecutor<ListAgentsInput, ListAgentsResult>;
    listLspUseCase: UseCaseExecutor<ListLspInput, ListLspResult>;
    listMcpUseCase: UseCaseExecutor<ListMcpInput, ListMcpResult>;
    logger: AppLogger;
    listModelsUseCase: UseCaseExecutor<ListModelsInput, ListModelsResult>;
    listSessionsUseCase: UseCaseExecutor<ListSessionsInput, ListSessionsResult>;
    pendingActionRepo: PendingActionRepository;
    renameSessionUseCase: UseCaseExecutor<RenameSessionInput, RenameSessionResult>;
    sessionRepo: SessionRepository;
    sendPromptUseCase: UseCaseExecutor<SendPromptInput, SendPromptResult>;
    switchAgentUseCase: UseCaseExecutor<SwitchAgentInput, SwitchAgentResult>;
    switchModelUseCase: UseCaseExecutor<SwitchModelInput, SwitchModelResult>;
    switchSessionUseCase: UseCaseExecutor<SwitchSessionInput, SwitchSessionResult>;
    uploadFileUseCase: UseCaseExecutor<UploadFileInput, PromptSessionFilePartInput>;
}

export type AgentsCallbackData = `agents:page:${number}` | `agents:select:${number}`;
export type LanguageCallbackData = `language:select:${BotLanguage}`;
export type SessionsCallbackData =
    | `sessions:page:${number}`
    | `sessions:pick:${number}:${string}`
    | `sessions:switch:${number}:${string}`
    | `sessions:rename:${number}:${string}`
    | `sessions:back:${number}`;
export type ModelCallbackData =
    | `model:page:${number}`
    | `model:pick:${number}`
    | `model:variant:${number}:${number}`;
export type PermissionApprovalCallbackData =
    | `permission:once:${string}`
    | `permission:always:${string}`
    | `permission:reject:${string}`;
