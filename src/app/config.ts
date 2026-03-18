import "dotenv/config";
import { resolve } from "node:path";
import { z } from "zod";

const ConfigSchema = z.object({
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    TELEGRAM_ALLOWED_CHAT_IDS: z.string().default(""),
    OPENCODE_BASE_URL: z.string().url(),
    OPENCODE_API_KEY: z.string().default(""),
    LOG_LEVEL: z.string().default("info"),
    BOT_STATE_DB_PATH: z.string().default("./data/opencode-tbot.sqlite"),
});

const parsed = ConfigSchema.safeParse(process.env);

if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten());
    process.exit(1);
}

const allowedChatIds = parsed.data.TELEGRAM_ALLOWED_CHAT_IDS
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => Number(v))
    .filter((v) => !Number.isNaN(v));

export const config = {
    telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
    telegramAllowedChatIds: allowedChatIds,
    opencodeBaseUrl: parsed.data.OPENCODE_BASE_URL,
    opencodeApiKey: parsed.data.OPENCODE_API_KEY,
    logLevel: parsed.data.LOG_LEVEL,
    botStateDbPath: resolve(parsed.data.BOT_STATE_DB_PATH),
};
