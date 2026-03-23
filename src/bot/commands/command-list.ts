import type { BotCommand } from "grammy/types";
import { getBotCopy, type BotLanguage } from "../copy.js";
import { getTelegramCommandDefinitions } from "./registry.js";

export function getTelegramCommands(language: BotLanguage = "en"): BotCommand[] {
    const copy = getBotCopy(language);

    return getTelegramCommandDefinitions().map((definition) => ({
        command: definition.names[0],
        description: definition.describe(copy),
    }));
}
