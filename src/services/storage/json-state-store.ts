import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface JsonStateStoreOptions<TState> {
    createDefaultState: () => TState;
    filePath: string;
}

export class JsonStateStore<TState> {
    private readonly createDefaultState: () => TState;
    private readonly filePath: string;
    private statePromise: Promise<TState> | null = null;
    private writeQueue = Promise.resolve();

    constructor(options: JsonStateStoreOptions<TState>) {
        this.createDefaultState = options.createDefaultState;
        this.filePath = options.filePath;
    }

    async read(): Promise<TState> {
        const state = await this.loadState();

        return cloneState(state);
    }

    async select<TResult>(selector: (state: Readonly<TState>) => TResult): Promise<TResult> {
        const state = await this.loadState();

        return cloneState(selector(state));
    }

    async update(mutator: (state: TState) => void): Promise<TState> {
        const nextStatePromise = this.writeQueue.then(async () => {
            const state = await this.loadState();
            const draft = cloneState(state);

            mutator(draft);
            await writeStateFile(this.filePath, draft);
            this.statePromise = Promise.resolve(draft);

            return cloneState(draft);
        });

        this.writeQueue = nextStatePromise.then(() => undefined, () => undefined);

        return nextStatePromise;
    }

    private async loadState(): Promise<TState> {
        if (!this.statePromise) {
            this.statePromise = readStateFile(this.filePath, this.createDefaultState);
        }

        return this.statePromise;
    }
}

async function readStateFile<TState>(
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

async function writeStateFile<TState>(filePath: string, state: TState): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });

    const temporaryFilePath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    const serialized = `${JSON.stringify(state, null, 2)}\n`;

    await writeFile(temporaryFilePath, serialized, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryFilePath, filePath);
}

function cloneState<TState>(state: TState): TState {
    return JSON.parse(JSON.stringify(state)) as TState;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
