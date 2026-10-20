import { redactSensitiveText } from "../../infra/utils/redact.js";
import { BOT_COPY, type BotCopy } from "../copy.js";

interface PresentedError {
    cause: string | null;
    message: string;
}

export function presentError(error: unknown, copy: BotCopy = BOT_COPY): string {
    const presented = normalizeError(error, copy);

    return redactSensitiveText(presented.cause
        ? `${presented.message}\n${copy.errors.causeLabel}: ${presented.cause}`
        : presented.message);
}

function normalizeError(error: unknown, copy: BotCopy): PresentedError {
    if (isStructuredError(error)) {
        const labels: Record<string, string> = {
            ProviderAuthError: copy.errors.providerAuth,
            MessageAbortedError: copy.errors.requestAborted,
            StructuredOutputError: copy.errors.structuredOutput,
            MessageOutputLengthError: copy.errors.outputLength,
            ContextOverflowError: copy.errors.contextOverflow,
            APIError: copy.errors.providerRequest,
        };
        const providerError = error.type === "APIError" || error.type.startsWith("provider.");
        return {
            message: labels[error.type] ?? (providerError ? copy.errors.providerRequest : copy.errors.unexpected),
            cause: joinNonEmptyParts([
                providerError ? getProviderCompatibilityHint(error.message) : null,
                error.message,
                typeof error.status === "number" && Number.isFinite(error.status)
                    ? `${copy.errors.statusCodeLabel}: ${error.status}` : null,
            ]),
        };
    }

    if (isTaggedError(error)) {
        return {
            message: error._tag === "InvalidRequestError" ? copy.errors.badRequest
                : error._tag.endsWith("NotFoundError") ? copy.errors.notFound : copy.errors.unexpected,
            cause: error.message,
        };
    }

    if (isNamedError(error, "MessageAbortedError")) {
        return {
            message: copy.errors.requestAborted,
            cause: extractMessage(error.data) ?? null,
        };
    }

    if (isNamedError(error, "OpenCodePromptTimeoutError")) {
        return {
            message: copy.errors.promptTimeout,
            cause: null,
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

function getProviderCompatibilityHint(message: string | null): string | null {
    if (!message) {
        return null;
    }

    return /tool_choice parameter does not support being set to required or object in thinking mode/iu.test(message)
        ? "Current model/reasoning mode is incompatible with tool calling. Switch to a compatible model or disable thinking mode."
        : null;
}

function isStructuredError(error: unknown): error is { type: string; message: string; status?: number } {
    return !!error && typeof error === "object"
        && "type" in error && typeof error.type === "string"
        && "message" in error && typeof error.message === "string";
}

function isTaggedError(error: unknown): error is { _tag: string; message: string } {
    return !!error && typeof error === "object"
        && "_tag" in error && typeof error._tag === "string"
        && "message" in error && typeof error.message === "string";
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
