import type { Logger } from "pino";
import type { GetHealthUseCase } from "../use-cases/get-health.usecase.js";
import type { ListAgentsUseCase } from "../use-cases/list-agents.usecase.js";
import type { ListModelsUseCase } from "../use-cases/list-models.usecase.js";
import type { ListProjectsUseCase } from "../use-cases/list-projects.usecase.js";
import type { SendPromptUseCase } from "../use-cases/send-prompt.usecase.js";
import type { SwitchAgentUseCase } from "../use-cases/switch-agent.usecase.js";
import type { SwitchModelUseCase } from "../use-cases/switch-model.usecase.js";
import type { SwitchProjectUseCase } from "../use-cases/switch-project.usecase.js";

export interface BotDependencies {
    getHealthUseCase: GetHealthUseCase;
    listAgentsUseCase: ListAgentsUseCase;
    logger: Logger;
    listModelsUseCase: ListModelsUseCase;
    listProjectsUseCase: ListProjectsUseCase;
    sendPromptUseCase: SendPromptUseCase;
    switchAgentUseCase: SwitchAgentUseCase;
    switchModelUseCase: SwitchModelUseCase;
    switchProjectUseCase: SwitchProjectUseCase;
}

export type AgentsCallbackData = `agents:page:${number}` | `agents:select:${number}`;
export type ProjectsCallbackData = `projects:page:${number}` | `projects:select:${string}`;
export type ModelCallbackData =
    | `model:page:${number}`
    | `model:pick:${number}`
    | `model:variant:${number}:${number}`;
