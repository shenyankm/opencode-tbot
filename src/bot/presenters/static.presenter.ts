import { BOT_COPY, type BotCopy } from "../copy.js";

export function presentStartMarkdownMessage(copy: BotCopy = BOT_COPY): string {
    return copy.start.lines.join("\n");
}
