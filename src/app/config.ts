import "dotenv/config";
import { resolve } from "node:path";
import { z } from "zod";

const OptionalUrlSchema = z.union([z.literal(""), z.string().url()]).default("");

const ConfigSchema = z.object({
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    TELEGRAM_ALLOWED_CHAT_IDS: z.string().default(""),
    OPENCODE_BASE_URL: z.string().url(),
    OPENCODE_API_KEY: z.string().default(""),
    LOG_LEVEL: z.string().default("info"),
    BOT_STATE_DB_PATH: z.string().default("./data/opencode-tbot.sqlite"),
    STT_BASE_URL: OptionalUrlSchema,
    STT_API_KEY: z.string().default(""),
    STT_MODEL: z.string().default(""),
    STT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    STT_LANGUAGE: z.string().default(""),
    STT_PROMPT: z.string().default(""),
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

const sttBaseUrl = normalizeOptionalString(parsed.data.STT_BASE_URL);
const sttApiKey = normalizeOptionalString(parsed.data.STT_API_KEY);
const sttModel = normalizeOptionalString(parsed.data.STT_MODEL);
const sttLanguage = normalizeOptionalString(parsed.data.STT_LANGUAGE);
const sttPrompt = normalizeOptionalString(parsed.data.STT_PROMPT);

export const config = {
    telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
    telegramAllowedChatIds: allowedChatIds,
    opencodeBaseUrl: parsed.data.OPENCODE_BASE_URL,
    opencodeApiKey: parsed.data.OPENCODE_API_KEY,
    logLevel: parsed.data.LOG_LEVEL,
    botStateDbPath: resolve(parsed.data.BOT_STATE_DB_PATH),
    stt: {
        configured: !!(sttBaseUrl && sttModel),
        baseUrl: sttBaseUrl,
        apiKey: sttApiKey,
        model: sttModel,
        timeoutMs: parsed.data.STT_TIMEOUT_MS,
        language: sttLanguage,
        prompt: sttPrompt,
    },
};

function normalizeOptionalString(value: string): string | null {
    const normalized = value.trim();

    return normalized.length > 0 ? normalized : null;
}
