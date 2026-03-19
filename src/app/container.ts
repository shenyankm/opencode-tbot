import pino from "pino";
import { OpenRouter } from "@openrouter/sdk";
import type { BotDependencies } from "../bot/types.js";
import { SQLitePendingActionRepository } from "../repositories/pending-action.repo.js";
import { SQLiteSessionRepository } from "../repositories/session.repo.js";
import {
    createOpenCodeClientFromSdkClient,
    type OpenCodeClientLike,
    type OpenCodeSdkClientLike,
} from "../services/opencode/opencode.client.js";
import {
    DisabledVoiceTranscriptionClient,
    OpenRouterVoiceTranscriptionClient,
} from "../services/voice-transcription/openrouter-voice.client.js";
import { VoiceTranscriptionService } from "../services/voice-transcription/voice-transcription.service.js";
import { openSQLiteDatabase } from "../services/storage/sqlite.js";
import { TelegramFileClient } from "../services/telegram/telegram.client.js";
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
import type {
    AppOpenRouterConfig,
    AppConfig,
} from "./config.js";

export interface AppContainer extends BotDependencies {
    opencodeClient: OpenCodeClientLike;
    dispose(): void;
}

export function createAppContainer(
    config: AppConfig,
    client: OpenCodeSdkClientLike,
): AppContainer {
    return createContainer(config, createOpenCodeClientFromSdkClient(client));
}

function createContainer(
    config: AppConfig,
    opencodeClient: OpenCodeClientLike,
): AppContainer {
    const logger = pino({
        level: config.logLevel,
    });
    const stateDatabase = openSQLiteDatabase(config.botStateDbPath, logger);
    const pendingActionRepo = new SQLitePendingActionRepository(stateDatabase);
    const sessionRepo = new SQLiteSessionRepository(stateDatabase);
    const telegramFileClient = new TelegramFileClient({
        botToken: config.telegramBotToken,
    });
    const uploadFileUseCase = new UploadFileUseCase(telegramFileClient);
    const voiceTranscriptionService = new VoiceTranscriptionService(
        createVoiceTranscriptionClient(config.openrouter),
    );
    const abortPromptUseCase = new AbortPromptUseCase(sessionRepo, opencodeClient);
    const createSessionUseCase = new CreateSessionUseCase(sessionRepo, opencodeClient, logger);
    const getHealthUseCase = new GetHealthUseCase(opencodeClient);
    const getPathUseCase = new GetPathUseCase(opencodeClient);
    const listAgentsUseCase = new ListAgentsUseCase(sessionRepo, opencodeClient);
    const listLspUseCase = new ListLspUseCase(sessionRepo, opencodeClient);
    const listMcpUseCase = new ListMcpUseCase(sessionRepo, opencodeClient);
    const getStatusUseCase = new GetStatusUseCase(
        getHealthUseCase,
        getPathUseCase,
        listLspUseCase,
        listMcpUseCase,
    );
    const listModelsUseCase = new ListModelsUseCase(sessionRepo, opencodeClient);
    const listSessionsUseCase = new ListSessionsUseCase(sessionRepo, opencodeClient);
    const renameSessionUseCase = new RenameSessionUseCase(sessionRepo, opencodeClient, logger);
    const sendPromptUseCase = new SendPromptUseCase(sessionRepo, opencodeClient, logger);
    const switchAgentUseCase = new SwitchAgentUseCase(sessionRepo, opencodeClient, logger);
    const switchModelUseCase = new SwitchModelUseCase(sessionRepo, opencodeClient, logger);
    const switchSessionUseCase = new SwitchSessionUseCase(sessionRepo, opencodeClient, logger);
    let disposed = false;

    return {
        abortPromptUseCase,
        createSessionUseCase,
        logger,
        sessionRepo,
        pendingActionRepo,
        opencodeClient,
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
        voiceTranscriptionService,
        switchAgentUseCase,
        switchModelUseCase,
        switchSessionUseCase,
        telegramFileClient,
        uploadFileUseCase,
        dispose() {
            if (disposed) {
                return;
            }

            disposed = true;
            logger.info({ filePath: config.botStateDbPath }, "disposing telegram bot container");
            stateDatabase.close();
        },
    };
}

function createVoiceTranscriptionClient(config: AppOpenRouterConfig) {
    return config.configured && config.apiKey
        ? new OpenRouterVoiceTranscriptionClient(
            {
                model: config.model,
                timeoutMs: config.timeoutMs,
                transcriptionPrompt: config.transcriptionPrompt,
            },
            new OpenRouter({
                apiKey: config.apiKey,
                timeoutMs: config.timeoutMs,
            }),
        )
        : new DisabledVoiceTranscriptionClient();
}
