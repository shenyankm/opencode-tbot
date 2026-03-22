import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { redactSensitiveText } from "../utils/redact.js";

export type AppLogLevel = "debug" | "info" | "warn" | "error";
export type LogComponent =
    | "app"
    | "runtime"
    | "telegram"
    | "opencode"
    | "prompt"
    | "plugin-event"
    | "storage"
    | "bot";
export type LogEventName = string;

export interface StructuredLogError {
    data?: unknown;
    message: string;
    name: string;
    stack?: string;
}

export interface StructuredLogEvent {
    ts: string;
    level: AppLogLevel;
    service: string;
    component: LogComponent | string;
    event: LogEventName;
    message: string;
    runtimeId: string | null;
    operationId: string | null;
    correlationId: string | null;
    worktree?: string;
    chatId?: number;
    sessionId?: string;
    projectId?: string;
    requestId?: string;
    updateId?: number;
    command?: string;
    callbackData?: string;
    durationMs?: number;
    attempt?: number;
    status?: string;
    sizeBytes?: number;
    error?: StructuredLogError;
    [key: string]: unknown;
}

export interface LoggerContext {
    attempt?: number;
    callbackData?: string;
    chatId?: number;
    command?: string;
    component?: LogComponent | string;
    correlationId?: string | null;
    durationMs?: number;
    error?: StructuredLogError;
    event?: LogEventName;
    operationId?: string | null;
    projectId?: string;
    requestId?: string;
    runtimeId?: string | null;
    sessionId?: string;
    sizeBytes?: number;
    status?: string;
    updateId?: number;
    worktree?: string;
}

export interface AppLogger {
    debug(input?: unknown, message?: string): void;
    info(input?: unknown, message?: string): void;
    warn(input?: unknown, message?: string): void;
    error(input?: unknown, message?: string): void;
    child(context: LoggerContext): AppLogger;
    flush(): Promise<void>;
}

export interface LogSink {
    flush?(): Promise<void>;
    write(event: StructuredLogEvent): Promise<void>;
}

export interface FileLogSinkOptions {
    dir: string;
    maxFiles?: number;
    maxTotalBytes?: number;
    runtimeId: string;
}

interface OpenCodeAppLogClientLike {
    app: {
        log(input: {
            service?: string;
            level?: AppLogLevel;
            message?: string;
            extra?: Record<string, unknown>;
        }, options?: {
            responseStyle?: "data" | "fields";
            throwOnError?: boolean;
        }): Promise<unknown>;
    };
}

interface LoggerSinkOptions {
    file?: boolean;
    host?: boolean;
}

interface CreateOpenCodeAppLoggerOptions {
    file?: {
        dir: string;
        retention?: {
            maxFiles?: number;
            maxTotalBytes?: number;
        };
    };
    level?: string | null;
    runtimeId?: string;
    service?: string;
    sinks?: LoggerSinkOptions;
    worktree?: string;
}

interface PendingLogEvent {
    context: LoggerContext;
    input?: unknown;
    level: AppLogLevel;
    message?: string;
}

const DEFAULT_COMPONENT: LogComponent = "app";
const DEFAULT_EVENT = "log";
const DEFAULT_SERVICE_NAME = "opencode-tbot";
const DEFAULT_MAX_LOG_FILES = 30;
const DEFAULT_MAX_TOTAL_LOG_BYTES = 314_572_800;
const CONTENT_OMITTED = "[OMITTED]";
const REDACTED = "[REDACTED]";
const LEVEL_PRIORITY: Record<AppLogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};
const RESERVED_EVENT_FIELDS = new Set([
    "attempt",
    "callbackData",
    "chatId",
    "command",
    "component",
    "correlationId",
    "durationMs",
    "error",
    "event",
    "operationId",
    "projectId",
    "requestId",
    "runtimeId",
    "sessionId",
    "sizeBytes",
    "status",
    "updateId",
    "worktree",
]);

export function createOpenCodeAppLogger(
    client: OpenCodeAppLogClientLike,
    options: CreateOpenCodeAppLoggerOptions = {},
): AppLogger {
    const service = normalizeServiceName(options.service);
    const minimumLevel = normalizeLogLevel(options.level);
    const runtimeId = normalizeString(options.runtimeId) ?? randomUUID();
    const boundRootContext: LoggerContext = {
        component: DEFAULT_COMPONENT,
        runtimeId,
        ...(options.worktree ? { worktree: options.worktree } : {}),
    };
    const sinks = createSinks(client, {
        file: {
            dir: options.file?.dir,
            maxFiles: options.file?.retention?.maxFiles,
            maxTotalBytes: options.file?.retention?.maxTotalBytes,
        },
        runtimeId,
        service,
        sinks: options.sinks,
    });
    let queue = Promise.resolve();

    const enqueue = (event: PendingLogEvent) => {
        if (LEVEL_PRIORITY[event.level] < LEVEL_PRIORITY[minimumLevel]) {
            return;
        }

        const structuredEvent = buildStructuredLogEvent(
            event.level,
            event.input,
            event.message,
            service,
            event.context,
        );

        queue = queue
            .catch(() => undefined)
            .then(async () => {
                await Promise.allSettled(
                    sinks.map((sink) => sink.write(structuredEvent)),
                );
            });
    };

    const createLogger = (context: LoggerContext): AppLogger => ({
        debug(input?: unknown, message?: string) {
            enqueue({
                context,
                input,
                level: "debug",
                message,
            });
        },
        info(input?: unknown, message?: string) {
            enqueue({
                context,
                input,
                level: "info",
                message,
            });
        },
        warn(input?: unknown, message?: string) {
            enqueue({
                context,
                input,
                level: "warn",
                message,
            });
        },
        error(input?: unknown, message?: string) {
            enqueue({
                context,
                input,
                level: "error",
                message,
            });
        },
        child(childContext: LoggerContext) {
            return createLogger({
                ...context,
                ...removeUndefinedFields(childContext),
            });
        },
        async flush() {
            await queue.catch(() => undefined);
            await Promise.allSettled(
                sinks.map(async (sink) => {
                    await sink.flush?.();
                }),
            );
        },
    });

    return createLogger(boundRootContext);
}

export function createOperationId(prefix = "op"): string {
    return `${prefix}-${randomUUID()}`;
}

export function logTelegramUpdate(
    logger: AppLogger,
    input: LoggerContext & Record<string, unknown>,
    message: string,
): void {
    logger.info(
        {
            component: "telegram",
            ...input,
        },
        message,
    );
}

export function logPromptLifecycle(
    logger: AppLogger,
    input: LoggerContext & Record<string, unknown>,
    message: string,
): void {
    logger.info(
        {
            component: "prompt",
            ...input,
        },
        message,
    );
}

export function logOpenCodeRequest(
    logger: AppLogger,
    input: LoggerContext & Record<string, unknown>,
    message: string,
): void {
    logger.info(
        {
            component: "opencode",
            ...input,
        },
        message,
    );
}

export function logPluginEvent(
    logger: AppLogger,
    input: LoggerContext & Record<string, unknown>,
    message: string,
): void {
    logger.info(
        {
            component: "plugin-event",
            ...input,
        },
        message,
    );
}

function createSinks(
    client: OpenCodeAppLogClientLike,
    options: {
        file?: {
            dir?: string;
            maxFiles?: number;
            maxTotalBytes?: number;
        };
        runtimeId: string;
        service: string;
        sinks?: LoggerSinkOptions;
    },
): LogSink[] {
    const sinkOptions = options.sinks ?? {};
    const sinks: LogSink[] = [];

    if (sinkOptions.host !== false) {
        sinks.push(createHostSink(client, options.service));
    }

    if (sinkOptions.file !== false && options.file?.dir) {
        sinks.push(createJsonlFileSink({
            dir: options.file.dir,
            maxFiles: options.file.maxFiles,
            maxTotalBytes: options.file.maxTotalBytes,
            runtimeId: options.runtimeId,
        }));
    }

    return sinks;
}

function createHostSink(client: OpenCodeAppLogClientLike, service: string): LogSink {
    return {
        async write(event) {
            await client.app.log({
                service,
                level: event.level,
                message: event.message,
                extra: buildHostLogExtra(event),
            }, {
                throwOnError: true,
                responseStyle: "data",
            });
        },
    };
}

function createJsonlFileSink(options: FileLogSinkOptions): LogSink {
    const maxFiles = options.maxFiles ?? DEFAULT_MAX_LOG_FILES;
    const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_LOG_BYTES;
    const runtimeSegment = sanitizeFileSegment(options.runtimeId);
    const timestampSegment = new Date().toISOString().replace(/:/gu, "-");
    const filePath = join(
        options.dir,
        `${timestampSegment}.${process.pid}.${runtimeSegment}.jsonl`,
    );
    let initialized = false;
    let writeCount = 0;

    const initialize = async () => {
        if (initialized) {
            return;
        }

        await mkdir(options.dir, { recursive: true });
        await cleanupLogDirectory(options.dir, maxFiles, maxTotalBytes);
        initialized = true;
    };

    return {
        async write(event) {
            await initialize();
            await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
            writeCount += 1;

            if (writeCount === 1 || writeCount % 100 === 0) {
                await cleanupLogDirectory(options.dir, maxFiles, maxTotalBytes);
            }
        },
    };
}

async function cleanupLogDirectory(
    directory: string,
    maxFiles: number,
    maxTotalBytes: number,
): Promise<void> {
    let entries: Array<{ path: string; size: number; time: number }> = [];

    try {
        const names = await readdir(directory);

        entries = await Promise.all(
            names
                .filter((name) => name.endsWith(".jsonl"))
                .map(async (name) => {
                    const entryPath = join(directory, name);
                    const entryStat = await stat(entryPath);

                    return {
                        path: entryPath,
                        size: entryStat.size,
                        time: entryStat.mtimeMs,
                    };
                }),
        );
    } catch {
        return;
    }

    entries.sort((left, right) => right.time - left.time);

    let totalBytes = 0;
    const retained: Array<{ path: string; size: number; time: number }> = [];
    const deleted: Array<{ path: string; size: number; time: number }> = [];

    for (const entry of entries) {
        const canKeepByCount = retained.length < maxFiles;
        const canKeepBySize = retained.length === 0 || totalBytes + entry.size <= maxTotalBytes;

        if (canKeepByCount && canKeepBySize) {
            retained.push(entry);
            totalBytes += entry.size;
            continue;
        }

        deleted.push(entry);
    }

    await Promise.allSettled(
        deleted.map(async (entry) => {
            await unlink(entry.path);
        }),
    );
}

function buildStructuredLogEvent(
    level: AppLogLevel,
    input: unknown,
    message: string | undefined,
    service: string,
    boundContext: LoggerContext,
): StructuredLogEvent {
    const extracted = extractContextAndExtra(input);
    const context: LoggerContext = {
        ...removeUndefinedFields(boundContext),
        ...removeUndefinedFields(extracted.context),
    };
    const resolvedMessage = normalizeLogMessage(input, message);

    return {
        ts: new Date().toISOString(),
        level,
        service,
        component: normalizeComponent(context.component),
        event: normalizeEventName(context.event),
        message: redactSensitiveText(resolvedMessage),
        runtimeId: context.runtimeId ?? null,
        operationId: context.operationId ?? null,
        correlationId: resolveCorrelationId(context),
        ...(context.worktree ? { worktree: redactSensitiveText(context.worktree) } : {}),
        ...(typeof context.chatId === "number" ? { chatId: context.chatId } : {}),
        ...(context.sessionId ? { sessionId: context.sessionId } : {}),
        ...(context.projectId ? { projectId: context.projectId } : {}),
        ...(context.requestId ? { requestId: context.requestId } : {}),
        ...(typeof context.updateId === "number" ? { updateId: context.updateId } : {}),
        ...(context.command ? { command: context.command } : {}),
        ...(context.callbackData ? { callbackData: context.callbackData } : {}),
        ...(typeof context.durationMs === "number" ? { durationMs: context.durationMs } : {}),
        ...(typeof context.attempt === "number" ? { attempt: context.attempt } : {}),
        ...(context.status ? { status: context.status } : {}),
        ...(typeof context.sizeBytes === "number" ? { sizeBytes: context.sizeBytes } : {}),
        ...(context.error ? { error: context.error } : {}),
        ...removeUndefinedFields(extracted.extra),
    };
}

function buildHostLogExtra(event: StructuredLogEvent): Record<string, unknown> {
    const {
        service: _service,
        level: _level,
        message: _message,
        ...rest
    } = event;

    return rest;
}

function extractContextAndExtra(input: unknown): {
    context: LoggerContext;
    extra: Record<string, unknown>;
} {
    if (input instanceof Error) {
        return {
            context: {
                error: serializeError(input),
            },
            extra: {},
        };
    }

    if (Array.isArray(input)) {
        return {
            context: {},
            extra: {
                items: input.map((item) => sanitizeValue(item)),
            },
        };
    }

    if (input === null || input === undefined) {
        return {
            context: {},
            extra: {},
        };
    }

    if (typeof input === "string") {
        return {
            context: {},
            extra: {},
        };
    }

    if (typeof input !== "object") {
        return {
            context: {},
            extra: {
                value: sanitizeValue(input),
            },
        };
    }

    const record = input as Record<string, unknown>;
    const context: LoggerContext = {};
    const extra: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
        if (RESERVED_EVENT_FIELDS.has(key)) {
            assignReservedField(context, key, value);
            continue;
        }

        extra[key] = sanitizeFieldValue(key, value);
    }

    return {
        context,
        extra,
    };
}

function assignReservedField(context: LoggerContext, key: string, value: unknown): void {
    switch (key) {
        case "attempt":
        case "durationMs":
        case "sizeBytes":
            if (typeof value === "number") {
                context[key] = value;
            }
            return;
        case "chatId":
        case "updateId":
            if (typeof value === "number") {
                context[key] = value;
            }
            return;
        case "callbackData":
        case "command":
        case "component":
        case "event":
        case "projectId":
        case "requestId":
        case "sessionId":
        case "status":
        case "worktree":
            if (typeof value === "string" && value.trim().length > 0) {
                context[key] = redactSensitiveText(value.trim()) as never;
            }
            return;
        case "correlationId":
        case "operationId":
        case "runtimeId":
            if (typeof value === "string" && value.trim().length > 0) {
                context[key] = value.trim();
            } else if (value === null) {
                context[key] = null;
            }
            return;
        case "error":
            if (value instanceof Error) {
                context.error = serializeError(value);
            } else if (isPlainObject(value)) {
                context.error = normalizeStructuredLogErrorRecord(value);
            }
            return;
        default:
            return;
    }
}

function normalizeLogMessage(input: unknown, message?: string): string {
    if (typeof input === "string") {
        const normalizedInput = input.trim();

        return normalizedInput.length > 0
            ? normalizedInput
            : "log";
    }

    if (message && message.trim().length > 0) {
        return message.trim();
    }

    if (input instanceof Error) {
        return input.message.trim() || input.name;
    }

    return "log";
}

function normalizeServiceName(value: string | undefined): string {
    const normalized = value?.trim();

    return normalized && normalized.length > 0
        ? normalized
        : DEFAULT_SERVICE_NAME;
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

function normalizeComponent(value: string | undefined): string {
    const normalized = value?.trim();

    return normalized && normalized.length > 0
        ? normalized
        : DEFAULT_COMPONENT;
}

function normalizeEventName(value: string | undefined): string {
    const normalized = value?.trim();

    return normalized && normalized.length > 0
        ? normalized
        : DEFAULT_EVENT;
}

function resolveCorrelationId(context: LoggerContext): string | null {
    if (context.correlationId) {
        return context.correlationId;
    }

    if (typeof context.updateId === "number") {
        return String(context.updateId);
    }

    return context.operationId ?? null;
}

function serializeError(error: Error): StructuredLogError {
    return {
        name: error.name,
        message: redactSensitiveText(error.message),
        ...(error.stack ? { stack: redactSensitiveText(error.stack) } : {}),
        ...("data" in error && error.data && typeof error.data === "object"
            ? { data: sanitizeValue(error.data) }
            : {}),
    };
}

function sanitizePlainObject(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(value).map(([key, entryValue]) => [
            key,
            sanitizeFieldValue(key, entryValue),
        ]),
    );
}

function sanitizeFieldValue(key: string, value: unknown): unknown {
    if (isSensitiveKey(key)) {
        return redactSensitiveFieldValue(value);
    }

    if (isUrlLikeKey(key)) {
        return summarizeUrlValue(value);
    }

    if (isTextContentKey(key)) {
        return summarizeTextValue(value);
    }

    if (isAttachmentCollectionKey(key)) {
        return summarizeAttachmentCollection(value);
    }

    return sanitizeValue(value);
}

function sanitizeValue(value: unknown): unknown {
    if (value instanceof Error) {
        return serializeError(value);
    }

    if (Array.isArray(value)) {
        return value.map((entry) => sanitizeValue(entry));
    }

    if (typeof value === "string") {
        return redactSensitiveText(value);
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    return sanitizePlainObject(value as Record<string, unknown>);
}

function summarizeTextValue(value: unknown): unknown {
    if (typeof value === "string") {
        return {
            omitted: CONTENT_OMITTED,
            length: value.length,
        };
    }

    if (Array.isArray(value)) {
        return {
            omitted: CONTENT_OMITTED,
            count: value.length,
        };
    }

    if (value && typeof value === "object") {
        return {
            omitted: CONTENT_OMITTED,
            kind: "object",
        };
    }

    return value;
}

function summarizeUrlValue(value: unknown): unknown {
    if (typeof value === "string" && value.trim().length > 0) {
        return {
            omitted: CONTENT_OMITTED,
            kind: "url",
        };
    }

    return sanitizeValue(value);
}

function summarizeAttachmentCollection(value: unknown): unknown {
    if (!Array.isArray(value)) {
        return summarizeTextValue(value);
    }

    return {
        count: value.length,
        items: value.map((entry) => summarizeAttachmentValue(entry)),
    };
}

function summarizeAttachmentValue(value: unknown): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return summarizeTextValue(value);
    }

    const record = value as Record<string, unknown>;

    return removeUndefinedFields({
        filename: normalizeString(record.filename) ?? normalizeString(record.fileName) ?? undefined,
        mime: normalizeString(record.mime) ?? normalizeString(record.mimeType) ?? undefined,
        sizeBytes: pickNumericValue(record, ["sizeBytes", "size", "fileSize"]),
        hasCaption: pickStringValue(record, ["caption"]) !== null,
        textLength: pickStringValue(record, ["text", "prompt"])?.length,
        type: normalizeString(record.type) ?? undefined,
    });
}

function isSensitiveKey(key: string): boolean {
    return /token|secret|api[-_]?key|authorization|password|cookie/iu.test(key);
}

function isTextContentKey(key: string): boolean {
    return /(^|[-_])(text|prompt|caption|body|markdown|content|messageText|fallbackText|input|raw)$/iu.test(key)
        || /bodyMd|bodyText|messageText|fallbackText/iu.test(key);
}

function isUrlLikeKey(key: string): boolean {
    return /(^|[-_])(url|uri|href|filePath|downloadPath|downloadUrl|fileUrl)$/iu.test(key);
}

function isAttachmentCollectionKey(key: string): boolean {
    return /(^|[-_])(files|parts|attachments)$/iu.test(key);
}

function redactSensitiveFieldValue(value: unknown): unknown {
    if (typeof value === "string" && value.trim().length > 0) {
        return REDACTED;
    }

    if (Array.isArray(value)) {
        return value.map(() => REDACTED);
    }

    if (value && typeof value === "object") {
        return REDACTED;
    }

    return value;
}

function removeUndefinedFields<TRecord extends object>(record: TRecord): TRecord {
    return Object.fromEntries(
        Object.entries(record).filter(([, value]) => value !== undefined),
    ) as TRecord;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0
        ? redactSensitiveText(value.trim())
        : null;
}

function pickNumericValue(record: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
        const value = record[key];

        if (typeof value === "number") {
            return value;
        }
    }

    return undefined;
}

function pickStringValue(record: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = record[key];

        if (typeof value === "string" && value.trim().length > 0) {
            return value.trim();
        }
    }

    return null;
}

function sanitizeFileSegment(value: string): string {
    return value.replace(/[^a-z0-9._-]+/giu, "_");
}

function normalizeStructuredLogErrorRecord(value: Record<string, unknown>): StructuredLogError {
    return {
        name: normalizeString(value.name) ?? "Error",
        message: normalizeString(value.message) ?? "Unknown error",
        ...(typeof value.stack === "string" ? { stack: redactSensitiveText(value.stack) } : {}),
        ...(value.data !== undefined ? { data: sanitizeValue(value.data) } : {}),
    };
}
