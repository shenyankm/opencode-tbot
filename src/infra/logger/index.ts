import { redactSensitiveText } from "../utils/redact.js";

export type AppLogLevel = "debug" | "info" | "warn" | "error";

export interface AppLogger {
    debug(input?: unknown, message?: string): void;
    info(input?: unknown, message?: string): void;
    warn(input?: unknown, message?: string): void;
    error(input?: unknown, message?: string): void;
    flush(): Promise<void>;
}

interface OpenCodeAppLogClientLike {
    app: {
        log(input: {
            service: string;
            level: AppLogLevel;
            message: string;
            extra?: Record<string, unknown>;
        }): Promise<unknown>;
    };
}

interface CreateOpenCodeAppLoggerOptions {
    level?: string | null;
    service?: string;
}

const DEFAULT_SERVICE_NAME = "opencode-tbot";
const LEVEL_PRIORITY: Record<AppLogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

export function createOpenCodeAppLogger(
    client: OpenCodeAppLogClientLike,
    options: CreateOpenCodeAppLoggerOptions = {},
): AppLogger {
    const service = normalizeServiceName(options.service);
    const minimumLevel = normalizeLogLevel(options.level);
    let queue = Promise.resolve();

    const enqueue = (level: AppLogLevel, input?: unknown, message?: string) => {
        if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minimumLevel]) {
            return;
        }

        const { extra, text } = normalizeLogArguments(input, message);
        const payload = {
            service,
            level,
            message: text,
            ...(extra ? { extra } : {}),
        };

        queue = queue
            .catch(() => undefined)
            .then(async () => {
                try {
                    await client.app.log(payload);
                } catch {
                    // Swallow logging failures to avoid breaking the plugin runtime.
                }
            });
    };

    return {
        debug(input?: unknown, message?: string) {
            enqueue("debug", input, message);
        },
        info(input?: unknown, message?: string) {
            enqueue("info", input, message);
        },
        warn(input?: unknown, message?: string) {
            enqueue("warn", input, message);
        },
        error(input?: unknown, message?: string) {
            enqueue("error", input, message);
        },
        async flush() {
            await queue.catch(() => undefined);
        },
    };
}

function normalizeServiceName(value: string | undefined): string {
    const normalized = value?.trim();

    return normalized && normalized.length > 0 ? normalized : DEFAULT_SERVICE_NAME;
}

function normalizeLogLevel(value: string | null | undefined): AppLogLevel {
    switch (value?.trim().toLowerCase()) {
        case "debug":
            return "debug";
        case "warn":
            return "warn";
        case "error":
            return "error";
        default:
            return "info";
    }
}

function normalizeLogArguments(input?: unknown, message?: string): {
    extra?: Record<string, unknown>;
    text: string;
} {
    if (typeof input === "string") {
        return {
            text: input,
        };
    }

    if (message && message.trim().length > 0) {
        const extra = serializeExtra(input);

        return {
            ...(extra ? { extra } : {}),
            text: message.trim(),
        };
    }

    if (input instanceof Error) {
        return {
            extra: serializeExtra(input) ?? undefined,
            text: input.message.trim() || input.name,
        };
    }

    const extra = serializeExtra(input);

    return {
        ...(extra ? { extra } : {}),
        text: "log",
    };
}

function serializeExtra(input: unknown): Record<string, unknown> | null {
    if (input === null || input === undefined) {
        return null;
    }

    if (input instanceof Error) {
        return {
            error: serializeError(input),
        };
    }

    if (Array.isArray(input)) {
        return {
            items: input.map((item) => sanitizeValue(item)),
        };
    }

    if (typeof input !== "object") {
        return {
            value: sanitizeValue(input),
        };
    }

    return sanitizeRecord(input as Record<string, unknown>);
}

function sanitizeRecord(record: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(record).map(([key, value]) => [
            key,
            isSensitiveKey(key)
                ? redactSensitiveFieldValue(value)
                : sanitizeValue(value),
        ]),
    );
}

function sanitizeValue(value: unknown): unknown {
    if (value instanceof Error) {
        return serializeError(value);
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeValue(item));
    }

    if (typeof value === "string") {
        return redactSensitiveText(value);
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    return sanitizeRecord(value as Record<string, unknown>);
}

function serializeError(error: Error): Record<string, unknown> {
    return {
        name: error.name,
        message: redactSensitiveText(error.message),
        ...(error.stack ? { stack: redactSensitiveText(error.stack) } : {}),
        ...("data" in error && error.data && typeof error.data === "object"
            ? { data: sanitizeValue(error.data) }
            : {}),
    };
}

function isSensitiveKey(key: string): boolean {
    return /token|secret|api[-_]?key|authorization|password/iu.test(key);
}

function redactSensitiveFieldValue(value: unknown): unknown {
    if (typeof value === "string" && value.trim().length > 0) {
        return "[REDACTED]";
    }

    if (Array.isArray(value)) {
        return value.map(() => "[REDACTED]");
    }

    if (value && typeof value === "object") {
        return "[REDACTED]";
    }

    return value;
}
