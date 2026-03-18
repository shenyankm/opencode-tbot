import type { Logger } from "pino";
import type { ListProjectsUseCase } from "../use-cases/list-projects.usecase.js";
import type { SendPromptUseCase } from "../use-cases/send-prompt.usecase.js";
import type { SwitchProjectUseCase } from "../use-cases/switch-project.usecase.js";

export interface BotDependencies {
    logger: Logger;
    listProjectsUseCase: ListProjectsUseCase;
    sendPromptUseCase: SendPromptUseCase;
    switchProjectUseCase: SwitchProjectUseCase;
}

export type ProjectsCallbackData = `projects:page:${number}` | `projects:select:${string}`;
