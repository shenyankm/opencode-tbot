import { BOT_COPY, type BotCopy } from "../copy.js";

interface PresentedError {
    cause: string | null;
    message: string;
}

export function presentError(error: unknown, copy: BotCopy = BOT_COPY): string {
    const presented = normalizeError(error, copy);

    return presented.cause
        ? `${presented.message}\n${copy.errors.causeLabel}: ${presented.cause}`
        : presented.message;
}

function normalizeError(error: unknown, copy: BotCopy): PresentedError {
    if (isNamedError(error, "ProviderAuthError")) {
        return {
            message: copy.errors.providerAuth,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "MessageAbortedError")) {
        return {
            message: copy.errors.requestAborted,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "StructuredOutputError")) {
        return {
            message: copy.errors.structuredOutput,
            cause: joinNonEmptyParts([
                extractMessage(error.data),
                extractRetries(error.data),
            ]),
        };
    }

    if (isNamedError(error, "VoiceTranscriptionNotConfiguredError")) {
        return {
            message: copy.errors.voiceNotConfigured,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "TelegramFileDownloadError")) {
        return {
            message: copy.errors.voiceDownload,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "VoiceTranscriptionFailedError")) {
        return {
            message: copy.errors.voiceTranscription,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "VoiceTranscriptEmptyError")) {
        return {
            message: copy.errors.voiceEmpty,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "VoiceMessageUnsupportedError")) {
        return {
            message: copy.errors.voiceUnsupported,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "ImageFileDownloadError")) {
        return {
            message: copy.errors.imageDownload,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "ImageMessageUnsupportedError")) {
        return {
            message: copy.errors.imageUnsupported,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "MessageOutputLengthError")) {
        return {
            message: copy.errors.outputLength,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "ContextOverflowError")) {
        return {
            message: copy.errors.contextOverflow,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "APIError")) {
        return {
            message: copy.errors.providerRequest,
            cause: joinNonEmptyParts([
                extractMessage(error.data),
                extractStatusCode(error.data, copy),
                extractRetryable(error.data, copy),
            ]),
        };
    }

    if (isNamedError(error, "NotFoundError")) {
        return {
            message: copy.errors.notFound,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isBadRequestError(error)) {
        return {
            message: copy.errors.badRequest,
            cause: extractBadRequestCause(error),
        };
    }

    if (error instanceof Error) {
        return {
            message: error.name === "AbortError" ? copy.errors.requestAborted : copy.errors.unexpected,
            cause: error.message || null,
        };
    }

    return {
        message: copy.errors.unexpected,
        cause: extractMessage(error) ?? stringifyUnknown(error),
    };
}

function isBadRequestError(error: unknown): error is { data?: unknown; errors?: unknown[]; success: false } {
    return !!error
        && typeof error === "object"
        && "success" in error
        && (error as { success?: unknown }).success === false;
}

function isNamedError<TName extends string>(
    error: unknown,
    name: TName,
): error is { data?: unknown; name: TName } {
    return !!error
        && typeof error === "object"
        && "name" in error
        && (error as { name?: unknown }).name === name;
}

function extractBadRequestCause(error: { data?: unknown; errors?: unknown[] }): string | null {
    const directMessage = extractMessage(error.data);

    if (directMessage) {
        return directMessage;
    }

    const firstValidationError = Array.isArray(error.errors) && error.errors.length > 0
        ? stringifyUnknown(error.errors[0])
        : null;

    return firstValidationError;
}

function extractMessage(value: unknown): string | null {
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        return value.trim() || null;
    }

    if (typeof value === "object" && "message" in value) {
        const message = (value as { message?: unknown }).message;

        return typeof message === "string" && message.trim().length > 0
            ? message.trim()
            : null;
    }

    return null;
}

function extractRetries(value: unknown): string | null {
    if (!value || typeof value !== "object" || !("retries" in value)) {
        return null;
    }

    const retries = (value as { retries?: unknown }).retries;

    return typeof retries === "number" && Number.isFinite(retries)
        ? `retries: ${Math.round(retries)}`
        : null;
}

function extractRetryable(value: unknown, copy: BotCopy): string | null {
    if (!value || typeof value !== "object" || !("isRetryable" in value)) {
        return null;
    }

    const isRetryable = (value as { isRetryable?: unknown }).isRetryable;

    return typeof isRetryable === "boolean"
        ? `${copy.errors.retryableLabel}: ${isRetryable ? "yes" : "no"}`
        : null;
}

function extractStatusCode(value: unknown, copy: BotCopy): string | null {
    if (!value || typeof value !== "object" || !("statusCode" in value)) {
        return null;
    }

    const statusCode = (value as { statusCode?: unknown }).statusCode;

    return typeof statusCode === "number" && Number.isFinite(statusCode)
        ? `${copy.errors.statusCodeLabel}: ${Math.round(statusCode)}`
        : null;
}

function joinNonEmptyParts(parts: Array<string | null | undefined>): string | null {
    const filtered = parts
        .map((part) => part?.trim())
        .filter((part): part is string => !!part);

    return filtered.length > 0 ? filtered.join(" | ") : null;
}

function stringifyUnknown(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === "string") {
        return value.trim() || null;
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    try {
        const text = JSON.stringify(value);

        return text && text !== "{}" ? text : null;
    } catch {
        return null;
    }
}
