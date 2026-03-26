import type { Bot } from "grammy";
import type { BotCopy } from "../copy.js";
import type { BotDependencies } from "../types.js";
import { AGENTS_COMMAND_DEFINITION } from "./agents.js";
import { CANCEL_COMMAND_DEFINITION } from "./cancel.js";
import { LANGUAGE_COMMAND_DEFINITION } from "./language.js";
import { MODELS_COMMAND_DEFINITION } from "./models.js";
import { NEW_COMMAND_DEFINITION } from "./new.js";
import { SESSIONS_COMMAND_DEFINITION } from "./sessions.js";
import { START_COMMAND_DEFINITION } from "./start.js";
import { STATUS_COMMAND_DEFINITION } from "./status.js";
import { TOKEN_COMMAND_DEFINITION } from "./token.js";

export interface TelegramCommandDefinition {
    describe(copy: BotCopy): string;
    names: readonly [string, ...string[]];
    register(bot: Pick<Bot, "command">, dependencies: BotDependencies): void;
}

export function getTelegramCommandDefinitions(): readonly TelegramCommandDefinition[] {
    return [
        START_COMMAND_DEFINITION,
        STATUS_COMMAND_DEFINITION,
        NEW_COMMAND_DEFINITION,
        AGENTS_COMMAND_DEFINITION,
        SESSIONS_COMMAND_DEFINITION,
        CANCEL_COMMAND_DEFINITION,
        MODELS_COMMAND_DEFINITION,
        TOKEN_COMMAND_DEFINITION,
        LANGUAGE_COMMAND_DEFINITION,
    ];
}

export function registerTelegramCommands(
    bot: Pick<Bot, "command">,
    dependencies: BotDependencies,
): void {
    for (const definition of getTelegramCommandDefinitions()) {
        definition.register(bot, dependencies);
    }
}
