import { BOT_COPY, type BotCopy } from "../../bot/copy.js";
import { stripMarkdownToPlainText } from "../../infra/utils/markdown-text.js";
import type {
    PromptSessionMetrics,
    PromptSessionResult,
} from "../opencode/opencode.client.js";

const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;
const TRUNCATED_SUFFIX = "...";
const MARKDOWN_SPECIAL_CHARACTERS = /([_*\[\]()~`>#+\-=|{}.!\\])/g;
export { stripMarkdownToPlainText } from "../../infra/utils/markdown-text.js";

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

export interface TelegramStaticReply {
    fallback: TelegramReplyPayload;
    preferred: TelegramReplyPayload;
}

export function buildTelegramPromptReply(
    result: PromptSessionResult,
    copy: BotCopy = BOT_COPY,
): TelegramPromptReply {
    const renderedMarkdown = result.bodyMd ? renderMarkdownToTelegramMarkdownV2(result.bodyMd) : null;
    const footerPlain = formatPlainMetricsFooter(result.metrics, copy);
    const plainBody = normalizePlainBody(result, copy);
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

    const footerMarkdown = formatMarkdownMetricsFooter(result.metrics, copy);
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

export function buildTelegramStaticReply(markdown: string): TelegramStaticReply {
    const renderedMarkdown = renderMarkdownToTelegramMarkdownV2(markdown);
    const plainText = truncateStaticText(stripMarkdownToPlainText(markdown) || markdown.trim());
    const fallback = {
        text: plainText,
    };

    if (!renderedMarkdown || renderedMarkdown.length > MAX_TELEGRAM_MESSAGE_LENGTH) {
        return {
            preferred: fallback,
            fallback,
        };
    }

    return {
        preferred: {
            text: renderedMarkdown,
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

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
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

        const tableBlock = consumeMarkdownTable(lines, index);

        if (tableBlock) {
            rendered.push(renderTableAsTelegramCodeBlock(tableBlock.rows));
            index = tableBlock.nextIndex - 1;
            continue;
        }

        if (/<[/A-Za-z][^>]*>/.test(line)) {
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

function normalizePlainBody(
    result: PromptSessionResult,
    copy: BotCopy,
): string {
    const fromStructured = result.bodyMd ? stripMarkdownToPlainText(result.bodyMd) : "";
    const fromFallback = result.fallbackText.trim();
    const body = fromStructured || fromFallback;

    return body.trim() || result.fallbackText || copy.prompt.emptyResponse;
}

function truncatePlainBody(body: string, footer: string): string {
    const reservedLength = footer.length + 2;
    const maxBodyLength = Math.max(0, MAX_TELEGRAM_MESSAGE_LENGTH - reservedLength);

    if (body.length <= maxBodyLength) {
        return body;
    }

    return `${body.slice(0, Math.max(0, maxBodyLength - TRUNCATED_SUFFIX.length))}${TRUNCATED_SUFFIX}`;
}

function truncateStaticText(text: string): string {
    if (text.length <= MAX_TELEGRAM_MESSAGE_LENGTH) {
        return text;
    }

    return `${text.slice(0, Math.max(0, MAX_TELEGRAM_MESSAGE_LENGTH - TRUNCATED_SUFFIX.length))}${TRUNCATED_SUFFIX}`;
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

function formatPlainMetricsFooter(metrics: PromptSessionMetrics, copy: BotCopy): string {
    return `${copy.replyMetrics.durationLabel}: ${formatDuration(metrics.durationMs, copy)} | ${copy.replyMetrics.tokensLabel}: ${formatMetricValue(metrics.tokens.total, copy)}`;
}

function formatMarkdownMetricsFooter(metrics: PromptSessionMetrics, copy: BotCopy): string {
    return escapeMarkdownText(formatPlainMetricsFooter(metrics, copy));
}

function formatDuration(durationMs: number | null, copy: BotCopy): string {
    if (durationMs === null || !Number.isFinite(durationMs)) {
        return copy.replyMetrics.notAvailable;
    }

    if (durationMs < 1000) {
        return `${Math.round(durationMs)} ms`;
    }

    return `${(durationMs / 1000).toFixed(1)} s`;
}

function formatMetricValue(value: number | null, copy: BotCopy): string {
    if (value === null || !Number.isFinite(value)) {
        return copy.replyMetrics.notAvailable;
    }

    return `${Math.round(value)}`;
}

interface ConsumedTable {
    nextIndex: number;
    rows: string[][];
}

function consumeMarkdownTable(lines: string[], startIndex: number): ConsumedTable | null {
    if (startIndex + 1 >= lines.length) {
        return null;
    }

    const headerCells = parseMarkdownTableRow(lines[startIndex]);
    const separatorCells = parseMarkdownTableSeparator(lines[startIndex + 1]);

    if (!headerCells || !separatorCells || headerCells.length !== separatorCells.length) {
        return null;
    }

    const rows = [headerCells];
    let index = startIndex + 2;

    while (index < lines.length) {
        const rowCells = parseMarkdownTableRow(lines[index]);

        if (!rowCells || rowCells.length !== headerCells.length) {
            break;
        }

        rows.push(rowCells);
        index += 1;
    }

    return {
        rows,
        nextIndex: index,
    };
}

function parseMarkdownTableRow(line: string): string[] | null {
    const trimmed = line.trim();

    if (!trimmed.includes("|")) {
        return null;
    }

    const cells = splitMarkdownTableCells(trimmed)
        .map((cell) => normalizeTableCell(cell));

    return cells.length >= 2 ? cells : null;
}

function parseMarkdownTableSeparator(line: string): string[] | null {
    const cells = splitMarkdownTableCells(line.trim());

    if (cells.length < 2) {
        return null;
    }

    return cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
        ? cells
        : null;
}

function splitMarkdownTableCells(line: string): string[] {
    const content = line
        .replace(/^\|/, "")
        .replace(/\|$/, "");
    const cells: string[] = [];
    let current = "";
    let escaped = false;

    for (const char of content) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }

        if (char === "\\") {
            escaped = true;
            current += char;
            continue;
        }

        if (char === "|") {
            cells.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    cells.push(current);
    return cells;
}

function normalizeTableCell(cell: string): string {
    return cell
        .trim()
        .replace(/\\\|/g, "|")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
        .replace(/(\*\*|__)(.*?)\1/g, "$2")
        .replace(/(\*|_)(.*?)\1/g, "$2")
        .replace(/`([^`]+)`/g, "$1");
}

function renderTableAsTelegramCodeBlock(rows: string[][]): string {
    return [
        "```",
        ...buildAlignedTableLines(rows).map((line) => escapeCodeContent(line)),
        "```",
    ].join("\n");
}

function buildAlignedTableLines(rows: string[][]): string[] {
    const columnWidths = calculateTableColumnWidths(rows);
    const header = formatTableRow(rows[0], columnWidths);
    const separator = columnWidths.map((width) => "-".repeat(Math.max(3, width))).join("-+-");
    const body = rows.slice(1).map((row) => formatTableRow(row, columnWidths));

    return [header, separator, ...body];
}

function calculateTableColumnWidths(rows: string[][]): number[] {
    return rows[0].map((_, columnIndex) =>
        rows.reduce((maxWidth, row) => Math.max(maxWidth, getDisplayWidth(row[columnIndex] ?? "")), 0),
    );
}

function formatTableRow(row: string[], columnWidths: number[]): string {
    return row
        .map((cell, index) => padDisplayWidth(cell, columnWidths[index] ?? 0))
        .join(" | ");
}

function padDisplayWidth(value: string, targetWidth: number): string {
    const padding = Math.max(0, targetWidth - getDisplayWidth(value));

    return `${value}${" ".repeat(padding)}`;
}

function getDisplayWidth(value: string): number {
    let width = 0;

    for (const char of value) {
        width += isWideCharacter(char.codePointAt(0) ?? 0) ? 2 : 1;
    }

    return width;
}

function isWideCharacter(codePoint: number): boolean {
    return codePoint >= 0x1100 && (
        codePoint <= 0x115f ||
        codePoint === 0x2329 ||
        codePoint === 0x232a ||
        (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
        (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
        (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
        (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
        (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
        (codePoint >= 0xff00 && codePoint <= 0xff60) ||
        (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    );
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
