export async function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
        void operation.catch(() => undefined);
        throw signal.reason;
    }
    if (!signal) return operation;
    return new Promise<T>((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        void operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
}
