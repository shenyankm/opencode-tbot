import { BOT_COPY } from "../copy.js";

interface PresentedError {
    cause: string | null;
    message: string;
}

export function presentError(error: unknown): string {
    const presented = normalizeError(error);

    return presented.cause
        ? `${presented.message}\n${BOT_COPY.errors.causeLabel}: ${presented.cause}`
        : presented.message;
}

function normalizeError(error: unknown): PresentedError {
    if (isNamedError(error, "ProviderAuthError")) {
        return {
            message: BOT_COPY.errors.providerAuth,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "MessageAbortedError")) {
        return {
            message: BOT_COPY.errors.requestAborted,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "StructuredOutputError")) {
        return {
            message: BOT_COPY.errors.structuredOutput,
            cause: joinNonEmptyParts([
                extractMessage(error.data),
                extractRetries(error.data),
            ]),
        };
    }

    if (isNamedError(error, "MessageOutputLengthError")) {
        return {
            message: BOT_COPY.errors.outputLength,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "ContextOverflowError")) {
        return {
            message: BOT_COPY.errors.contextOverflow,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "APIError")) {
        return {
            message: BOT_COPY.errors.providerRequest,
            cause: joinNonEmptyParts([
                extractMessage(error.data),
                extractStatusCode(error.data),
                extractRetryable(error.data),
            ]),
        };
    }

    if (isNamedError(error, "NotFoundError")) {
        return {
            message: BOT_COPY.errors.notFound,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isBadRequestError(error)) {
        return {
            message: BOT_COPY.errors.badRequest,
            cause: extractBadRequestCause(error),
        };
    }

    if (error instanceof Error) {
        return {
            message: error.name === "AbortError" ? BOT_COPY.errors.requestAborted : BOT_COPY.errors.unexpected,
            cause: error.message || null,
        };
    }

    return {
        message: BOT_COPY.errors.unexpected,
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

function extractRetryable(value: unknown): string | null {
    if (!value || typeof value !== "object" || !("isRetryable" in value)) {
        return null;
    }

    const isRetryable = (value as { isRetryable?: unknown }).isRetryable;

    return typeof isRetryable === "boolean"
        ? `${BOT_COPY.errors.retryableLabel}: ${isRetryable ? "yes" : "no"}`
        : null;
}

function extractStatusCode(value: unknown): string | null {
    if (!value || typeof value !== "object" || !("statusCode" in value)) {
        return null;
    }

    const statusCode = (value as { statusCode?: unknown }).statusCode;

    return typeof statusCode === "number" && Number.isFinite(statusCode)
        ? `${BOT_COPY.errors.statusCodeLabel}: ${Math.round(statusCode)}`
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
