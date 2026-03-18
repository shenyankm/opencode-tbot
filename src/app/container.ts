import pino from "pino";
import { config } from "./config.js";
import { InMemorySessionRepository } from "../repositories/session.repo.js";
import { OpenCodeClient } from "../services/opencode/opencode.client.js";
import { GetConfigUseCase } from "../use-cases/get-config.usecase.js";
import { GetHealthUseCase } from "../use-cases/get-health.usecase.js";
import { GetPathUseCase } from "../use-cases/get-path.usecase.js";
import { ListAgentsUseCase } from "../use-cases/list-agents.usecase.js";
import { ListModelsUseCase } from "../use-cases/list-models.usecase.js";
import { ListProjectsUseCase } from "../use-cases/list-projects.usecase.js";
import { ListSessionsUseCase } from "../use-cases/list-sessions.usecase.js";
import { SendPromptUseCase } from "../use-cases/send-prompt.usecase.js";
import { SwitchAgentUseCase } from "../use-cases/switch-agent.usecase.js";
import { SwitchModelUseCase } from "../use-cases/switch-model.usecase.js";
import { SwitchProjectUseCase } from "../use-cases/switch-project.usecase.js";
import { SwitchSessionUseCase } from "../use-cases/switch-session.usecase.js";

const logger = pino({
    level: config.logLevel,
});

const sessionRepo = new InMemorySessionRepository();
const opencodeClient = new OpenCodeClient({
    baseUrl: config.opencodeBaseUrl,
    apiKey: config.opencodeApiKey,
});
const getHealthUseCase = new GetHealthUseCase(opencodeClient);
const getPathUseCase = new GetPathUseCase(opencodeClient);
const getConfigUseCase = new GetConfigUseCase(opencodeClient);
const listAgentsUseCase = new ListAgentsUseCase(sessionRepo, opencodeClient);
const listModelsUseCase = new ListModelsUseCase(sessionRepo, opencodeClient);
const listProjectsUseCase = new ListProjectsUseCase(sessionRepo, opencodeClient);
const listSessionsUseCase = new ListSessionsUseCase(sessionRepo, opencodeClient);
const sendPromptUseCase = new SendPromptUseCase(sessionRepo, opencodeClient, logger);
const switchAgentUseCase = new SwitchAgentUseCase(sessionRepo, opencodeClient, logger);
const switchModelUseCase = new SwitchModelUseCase(sessionRepo, opencodeClient, logger);
const switchProjectUseCase = new SwitchProjectUseCase(sessionRepo, opencodeClient, logger);
const switchSessionUseCase = new SwitchSessionUseCase(sessionRepo, opencodeClient, logger);

export const container = {
    logger,
    sessionRepo,
    opencodeClient,
    getHealthUseCase,
    getPathUseCase,
    getConfigUseCase,
    listAgentsUseCase,
    listModelsUseCase,
    listProjectsUseCase,
    listSessionsUseCase,
    sendPromptUseCase,
    switchAgentUseCase,
    switchModelUseCase,
    switchProjectUseCase,
    switchSessionUseCase,
};
