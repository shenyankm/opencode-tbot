import pino from "pino";
import { config } from "./config.js";
import { SQLitePendingActionRepository } from "../repositories/pending-action.repo.js";
import { SQLiteSessionRepository } from "../repositories/session.repo.js";
import { OpenCodeClient } from "../services/opencode/opencode.client.js";
import {
    DisabledSttClient,
    OpenAiCompatibleSttClient,
} from "../services/stt/stt.client.js";
import { SttService } from "../services/stt/stt.service.js";
import { openSQLiteDatabase } from "../services/storage/sqlite.js";
import { TelegramFileClient } from "../services/telegram/telegram.client.js";
import { AbortPromptUseCase } from "../use-cases/abort-prompt.usecase.js";
import { CreateSessionUseCase } from "../use-cases/create-session.usecase.js";
import { GetHealthUseCase } from "../use-cases/get-health.usecase.js";
import { GetPathUseCase } from "../use-cases/get-path.usecase.js";
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

const logger = pino({
    level: config.logLevel,
});

const stateDatabase = openSQLiteDatabase(config.botStateDbPath, logger);
const pendingActionRepo = new SQLitePendingActionRepository(stateDatabase);
const sessionRepo = new SQLiteSessionRepository(stateDatabase);
const opencodeClient = new OpenCodeClient({
    baseUrl: config.opencodeBaseUrl,
    apiKey: config.opencodeApiKey,
});
const telegramFileClient = new TelegramFileClient({
    botToken: config.telegramBotToken,
});
const uploadFileUseCase = new UploadFileUseCase(telegramFileClient);
const sttClient = config.stt.configured && config.stt.baseUrl && config.stt.model
    ? new OpenAiCompatibleSttClient({
        baseUrl: config.stt.baseUrl,
        apiKey: config.stt.apiKey,
        model: config.stt.model,
        timeoutMs: config.stt.timeoutMs,
        language: config.stt.language,
        prompt: config.stt.prompt,
    })
    : new DisabledSttClient();
const sttService = new SttService(sttClient);
const abortPromptUseCase = new AbortPromptUseCase(sessionRepo, opencodeClient);
const createSessionUseCase = new CreateSessionUseCase(sessionRepo, opencodeClient, logger);
const getHealthUseCase = new GetHealthUseCase(opencodeClient);
const getPathUseCase = new GetPathUseCase(opencodeClient);
const listAgentsUseCase = new ListAgentsUseCase(sessionRepo, opencodeClient);
const listLspUseCase = new ListLspUseCase(sessionRepo, opencodeClient);
const listMcpUseCase = new ListMcpUseCase(sessionRepo, opencodeClient);
const listModelsUseCase = new ListModelsUseCase(sessionRepo, opencodeClient);
const listSessionsUseCase = new ListSessionsUseCase(sessionRepo, opencodeClient);
const renameSessionUseCase = new RenameSessionUseCase(sessionRepo, opencodeClient, logger);
const sendPromptUseCase = new SendPromptUseCase(sessionRepo, opencodeClient, logger);
const switchAgentUseCase = new SwitchAgentUseCase(sessionRepo, opencodeClient, logger);
const switchModelUseCase = new SwitchModelUseCase(sessionRepo, opencodeClient, logger);
const switchSessionUseCase = new SwitchSessionUseCase(sessionRepo, opencodeClient, logger);

export const container = {
    abortPromptUseCase,
    createSessionUseCase,
    logger,
    sessionRepo,
    pendingActionRepo,
    opencodeClient,
    getHealthUseCase,
    getPathUseCase,
    listAgentsUseCase,
    listLspUseCase,
    listMcpUseCase,
    listModelsUseCase,
    listSessionsUseCase,
    renameSessionUseCase,
    sendPromptUseCase,
    sttService,
    switchAgentUseCase,
    switchModelUseCase,
    switchSessionUseCase,
    telegramFileClient,
    uploadFileUseCase,
};
