import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { setImmediate } from "node:timers/promises";

const STATE_UPDATE_BATCH_SIZE = 20;

export interface JsonStateStoreOptions<TState> {
    createDefaultState: () => TState;
    filePath: string;
    validate?: (state: unknown) => TState;
}

interface PendingUpdate<TState> {
    mutate: (state: TState) => void;
    resolve: () => void;
    reject: (error: unknown) => void;
}

export class JsonStateStore<TState> {
    private readonly createDefaultState: () => TState;
    private readonly filePath: string;
    private readonly validate?: (state: unknown) => TState;
    private statePromise: Promise<TState> | null = null;
    private writeQueue = Promise.resolve();
    private readonly pendingUpdates: PendingUpdate<TState>[] = [];

    constructor(options: JsonStateStoreOptions<TState>) {
        this.createDefaultState = options.createDefaultState;
        this.filePath = options.filePath;
        this.validate = options.validate;
    }

    async read(): Promise<TState> {
        const state = await this.loadState();

        return cloneState(state);
    }

    async select<TResult>(selector: (state: Readonly<TState>) => TResult): Promise<TResult> {
        const state = await this.loadState();

        return cloneState(selector(state));
    }

    update(mutator: (state: TState) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            this.pendingUpdates.push({ mutate: mutator, resolve, reject });
            if (this.pendingUpdates.length > 1) return;
            this.writeQueue = this.writeQueue.then(() => this.flushUpdates());
        });
    }

    private async flushUpdates(): Promise<void> {
        const pending = this.pendingUpdates.splice(0, STATE_UPDATE_BATCH_SIZE);
        if (this.pendingUpdates.length) {
            this.writeQueue = this.writeQueue.then(() => this.flushUpdates());
        }
        const applied: PendingUpdate<TState>[] = [];
        const batching = pending.length > 1;
        try {
            let draft: TState = await this.loadState();
            let serialized = batching ? JSON.stringify(draft) : "";
            for (const update of pending) {
                try {
                    const next: TState = batching ? JSON.parse(serialized) : cloneState(draft);
                    update.mutate(next);
                    if (batching) serialized = JSON.stringify(next);
                    draft = next;
                    applied.push(update);
                } catch (error) {
                    update.reject(error);
                }
                // Keep streaming events responsive while cloning a batch of large states.
                if (batching) await setImmediate();
            }
            if (!applied.length) return;
            // Acknowledge the whole batch only after its shared atomic commit succeeds.
            await writeStateFile(this.filePath, draft);
            this.statePromise = Promise.resolve(draft);
            for (const update of applied) update.resolve();
        } catch (error) {
            for (const update of pending) update.reject(error);
        }
    }

    private async loadState(): Promise<TState> {
        if (!this.statePromise) {
            this.statePromise = readStateFile(this.filePath, this.createDefaultState).then((state) => this.validate ? this.validate(state) : state).catch((error) => {
                this.statePromise = null;
                throw error;
            });
        }

        return this.statePromise;
    }
}

export async function readStateFile<TState>(
    filePath: string,
    createDefaultState: () => TState,
): Promise<TState> {
    try {
        const content = await readFile(filePath, "utf8");

        return JSON.parse(content) as TState;
    } catch (error) {
        if (isMissingFileError(error)) {
            return createDefaultState();
        }

        throw error;
    }
}

export async function writeStateFile<TState>(filePath: string, state: TState): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });

    const temporaryFilePath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    const serialized = `${JSON.stringify(state, null, 2)}\n`;

    try {
        await writeFile(temporaryFilePath, serialized, { encoding: "utf8", mode: 0o600 });
        await rename(temporaryFilePath, filePath);
    } catch (error) {
        // Cleanup must not replace the original write failure.
        await unlink(temporaryFilePath).catch(() => {});
        throw error;
    }
}

function cloneState<TState>(state: TState): TState {
    return JSON.parse(JSON.stringify(state)) as TState;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
