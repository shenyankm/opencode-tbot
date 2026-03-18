import pino from "pino";
import { config } from "./config.js";
import { InMemorySessionRepository } from "../repositories/session.repo.js";
import { OpenCodeClient } from "../services/opencode/opencode.client.js";
import { ListProjectsUseCase } from "../use-cases/list-projects.usecase.js";
import { SendPromptUseCase } from "../use-cases/send-prompt.usecase.js";
import { SwitchProjectUseCase } from "../use-cases/switch-project.usecase.js";

const logger = pino({
    level: config.logLevel,
});

const sessionRepo = new InMemorySessionRepository();
const opencodeClient = new OpenCodeClient({
    baseUrl: config.opencodeBaseUrl,
    apiKey: config.opencodeApiKey,
});
const listProjectsUseCase = new ListProjectsUseCase(sessionRepo, opencodeClient);
const sendPromptUseCase = new SendPromptUseCase(sessionRepo, opencodeClient, logger);
const switchProjectUseCase = new SwitchProjectUseCase(sessionRepo, opencodeClient, logger);

export const container = {
    logger,
    sessionRepo,
    opencodeClient,
    listProjectsUseCase,
    sendPromptUseCase,
    switchProjectUseCase,
};
