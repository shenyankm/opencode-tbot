const HTML_TAG_PATTERN = /<\/?[A-Za-z][^>]*>/g;

export function stripMarkdownToPlainText(markdown: string): string {
    const normalizedMarkdown = preprocessMarkdownForPlainText(markdown);
    const lines = normalizedMarkdown.split("\n");
    const rendered: string[] = [];

    for (let index = 0; index < lines.length; index += 1) {
        const tableBlock = consumeMarkdownTable(lines, index);

        if (tableBlock) {
            rendered.push(renderTableAsPlainText(tableBlock.rows));
            index = tableBlock.nextIndex - 1;
            continue;
        }

        rendered.push(lines[index] ?? "");
    }

    return rendered
        .join("\n")
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
        .replace(HTML_TAG_PATTERN, "")
        .trim();
}

interface ConsumedTable {
    nextIndex: number;
    rows: string[][];
}

function preprocessMarkdownForPlainText(markdown: string): string {
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

function consumeMarkdownTable(lines: string[], startIndex: number): ConsumedTable | null {
    if (startIndex + 1 >= lines.length) {
        return null;
    }

    const headerCells = parseMarkdownTableRow(lines[startIndex] ?? "");
    const separatorCells = parseMarkdownTableSeparator(lines[startIndex + 1] ?? "");

    if (!headerCells || !separatorCells || headerCells.length !== separatorCells.length) {
        return null;
    }

    const rows = [headerCells];
    let index = startIndex + 2;

    while (index < lines.length) {
        const rowCells = parseMarkdownTableRow(lines[index] ?? "");

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
        .replace(/`([^`]+)`/g, "$1")
        .replace(HTML_TAG_PATTERN, "");
}

function renderTableAsPlainText(rows: string[][]): string {
    return buildAlignedTableLines(rows).join("\n");
}

function buildAlignedTableLines(rows: string[][]): string[] {
    const columnWidths = calculateTableColumnWidths(rows);
    const header = formatTableRow(rows[0] ?? [], columnWidths);
    const separator = columnWidths.map((width) => "-".repeat(Math.max(3, width))).join("-+-");
    const body = rows.slice(1).map((row) => formatTableRow(row, columnWidths));

    return [header, separator, ...body];
}

function calculateTableColumnWidths(rows: string[][]): number[] {
    return (rows[0] ?? []).map((_, columnIndex) =>
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
