import { randomUUID } from "node:crypto";
import { FileThinkingMessageRepository } from "../repositories/thinking-message.repo.js";
import { TelegramThinkingMessages } from "../services/telegram/thinking-messages.js";
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
import {
    createStatusSectionProviders,
    GetStatusUseCase,
} from "../use-cases/get-status.usecase.js";
import { GetContextUsageUseCase } from "../use-cases/get-context-usage.usecase.js";
import { TelegramContextFooter } from "../services/telegram/context-footer.js";
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
    contextFooter: TelegramContextFooter;
    getHealthUseCase: GetHealthUseCase;
    getPathUseCase: GetPathUseCase;
    listLspUseCase: ListLspUseCase;
    listMcpUseCase: ListMcpUseCase;
    opencodeClient: OpenCodeClientLike;
    foregroundSessionTracker: ForegroundSessionTracker;
    permissionApprovalRepo: PermissionApprovalRepository;
    dispose(): Promise<void>;
}

type ContainerLogger = BotDependencies["logger"];

type ContainerRepositories = Pick<
    AppContainer,
    "pendingActionRepo" | "permissionApprovalRepo" | "sessionRepo"
>;

type ContainerRuntimeServices = Pick<
    AppContainer,
    "foregroundSessionTracker" | "uploadFileUseCase" | "thinkingMessages"
>;

type ContainerUseCases = Pick<
    AppContainer,
    | "abortPromptUseCase"
    | "createSessionUseCase"
    | "getHealthUseCase"
    | "getPathUseCase"
    | "getStatusUseCase"
    | "listAgentsUseCase"
    | "listLspUseCase"
    | "listMcpUseCase"
    | "listModelsUseCase"
    | "listSessionsUseCase"
    | "renameSessionUseCase"
    | "sendPromptUseCase"
    | "switchAgentUseCase"
    | "switchModelUseCase"
    | "switchSessionUseCase"
>;

interface CreateUseCasesInput extends ContainerRepositories, ContainerRuntimeServices {
    logger: ContainerLogger;
    opencodeClient: OpenCodeClientLike;
}

export function createAppContainer(
    config: AppConfig,
    client: OpenCodeSdkClientLike,
): AppContainer {
    const runtimeId = randomUUID();
    const logger = createOpenCodeAppLogger({
        file: {
            dir: config.loggingFileDir,
            retention: {
                maxFiles: config.loggingRetentionMaxFiles,
                maxTotalBytes: config.loggingRetentionMaxTotalBytes,
            },
        },
        level: config.loggingLevel,
        runtimeId,
        sinks: {
            file: config.loggingFileSinkEnabled,
            host: config.loggingHostSinkEnabled,
        },
        worktree: config.worktreePath,
    });

    return createContainer(
        config,
        createOpenCodeClientFromSdkClient(
            client,
            {
                waitTimeoutMs: config.promptWaitTimeoutMs,
                pollRequestTimeoutMs: config.promptPollRequestTimeoutMs,
                recoveryInactivityTimeoutMs: config.promptRecoveryInactivityTimeoutMs,
            },
        ),
        logger,
    );
}

function createContainer(
    config: AppConfig,
    opencodeClient: OpenCodeClientLike,
    logger: ContainerLogger,
): AppContainer {
    const storageLogger = logger.child({ component: "storage" });
    const repositories = createContainerRepositories(config);
    const runtimeServices = createContainerRuntimeServices(config);
    const useCases = createContainerUseCases({
        ...repositories,
        ...runtimeServices,
        logger,
        opencodeClient,
    });
    let disposed = false;
    const contextFooter = new TelegramContextFooter(
        new GetContextUsageUseCase(repositories.sessionRepo, opencodeClient),
        repositories.sessionRepo,
        logger,
    );

    return {
        ...useCases,
        contextFooter,
        logger,
        ...repositories,
        ...runtimeServices,
        opencodeClient,
        async dispose() {
            if (disposed) {
                return;
            }

            disposed = true;
            runtimeServices.foregroundSessionTracker.dispose();
            contextFooter.clear();
            storageLogger.info(
                {
                    event: "storage.container.disposed",
                    filePath: config.stateFilePath,
                },
                "disposing telegram bot container",
            );
            await logger.flush();
        },
    };
}

function createContainerRepositories(config: AppConfig): ContainerRepositories {
    const stateStore = new JsonStateStore({
        filePath: config.stateFilePath,
        createDefaultState: createDefaultOpencodeTbotState,
    });

    return {
        pendingActionRepo: new FilePendingActionRepository(stateStore),
        permissionApprovalRepo: new FilePermissionApprovalRepository(stateStore),
        sessionRepo: new FileSessionRepository(stateStore),
    };
}

function createContainerRuntimeServices(config: AppConfig): ContainerRuntimeServices {
    const telegramFileClient = new TelegramFileClient({
        botToken: config.telegramBotToken,
        apiRoot: config.telegramApiRoot,
    });

    return {
        foregroundSessionTracker: new ForegroundSessionTracker(),
        thinkingMessages: new TelegramThinkingMessages(new FileThinkingMessageRepository(`${config.stateFilePath}.thinking`)),
        uploadFileUseCase: new UploadFileUseCase(telegramFileClient),
    };
}

function createContainerUseCases(input: CreateUseCasesInput): ContainerUseCases {
    const opencodeLogger = input.logger.child({ component: "opencode" });
    const promptLogger = input.logger.child({ component: "prompt" });
    const abortPromptUseCase = new AbortPromptUseCase(
        input.sessionRepo,
        input.opencodeClient,
        input.foregroundSessionTracker,
    );
    const createSessionUseCase = new CreateSessionUseCase(
        input.sessionRepo,
        input.opencodeClient,
        opencodeLogger,
    );
    const getHealthUseCase = new GetHealthUseCase(input.opencodeClient);
    const getPathUseCase = new GetPathUseCase(input.opencodeClient);
    const listAgentsUseCase = new ListAgentsUseCase(input.sessionRepo, input.opencodeClient);
    const listLspUseCase = new ListLspUseCase(input.sessionRepo, input.opencodeClient);
    const listMcpUseCase = new ListMcpUseCase(input.sessionRepo, input.opencodeClient);
    const listSessionsUseCase = new ListSessionsUseCase(input.sessionRepo, input.opencodeClient);
    const getStatusUseCase = new GetStatusUseCase(createStatusSectionProviders({
        configuredPluginReader: input.opencodeClient,
        getHealthUseCase,
        getPathUseCase,
        listLspUseCase,
        listMcpUseCase,
        listSessionsUseCase,
        sessionRepo: input.sessionRepo,
    }));
    const listModelsUseCase = new ListModelsUseCase(input.sessionRepo, input.opencodeClient);
    const renameSessionUseCase = new RenameSessionUseCase(
        input.sessionRepo,
        input.opencodeClient,
        opencodeLogger,
    );
    const sendPromptUseCase = new SendPromptUseCase(
        input.sessionRepo,
        input.opencodeClient,
        promptLogger,
    );
    const switchAgentUseCase = new SwitchAgentUseCase(
        input.sessionRepo,
        input.opencodeClient,
        opencodeLogger,
    );
    const switchModelUseCase = new SwitchModelUseCase(
        input.sessionRepo,
        input.opencodeClient,
        opencodeLogger,
    );
    const switchSessionUseCase = new SwitchSessionUseCase(
        input.sessionRepo,
        input.opencodeClient,
        opencodeLogger,
    );

    return {
        abortPromptUseCase,
        createSessionUseCase,
        getHealthUseCase,
        getPathUseCase,
        getStatusUseCase,
        listAgentsUseCase,
        listLspUseCase,
        listMcpUseCase,
        listModelsUseCase,
        listSessionsUseCase,
        renameSessionUseCase,
        sendPromptUseCase,
        switchAgentUseCase,
        switchModelUseCase,
        switchSessionUseCase,
    };
}
