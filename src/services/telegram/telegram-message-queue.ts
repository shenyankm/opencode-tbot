import { setTimeout } from "node:timers/promises";

export async function retryTelegramRequest<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            const delay = getRetryDelay(error);
            if (delay === null || attempt >= 3) {
                throw error;
            }
            await setTimeout(delay * 1_000);
        }
    }
}

function getRetryDelay(error: unknown): number | null {
    if (!error || typeof error !== "object" || !("error_code" in error) || error.error_code !== 429) {
        return null;
    }
    const parameters = "parameters" in error ? error.parameters : null;
    if (!parameters || typeof parameters !== "object" || !("retry_after" in parameters)) {
        return null;
    }
    return typeof parameters.retry_after === "number" && Number.isFinite(parameters.retry_after) && parameters.retry_after >= 0
        ? parameters.retry_after
        : null;
}
