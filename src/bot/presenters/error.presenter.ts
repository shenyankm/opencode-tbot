export function presentError(error: unknown): string {
    if (error instanceof Error) {
        return `Error: ${error.message}`;
    }
    return "Unknown error";
}