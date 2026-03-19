const REDACTED = "[REDACTED]";
const DEFAULT_PREVIEW_LENGTH = 160;
const TELEGRAM_TOKEN_PATTERN = /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi;
const NAMED_SECRET_PATTERN = /\b(api[_\s-]?key|token|secret|password)\b(\s*[:=]\s*)([^\s,;]+)/gi;
const API_KEY_LIKE_PATTERN = /\b(?:sk|pk)_[A-Za-z0-9_-]{10,}\b/g;

export function redactSensitiveText(input: string): string {
    return input
        .replace(BEARER_TOKEN_PATTERN, `Bearer ${REDACTED}`)
        .replace(TELEGRAM_TOKEN_PATTERN, REDACTED)
        .replace(NAMED_SECRET_PATTERN, (_, name: string, separator: string) => `${name}${separator}${REDACTED}`)
        .replace(API_KEY_LIKE_PATTERN, REDACTED);
}

export function createRedactedPreview(input: string, maxLength = DEFAULT_PREVIEW_LENGTH): string {
    const redacted = redactSensitiveText(input).replace(/\s+/g, " ").trim();

    if (redacted.length <= maxLength) {
        return redacted;
    }

    return `${redacted.slice(0, Math.max(0, maxLength - 3))}...`;
}
