import { homedir } from "node:os";
import { BOT_COPY, type BotCopy } from "../../bot/copy.js";
import { stripMarkdownToPlainText } from "../../infra/utils/markdown-text.js";
import { redactSensitiveText } from "../../infra/utils/redact.js";
import type {
    OpenCodeContextUsage,
    PromptSessionResult,
} from "../opencode/opencode.client.js";

const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;
export const TELEGRAM_MESSAGE_TARGET_LENGTH = 1024;
const MESSAGE_LENGTH_TOLERANCE = 128;
const SENTENCE_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "sentence" });
const TRUNCATED_SUFFIX = "...";
export { stripMarkdownToPlainText } from "../../infra/utils/markdown-text.js";

export interface TelegramReplyPayload<ParseMode extends "Markdown" | "HTML" = "Markdown"> {
    options?: {
        parse_mode: ParseMode;
    };
    text: string;
}

export interface TelegramPromptReply {
    fallback: TelegramReplyPayload;
    preferred: TelegramReplyPayload;
}

export interface TelegramStaticReply<ParseMode extends "Markdown" | "HTML" = "Markdown"> {
    fallback: TelegramReplyPayload<ParseMode>;
    preferred: TelegramReplyPayload<ParseMode>;
}

export function buildTelegramPromptReply(
    result: Pick<PromptSessionResult, "bodyMd" | "fallbackText">,
    copy: BotCopy = BOT_COPY,
): TelegramPromptReply {
    return buildTelegramPromptReplies(result, copy)[0];
}

export function buildTelegramPromptReplies(
    result: Pick<PromptSessionResult, "bodyMd" | "fallbackText">,
    copy: BotCopy = BOT_COPY,
    streaming = false,
): TelegramPromptReply[] {
    const prepared = result.bodyMd ? prepareTelegramRichMarkdown(result.bodyMd) : null;
    const markdown = prepared && streaming && result.bodyMd?.endsWith("\n") ? `${prepared}\n` : prepared;
    if (!markdown) {
        return splitTelegramText(normalizePlainBody(result, copy)).map((text) => ({
            preferred: { text },
            fallback: { text },
        }));
    }
    let fence: string | null = null;
    return splitTelegramMarkdown(markdown, streaming).map(({ text: chunk, literal }) => {
        if (literal) {
            return { preferred: { text: chunk }, fallback: { text: chunk } };
        }
        const prefix = fence ? `${fence}\n` : "";
        for (const line of chunk.split("\n")) {
            const match = line.match(/^\s*(`{3,}|~{3,})(.*)$/u);
            if (match) {
                if (!fence) {
                    fence = line.trim();
                } else if (match[1][0] === fence[0] && match[1].length >= fence.match(/^[`~]+/u)![0].length && !match[2].trim()) {
                    fence = null;
                }
            }
        }
        const suffix = fence ? `\n${fence.match(/^[`~]+/u)![0]}` : "";
        const text = `${prefix}${chunk}${suffix}`;
        return {
            preferred: { text, options: { parse_mode: "Markdown" } },
            fallback: { text: stripMarkdownToPlainText(chunk) || chunk },
        };
    });
}
interface MarkdownChunk {
    text: string;
    literal?: boolean;
}

function cells(line: string): string[] {
    const parts = line.trim().split(/(?<!\\)(?:\\\\)*\|/u);
    if (!parts[0]?.trim()) parts.shift();
    if (!parts.at(-1)?.trim()) parts.pop();
    return parts;
}

function splitTelegramMarkdown(text: string, streaming: boolean): MarkdownChunk[] {
    const lines = text.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
    const chunks: MarkdownChunk[] = [];
    let prose = "";
    let fence: string | null = null;
    const flushProse = () => {
        chunks.push(...splitTelegramText(prose).map((text) => ({ text })));
        prose = "";
    };
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const marker = line.trimEnd().match(/^\s*(`{3,}|~{3,})(.*)$/u);
        if (marker) {
            if (!fence) fence = marker[1];
            else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
        }
        const separator = lines[index + 1];
        const columns = !fence && separator?.includes("|") ? cells(separator) : [];
        if (!columns.length
            || !columns.every((cell) => /^\s*:?-{3,}:?\s*$/u.test(cell))
            || cells(line).length !== columns.length) {
            prose += line;
            continue;
        }
        flushProse();
        const header = line + separator;
        let table = header;
        let emitted = false;
        index += 1;
        while (index + 1 < lines.length && lines[index + 1].trim() && lines[index + 1].includes("|") && cells(lines[index + 1]).length > 0) {
            const row = lines[++index];
            if (streaming && index === lines.length - 1 && !row.endsWith("\n")) break;
            if (table.length > header.length && table.length + row.length > TELEGRAM_MESSAGE_TARGET_LENGTH + 128) {
                chunks.push({ text: table });
                emitted = true;
                table = header;
            }
            if (header.length + row.length > 4096) {
                // shortcut: a single row above the safe message size stays literal rather than losing cell data.
                chunks.push(...splitTelegramText(table + row).map((text) => ({ text, literal: true })));
                emitted = true;
                table = header;
            } else {
                table += row;
            }
        }
        if (table.length > header.length || (!streaming && !emitted)) chunks.push({ text: table });
    }
    flushProse();
    return chunks;
}

export function splitTelegramText(text: string, target = TELEGRAM_MESSAGE_TARGET_LENGTH): string[] {
    if (!Number.isInteger(target) || target < 2 || target > MAX_TELEGRAM_MESSAGE_LENGTH) {
        throw new Error("Telegram message target must be an integer between 2 and 4096.");
    }
    const tolerance = Math.min(MESSAGE_LENGTH_TOLERANCE, Math.floor(target / 8));
    const upper = Math.min(MAX_TELEGRAM_MESSAGE_LENGTH, target + tolerance);
    if (text.length <= upper) {
        return text ? [text] : [];
    }
    let sentenceEnds: number[] | null = null;
    const chunks: string[] = [];
    let offset = 0;
    let sentenceIndex = 0;
    while (text.length - offset > upper) {
        const remaining = text.length - offset;
        const aim = remaining < target * 1.5 ? Math.ceil(remaining / 2) : target;
        const lower = Math.max(1, aim - tolerance);
        const window = text.slice(offset, offset + upper);
        const paragraphs = [...window.matchAll(/\n[\t ]*\n+/gu)].map((match) => match.index + match[0].length);
        let end = closestBoundary(paragraphs, aim, lower);
        if (end === undefined) {
            sentenceEnds ??= Array.from(SENTENCE_SEGMENTER.segment(text))
                .filter(({ segment }) => !/^\s*\d+[.)]\s*$/u.test(segment))
                .map(({ index, segment }) => index + segment.length);
            const lines = [...window.matchAll(/\n/gu)].map((match) => match.index + 1);
            const sentences: number[] = [];
            while (sentenceEnds[sentenceIndex] <= offset) {
                sentenceIndex += 1;
            }
            for (let index = sentenceIndex; sentenceEnds[index] <= offset + upper; index += 1) {
                sentences.push(sentenceEnds[index] - offset);
            }
            end = closestBoundary(sentences, aim, lower)
                ?? closestBoundary(lines, aim, lower)
                ?? sentences.at(-1)
                ?? lines.at(-1)
                ?? closestBoundary([...window.matchAll(/[\t ]+/gu)].map((match) => match.index + match[0].length), aim, lower)
                ?? aim;
        }
        if (/[\uD800-\uDBFF]/u.test(text[offset + end - 1])) {
            end -= 1;
        }
        chunks.push(text.slice(offset, offset + end));
        offset += end;
    }
    if (offset < text.length) {
        chunks.push(text.slice(offset));
    }
    return chunks;
}

function closestBoundary(boundaries: number[], target: number, lower: number): number | undefined {
    let closest: number | undefined;
    for (const boundary of boundaries) {
        if (boundary >= lower && (closest === undefined || Math.abs(boundary - target) < Math.abs(closest - target))) {
            closest = boundary;
        }
    }
    return closest;
}

export function buildTelegramStaticReply(markdown: string): TelegramStaticReply {
    const text = prepareTelegramRichMarkdown(markdown);
    const fallback = { text: truncateStaticText(stripMarkdownToPlainText(markdown) || markdown.trim()) };
    return {
        preferred: text ? { text, options: { parse_mode: "Markdown" } } : fallback,
        fallback,
    };
}

export function prepareTelegramRichMarkdown(markdown: string): string | null {
    const text = preprocessMarkdownForTelegram(markdown).trim();
    // Model-supplied HTML and remote images must remain text, not active rich markup or media.
    return !text || /<\/?[A-Za-z][^>]*>|!\[/u.test(text) ? null : text;
}

function normalizePlainBody(
    result: Pick<PromptSessionResult, "bodyMd" | "fallbackText">,
    copy: BotCopy,
): string {
    const fromStructured = result.bodyMd?.trim() ?? "";
    const fromFallback = result.fallbackText.trim();
    const body = fromStructured || fromFallback;

    return body.trim() || result.fallbackText || copy.prompt.emptyResponse;
}

function truncateStaticText(text: string): string {
    if (text.length <= MAX_TELEGRAM_MESSAGE_LENGTH) {
        return text;
    }

    return `${text.slice(0, Math.max(0, MAX_TELEGRAM_MESSAGE_LENGTH - TRUNCATED_SUFFIX.length))}${TRUNCATED_SUFFIX}`;
}

function preprocessMarkdownForTelegram(markdown: string): string {
    const normalizedMarkdown = markdown.replace(/\r\n?/g, "\n");
    const lines = normalizedMarkdown.split("\n");
    const processed: string[] = [];
    let activeFence: "markdown" | "plain" | null = null;

    for (const line of lines) {
        const fenceMatch = line.match(/^```([A-Za-z0-9_-]+)?\s*$/);

        if (fenceMatch) {
            const language = (fenceMatch[1] ?? "").toLowerCase();

            if (activeFence === "markdown") {
                activeFence = null;
                continue;
            }

            if (activeFence === "plain") {
                processed.push(line);
                activeFence = null;
                continue;
            }

            if (language === "md" || language === "markdown") {
                activeFence = "markdown";
                continue;
            }

            activeFence = "plain";
            processed.push(line);
            continue;
        }

        processed.push(line);
    }

    return processed.join("\n");
}

export function formatContextFooter(context: OpenCodeContextUsage | null | undefined, copy: BotCopy = BOT_COPY, durationMs?: number | null): string {
    const capacity = context?.capacity;
    const used = context?.used;
    const validCapacity = typeof capacity === "number" && Number.isFinite(capacity) && capacity > 0;
    const remaining = validCapacity && typeof used === "number" && Number.isFinite(used) && used >= 0
        ? copy.replyMetrics.remaining(Math.round(Math.max(0, Math.min(1, 1 - used / capacity)) * 100))
        : copy.replyMetrics.notAvailable;
    const length = validCapacity
        ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(capacity)
        : copy.replyMetrics.notAvailable;
    const contextText = `${copy.replyMetrics.contextLabel}: ${remaining} | ${length}`;
    if (durationMs === undefined) {
        return contextText;
    }
    if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) {
        return `${contextText}\n${copy.replyMetrics.durationLabel}: ${copy.replyMetrics.notAvailable}`;
    }
    const seconds = Math.round(durationMs / 100) / 10;
    const [value, unit] = seconds >= 3_600 ? [seconds / 3_600, "h"] : seconds >= 60 ? [seconds / 60, "m"] : [seconds, "s"];
    return `${contextText}\n${copy.replyMetrics.durationLabel}: ${Number(value.toFixed(1))}${unit}`;
}

export function buildTelegramSessionFooter(context: OpenCodeContextUsage | null | undefined, copy: BotCopy, durationMs: number | null): TelegramStaticReply<"HTML"> {
    const session = context?.session;
    const safe = (value: string | null | undefined) => value ? redactSensitiveText(value).replace(/[\r\n\t]/gu, " ").trim() || copy.replyMetrics.notAvailable : copy.replyMetrics.notAvailable;
    const directory = safe(session?.directory);
    const home = homedir();
    const workspace = directory.startsWith(`${home}/`) ? `~${directory.slice(home.length)}` : directory;
    const model = session?.modelName ? safe([session.providerID, session.modelName].filter(Boolean).join(" / ")) : copy.replyMetrics.notAvailable;
    const variant = session ? safe(session.variant ?? copy.replyMetrics.defaultReasoning) : copy.replyMetrics.notAvailable;
    const agent = safe(session?.agentName);
    const metrics = formatContextFooter(context, copy, durationMs).split("\n");
    const field = (label: string, value: string) => `<b>${escapeTelegramHtml(label)}</b>: ${escapeTelegramHtml(value)}`;
    return {
        preferred: {
            text: [
                `<b>${escapeTelegramHtml(copy.replyMetrics.workspaceLabel)}</b>: <code>${escapeTelegramHtml(workspace)}</code>`,
                field(copy.replyMetrics.modelLabel, `${model}(${variant})`),
                field(copy.replyMetrics.agentLabel, agent),
                ...metrics.map((line) => field(line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 2))),
            ].join("<br/>"),
            options: { parse_mode: "HTML" },
        },
        fallback: {
            text: [
                `${copy.replyMetrics.workspaceLabel}: ${workspace}`,
                `${copy.replyMetrics.modelLabel}: ${model}(${variant})`,
                `${copy.replyMetrics.agentLabel}: ${agent}`,
                ...metrics,
            ].join("\n"),
        },
    };
}

export function escapeTelegramHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
