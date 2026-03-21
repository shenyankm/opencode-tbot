import type { BotDependencies } from "../bot/types.js";
import type { PermissionApprovalRepository } from "../domain/permission/approval.repository.js";
import { createOpenCodeAppLogger } from "../infra/logger/index.js";
import { FilePendingActionRepository } from "../repositories/pending-action.repo.js";
import { FilePermissionApprovalRepository } from "../repositories/permission-approval.repo.js";
import { FileSessionRepository } from "../repositories/session.repo.js";
import {
    createOpenCodeClientFromSdkClient,
    type OpenCodeClientLike,
    type OpenCodeSdkClientLike,
} from "../services/opencode/opencode.client.js";
import { createDefaultOpencodeTbotState } from "../services/storage/bot-state.js";
import { JsonStateStore } from "../services/storage/json-state-store.js";
import { TelegramFileClient } from "../services/telegram/telegram.client.js";
import { ForegroundSessionTracker } from "../services/session-activity/foreground-session-tracker.js";
import { AbortPromptUseCase } from "../use-cases/abort-prompt.usecase.js";
import { CreateSessionUseCase } from "../use-cases/create-session.usecase.js";
import { GetHealthUseCase } from "../use-cases/get-health.usecase.js";
import { GetPathUseCase } from "../use-cases/get-path.usecase.js";
import { GetStatusUseCase } from "../use-cases/get-status.usecase.js";
import { ListAgentsUseCase } from "../use-cases/list-agents.usecase.js";
import { ListLspUseCase } from "../use-cases/list-lsp.usecase.js";
import { ListMcpUseCase } from "../use-cases/list-mcp.usecase.js";
import { ListModelsUseCase } from "../use-cases/list-models.usecase.js";
import { ListSessionsUseCase } from "../use-cases/list-sessions.usecase.js";
import { RenameSessionUseCase } from "../use-cases/rename-session.usecase.js";
import { SendPromptUseCase } from "../use-cases/send-prompt.usecase.js";
import { SwitchAgentUseCase } from "../use-cases/switch-agent.usecase.js";
import { SwitchModelUseCase } from "../use-cases/switch-model.usecase.js";
import { SwitchSessionUseCase } from "../use-cases/switch-session.usecase.js";
import { UploadFileUseCase } from "../use-cases/upload-file.usecase.js";
import type { AppConfig } from "./config.js";

export interface AppContainer extends BotDependencies {
    opencodeClient: OpenCodeClientLike;
    foregroundSessionTracker: ForegroundSessionTracker;
    permissionApprovalRepo: PermissionApprovalRepository;
    dispose(): Promise<void>;
}

export function createAppContainer(
    config: AppConfig,
    client: OpenCodeSdkClientLike,
): AppContainer {
    const logger = createOpenCodeAppLogger(client, {
        level: config.logLevel,
    });

    return createContainer(config, createOpenCodeClientFromSdkClient(client), logger);
}

function createContainer(
    config: AppConfig,
    opencodeClient: OpenCodeClientLike,
    logger: BotDependencies["logger"],
): AppContainer {
    const stateStore = new JsonStateStore({
        filePath: config.stateFilePath,
        createDefaultState: createDefaultOpencodeTbotState,
    });
    const pendingActionRepo = new FilePendingActionRepository(stateStore);
    const permissionApprovalRepo = new FilePermissionApprovalRepository(stateStore);
    const sessionRepo = new FileSessionRepository(stateStore);
    const foregroundSessionTracker = new ForegroundSessionTracker();
    const telegramFileClient = new TelegramFileClient({
        botToken: config.telegramBotToken,
        apiRoot: config.telegramApiRoot,
    });
    const uploadFileUseCase = new UploadFileUseCase(telegramFileClient);
    const abortPromptUseCase = new AbortPromptUseCase(
        sessionRepo,
        opencodeClient,
        foregroundSessionTracker,
    );
    const createSessionUseCase = new CreateSessionUseCase(sessionRepo, opencodeClient, logger);
    const getHealthUseCase = new GetHealthUseCase(opencodeClient);
    const getPathUseCase = new GetPathUseCase(opencodeClient);
    const listAgentsUseCase = new ListAgentsUseCase(sessionRepo, opencodeClient);
    const listLspUseCase = new ListLspUseCase(sessionRepo, opencodeClient);
    const listMcpUseCase = new ListMcpUseCase(sessionRepo, opencodeClient);
    const listSessionsUseCase = new ListSessionsUseCase(sessionRepo, opencodeClient);
    const getStatusUseCase = new GetStatusUseCase(
        getHealthUseCase,
        getPathUseCase,
        listLspUseCase,
        listMcpUseCase,
        listSessionsUseCase,
        sessionRepo,
    );
    const listModelsUseCase = new ListModelsUseCase(sessionRepo, opencodeClient);
    const renameSessionUseCase = new RenameSessionUseCase(sessionRepo, opencodeClient, logger);
    const sendPromptUseCase = new SendPromptUseCase(
        sessionRepo,
        opencodeClient,
        logger,
        foregroundSessionTracker,
    );
    const switchAgentUseCase = new SwitchAgentUseCase(sessionRepo, opencodeClient, logger);
    const switchModelUseCase = new SwitchModelUseCase(sessionRepo, opencodeClient, logger);
    const switchSessionUseCase = new SwitchSessionUseCase(sessionRepo, opencodeClient, logger);
    let disposed = false;

    return {
        abortPromptUseCase,
        createSessionUseCase,
        getHealthUseCase,
        getPathUseCase,
        getStatusUseCase,
        listAgentsUseCase,
        listLspUseCase,
        listMcpUseCase,
        logger,
        listModelsUseCase,
        listSessionsUseCase,
        pendingActionRepo,
        renameSessionUseCase,
        sessionRepo,
        sendPromptUseCase,
        switchAgentUseCase,
        switchModelUseCase,
        switchSessionUseCase,
        telegramFileClient,
        uploadFileUseCase,
        opencodeClient,
        foregroundSessionTracker,
        permissionApprovalRepo,
        async dispose() {
            if (disposed) {
                return;
            }

            disposed = true;
            logger.info({ filePath: config.stateFilePath }, "disposing telegram bot container");
            await logger.flush();
        },
    };
}
