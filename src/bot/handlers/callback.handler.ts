import { registerThinkingCallbackRoute } from "./callbacks/thinking-callback.handler.js";
import type { Bot } from "grammy";
import { registerPromptStopRoute } from "./callbacks/prompt-stop.handler.js";
import type { PermissionApprovalRepository } from "../../domain/permission/approval.repository.js";
import type { OpenCodePermissionResponder } from "../../services/opencode/opencode.ports.js";
import type { BotDependencies } from "../types.js";
import {
    handleAgentsCallback,
    registerAgentsCallbackRoute,
} from "./callbacks/agents-callback.handler.js";
import {
    handleLanguageCallback,
    registerLanguageCallbackRoute,
} from "./callbacks/language-callback.handler.js";
import {
    handleModelsCallback,
    registerModelsCallbackRoute,
} from "./callbacks/models-callback.handler.js";
import {
    handlePermissionApprovalCallback,
    registerPermissionApprovalCallbackRoute,
} from "./callbacks/permission-approval-callback.handler.js";
import {
    handleSessionsCallback,
    registerSessionsCallbackRoute,
} from "./callbacks/sessions-callback.handler.js";

type CallbackRegistrationDependencies = BotDependencies & {
    opencodeClient: OpenCodePermissionResponder;
    permissionApprovalRepo: PermissionApprovalRepository;
};

const CALLBACK_ROUTE_REGISTRARS: Array<
    (bot: Pick<Bot, "callbackQuery">, dependencies: CallbackRegistrationDependencies) => void
> = [
    registerPromptStopRoute,
    registerThinkingCallbackRoute,
    registerAgentsCallbackRoute,
    registerSessionsCallbackRoute,
    registerModelsCallbackRoute,
    registerLanguageCallbackRoute,
    registerPermissionApprovalCallbackRoute,
];

export function registerCallbackHandler(
    bot: Pick<Bot, "callbackQuery">,
    dependencies: CallbackRegistrationDependencies,
): void {
    for (const registerRoute of CALLBACK_ROUTE_REGISTRARS) {
        registerRoute(bot, dependencies);
    }
}

export {
    handleAgentsCallback,
    handleLanguageCallback,
    handleModelsCallback,
    handlePermissionApprovalCallback,
    handleSessionsCallback,
};
