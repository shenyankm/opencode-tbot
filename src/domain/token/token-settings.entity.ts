export interface TokenMetricValues {
    input: number | null;
    output: number | null;
    reasoning: number | null;
    cacheRead: number | null;
    cacheWrite: number | null;
}

export const DEFAULT_TOKEN_SHOW_BREAKDOWN = false;

export function calculateDisplayedTokenTotal(
    values: TokenMetricValues,
): number | null {
    const metrics = [
        values.input,
        values.output,
        values.reasoning,
        values.cacheRead,
        values.cacheWrite,
    ];

    if (metrics.every((value) => value === null)) {
        return null;
    }

    const total = metrics.reduce<number>((sum, value) => sum + (value ?? 0), 0);

    return Number.isFinite(total)
        ? total
        : null;
}
