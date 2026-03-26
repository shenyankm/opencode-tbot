import { Bot, GrammyError, HttpError } from "grammy";

export type TelegramStartupErrorCode =
    | "invalid_token"
    | "telegram_api_rejected"
    | "telegram_api_unreachable";

export interface TelegramBotProfile {
    id: number;
    username: string | null;
}

export interface ValidateTelegramBotAccessInput {
    apiRoot: string;
    botFactory?: (token: string, options: ConstructorParameters<typeof Bot>[1]) => Bot;
    botToken: string;
}

export interface ValidateTelegramBotAccessResult {
    apiRoot: string;
    botProfile: TelegramBotProfile;
    botToken: string;
}

export class TelegramStartupError extends Error {
    readonly code: TelegramStartupErrorCode;
    readonly data: {
        apiRoot: string;
    };

    constructor(
        code: TelegramStartupErrorCode,
        message: string,
        data: {
            apiRoot: string;
        },
    ) {
        super(message);
        this.name = "TelegramStartupError";
        this.code = code;
        this.data = data;
    }
}

const TELEGRAM_BOT_TOKEN_PATTERN = /^\d{6,}:[A-Za-z0-9_-]{20,}$/u;

export function normalizeTelegramBotToken(value: string): string {
    const normalized = value.trim();

    if (normalized.length === 0) {
        throw new Error("Telegram bot token is required.");
    }

    if (!TELEGRAM_BOT_TOKEN_PATTERN.test(normalized)) {
        throw new TelegramStartupError(
            "invalid_token",
            "Telegram bot token format is invalid. Expected '<bot-id>:<secret>'.",
            {
                apiRoot: "",
            },
        );
    }

    return normalized;
}

export function normalizeTelegramApiRoot(value: string): string {
    const normalized = value.trim();

    if (normalized.length === 0) {
        throw new Error("Telegram API root is required.");
    }

    try {
        const url = new URL(normalized);

        return url.toString().replace(/\/+$/u, "");
    } catch {
        throw new Error("Telegram API root must be a valid URL.");
    }
}

export async function validateTelegramBotAccess(
    input: ValidateTelegramBotAccessInput,
): Promise<ValidateTelegramBotAccessResult> {
    const botToken = normalizeTelegramBotToken(input.botToken);
    const apiRoot = normalizeTelegramApiRoot(input.apiRoot);
    const botFactory = input.botFactory ?? ((token, options) => new Bot(token, options));
    const bot = botFactory(botToken, {
        client: {
            apiRoot,
        },
    });
    const botProfile = await validateTelegramBotAccessWithBot(bot, apiRoot);

    return {
        apiRoot,
        botProfile,
        botToken,
    };
}

export async function validateTelegramBotAccessWithBot(
    bot: Bot,
    apiRoot: string,
): Promise<TelegramBotProfile> {
    const normalizedApiRoot = normalizeTelegramApiRoot(apiRoot);

    try {
        const botProfile = await bot.api.getMe();

        return {
            id: botProfile.id,
            username: botProfile.username ?? null,
        };
    } catch (error) {
        throw createTelegramStartupError(error, normalizedApiRoot);
    }
}

export function createTelegramStartupError(error: unknown, apiRoot: string): Error {
    if (error instanceof TelegramStartupError) {
        return error;
    }

    if (error instanceof GrammyError) {
        if (error.error_code === 401 || error.error_code === 403) {
            return new TelegramStartupError(
                "invalid_token",
                `Telegram bot token is invalid or revoked (${error.description}).`,
                {
                    apiRoot,
                },
            );
        }

        return new TelegramStartupError(
            "telegram_api_rejected",
            `Telegram Bot API rejected startup validation via '${error.method}' ` +
            `(${error.error_code}: ${error.description}).`,
            {
                apiRoot,
            },
        );
    }

    if (error instanceof HttpError) {
        const cause = error.error instanceof Error && error.error.message.trim().length > 0
            ? ` ${error.error.message.trim()}`
            : "";

        return new TelegramStartupError(
            "telegram_api_unreachable",
            `Unable to reach the Telegram Bot API at ${apiRoot}.${cause}`,
            {
                apiRoot,
            },
        );
    }

    return error instanceof Error
        ? error
        : new Error(String(error));
}
