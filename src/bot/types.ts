import type { PendingActionRepository } from "../domain/pending-action/pending-action.repository.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import type { AppLogger } from "../infra/logger/index.js";
import type { TelegramFileClientLike } from "../services/telegram/telegram.client.js";
import type { UploadFileUseCase } from "../use-cases/upload-file.usecase.js";
import type { CreateSessionUseCase } from "../use-cases/create-session.usecase.js";
import type { GetHealthUseCase } from "../use-cases/get-health.usecase.js";
import type { GetPathUseCase } from "../use-cases/get-path.usecase.js";
import type { AbortPromptUseCase } from "../use-cases/abort-prompt.usecase.js";
import type { GetStatusUseCase } from "../use-cases/get-status.usecase.js";
import type { ListAgentsUseCase } from "../use-cases/list-agents.usecase.js";
import type { ListLspUseCase } from "../use-cases/list-lsp.usecase.js";
import type { ListMcpUseCase } from "../use-cases/list-mcp.usecase.js";
import type { ListModelsUseCase } from "../use-cases/list-models.usecase.js";
import type { ListSessionsUseCase } from "../use-cases/list-sessions.usecase.js";
import type { SendPromptUseCase } from "../use-cases/send-prompt.usecase.js";
import type { RenameSessionUseCase } from "../use-cases/rename-session.usecase.js";
import type { SwitchAgentUseCase } from "../use-cases/switch-agent.usecase.js";
import type { SwitchModelUseCase } from "../use-cases/switch-model.usecase.js";
import type { SwitchSessionUseCase } from "../use-cases/switch-session.usecase.js";
import type { BotLanguage } from "./copy.js";

export interface BotDependencies {
    abortPromptUseCase: AbortPromptUseCase;
    createSessionUseCase: CreateSessionUseCase;
    getHealthUseCase: GetHealthUseCase;
    getPathUseCase: GetPathUseCase;
    getStatusUseCase: GetStatusUseCase;
    listAgentsUseCase: ListAgentsUseCase;
    listLspUseCase: ListLspUseCase;
    listMcpUseCase: ListMcpUseCase;
    logger: AppLogger;
    listModelsUseCase: ListModelsUseCase;
    listSessionsUseCase: ListSessionsUseCase;
    pendingActionRepo: PendingActionRepository;
    renameSessionUseCase: RenameSessionUseCase;
    sessionRepo: SessionRepository;
    sendPromptUseCase: SendPromptUseCase;
    switchAgentUseCase: SwitchAgentUseCase;
    switchModelUseCase: SwitchModelUseCase;
    switchSessionUseCase: SwitchSessionUseCase;
    telegramFileClient: TelegramFileClientLike;
    uploadFileUseCase: UploadFileUseCase;
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
