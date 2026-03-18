import { BOT_COPY } from "../../bot/copy.js";
import type {
    PromptSessionMetrics,
    PromptSessionResult,
} from "../opencode/opencode.client.js";

const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;
const TRUNCATED_SUFFIX = "...";
const MARKDOWN_SPECIAL_CHARACTERS = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

export interface TelegramReplyPayload {
    options?: {
        parse_mode: "MarkdownV2";
    };
    text: string;
}

export interface TelegramPromptReply {
    fallback: TelegramReplyPayload;
    preferred: TelegramReplyPayload;
}

export function buildTelegramPromptReply(result: PromptSessionResult): TelegramPromptReply {
    const renderedMarkdown = result.bodyMd ? renderMarkdownToTelegramMarkdownV2(result.bodyMd) : null;
    const footerPlain = formatPlainMetricsFooter(result.metrics);
    const plainBody = normalizePlainBody(result, renderedMarkdown !== null);
    const fallback = {
        text: joinBodyAndFooter(
            truncatePlainBody(plainBody, footerPlain),
            footerPlain,
        ),
    };

    if (!renderedMarkdown) {
        return {
            preferred: fallback,
            fallback,
        };
    }

    const footerMarkdown = formatMarkdownMetricsFooter(result.metrics);
    const markdownText = joinBodyAndFooter(renderedMarkdown, footerMarkdown);

    if (markdownText.length > MAX_TELEGRAM_MESSAGE_LENGTH) {
        return {
            preferred: fallback,
            fallback,
        };
    }

    return {
        preferred: {
            text: markdownText,
            options: {
                parse_mode: "MarkdownV2",
            },
        },
        fallback,
    };
}

export function renderMarkdownToTelegramMarkdownV2(markdown: string): string | null {
    const normalizedMarkdown = preprocessMarkdownForTelegram(markdown).trim();

    if (!normalizedMarkdown) {
        return null;
    }

    const lines = normalizedMarkdown.split("\n");
    const rendered: string[] = [];
    let inCodeBlock = false;
    let codeBlockLanguage = "";

    for (const line of lines) {
        const fenceMatch = line.match(/^```([A-Za-z0-9_-]+)?\s*$/);

        if (fenceMatch) {
            if (inCodeBlock) {
                rendered.push("```");
                inCodeBlock = false;
                codeBlockLanguage = "";
            } else {
                codeBlockLanguage = fenceMatch[1] ?? "";
                rendered.push(`\`\`\`${codeBlockLanguage}`);
                inCodeBlock = true;
            }

            continue;
        }

        if (inCodeBlock) {
            rendered.push(escapeCodeContent(line));
            continue;
        }

        if (line.includes("![")) {
            return null;
        }

        if (/^\s*\|/.test(line) || /<[/A-Za-z][^>]*>/.test(line)) {
            return null;
        }

        if (!line.trim()) {
            rendered.push("");
            continue;
        }

        const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);

        if (headingMatch) {
            rendered.push(`*${escapeMarkdownText(headingMatch[2].trim())}*`);
            continue;
        }

        const blockquoteMatch = line.match(/^\s*>\s?(.*)$/);

        if (blockquoteMatch) {
            const quote = renderInlineMarkdown(blockquoteMatch[1]);

            if (quote === null) {
                return null;
            }

            rendered.push(`>${quote ? ` ${quote}` : ""}`);
            continue;
        }

        const unorderedListMatch = line.match(/^(\s*)[-+*]\s+(.+)$/);

        if (unorderedListMatch) {
            const item = renderInlineMarkdown(unorderedListMatch[2]);

            if (item === null) {
                return null;
            }

            rendered.push(`${unorderedListMatch[1]}\\- ${item}`);
            continue;
        }

        const orderedListMatch = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/);

        if (orderedListMatch) {
            const item = renderInlineMarkdown(orderedListMatch[3]);

            if (item === null) {
                return null;
            }

            rendered.push(`${orderedListMatch[1]}${orderedListMatch[2]}\\. ${item}`);
            continue;
        }

        const paragraph = renderInlineMarkdown(line);

        if (paragraph === null) {
            return null;
        }

        rendered.push(paragraph);
    }

    if (inCodeBlock) {
        return null;
    }

    return rendered.join("\n");
}

export function stripMarkdownToPlainText(markdown: string): string {
    return preprocessMarkdownForTelegram(markdown)
        .replace(/```[A-Za-z0-9_-]*\n?/g, "")
        .replace(/```/g, "")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^\s*>\s?/gm, "")
        .replace(/^(\s*)[-+*]\s+/gm, "$1- ")
        .replace(/^(\s*)(\d+)[.)]\s+/gm, "$1$2. ")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
        .replace(/(\*\*|__)(.*?)\1/g, "$2")
        .replace(/(\*|_)(.*?)\1/g, "$2")
        .replace(/`([^`]+)`/g, "$1")
        .trim();
}

function normalizePlainBody(result: PromptSessionResult, preferStructured: boolean): string {
    const fromStructured = result.bodyMd ? stripMarkdownToPlainText(result.bodyMd) : "";
    const fromFallback = result.fallbackText.trim();
    const body = preferStructured
        ? fromStructured || fromFallback
        : fromFallback || fromStructured;

    return body.trim() || result.fallbackText || "OpenCode returned empty response.";
}

function truncatePlainBody(body: string, footer: string): string {
    const reservedLength = footer.length + 2;
    const maxBodyLength = Math.max(0, MAX_TELEGRAM_MESSAGE_LENGTH - reservedLength);

    if (body.length <= maxBodyLength) {
        return body;
    }

    return `${body.slice(0, Math.max(0, maxBodyLength - TRUNCATED_SUFFIX.length))}${TRUNCATED_SUFFIX}`;
}

function joinBodyAndFooter(body: string, footer: string): string {
    return `${body}\n\n${footer}`;
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

function formatPlainMetricsFooter(metrics: PromptSessionMetrics): string {
    return `${BOT_COPY.replyMetrics.durationLabel}: ${formatDuration(metrics.durationMs)} | ${BOT_COPY.replyMetrics.tokensLabel}: ${formatTokens(metrics.totalTokens)}`;
}

function formatMarkdownMetricsFooter(metrics: PromptSessionMetrics): string {
    return `_${escapeMarkdownText(formatPlainMetricsFooter(metrics))}_`;
}

function formatDuration(durationMs: number | null): string {
    if (durationMs === null || !Number.isFinite(durationMs)) {
        return BOT_COPY.replyMetrics.notAvailable;
    }

    if (durationMs < 1000) {
        return `${Math.round(durationMs)} ms`;
    }

    return `${(durationMs / 1000).toFixed(1)} s`;
}

function formatTokens(totalTokens: number | null): string {
    if (totalTokens === null || !Number.isFinite(totalTokens)) {
        return BOT_COPY.replyMetrics.notAvailable;
    }

    return `${Math.round(totalTokens)}`;
}

function renderInlineMarkdown(input: string): string | null {
    let output = "";
    let cursor = 0;

    while (cursor < input.length) {
        if (input.startsWith("![", cursor)) {
            return null;
        }

        if (input.startsWith("**", cursor) || input.startsWith("__", cursor)) {
            const delimiter = input.slice(cursor, cursor + 2);
            const closingIndex = input.indexOf(delimiter, cursor + 2);

            if (closingIndex > cursor + 2) {
                output += `*${escapeMarkdownText(input.slice(cursor + 2, closingIndex))}*`;
                cursor = closingIndex + 2;
                continue;
            }
        }

        if (input[cursor] === "*" || input[cursor] === "_") {
            const delimiter = input[cursor];
            const closingIndex = input.indexOf(delimiter, cursor + 1);

            if (closingIndex > cursor + 1) {
                output += `_${escapeMarkdownText(input.slice(cursor + 1, closingIndex))}_`;
                cursor = closingIndex + 1;
                continue;
            }
        }

        if (input[cursor] === "`") {
            const closingIndex = input.indexOf("`", cursor + 1);

            if (closingIndex === -1) {
                return null;
            }

            output += `\`${escapeCodeContent(input.slice(cursor + 1, closingIndex))}\``;
            cursor = closingIndex + 1;
            continue;
        }

        if (input[cursor] === "[") {
            const linkMatch = input.slice(cursor).match(/^\[([^\]]+)\]\(([^)\s]+)\)/);

            if (!linkMatch) {
                return null;
            }

            output += `[${escapeMarkdownText(linkMatch[1])}](${escapeLinkDestination(linkMatch[2])})`;
            cursor += linkMatch[0].length;
            continue;
        }

        output += escapeMarkdownText(input[cursor]);
        cursor += 1;
    }

    return output;
}

function escapeMarkdownText(text: string): string {
    return text.replace(MARKDOWN_SPECIAL_CHARACTERS, "\\$1");
}

function escapeCodeContent(text: string): string {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`");
}

function escapeLinkDestination(url: string): string {
    return url
        .replace(/\\/g, "\\\\")
        .replace(/\)/g, "\\)")
        .replace(/\(/g, "\\(");
}
