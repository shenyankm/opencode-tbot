import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const GLOBAL_PLUGIN_DIRECTORY_NAME = "opencode-tbot";
export const GLOBAL_PLUGIN_CONFIG_FILE_NAME = "config.json";
export const OPENCODE_CONFIG_FILE_NAME = "opencode.json";
export const OPENCODE_CONFIG_JSONC_FILE_NAME = "opencode.jsonc";

export function getOpenCodeConfigDirectory(homeDir: string = homedir()): string {
    return join(homeDir, ".config", "opencode");
}

export function getOpenCodeConfigFilePath(homeDir: string = homedir()): string {
    return join(getOpenCodeConfigDirectory(homeDir), OPENCODE_CONFIG_FILE_NAME);
}

export function getOpenCodeJsoncConfigFilePath(homeDir: string = homedir()): string {
    return join(getOpenCodeConfigDirectory(homeDir), OPENCODE_CONFIG_JSONC_FILE_NAME);
}

export async function resolveWritableOpenCodeConfigFilePath(homeDir: string = homedir()): Promise<string> {
    const jsoncConfigFilePath = getOpenCodeJsoncConfigFilePath(homeDir);

    if (await pathExists(jsoncConfigFilePath)) {
        return jsoncConfigFilePath;
    }

    const jsonConfigFilePath = getOpenCodeConfigFilePath(homeDir);

    if (await pathExists(jsonConfigFilePath)) {
        return jsonConfigFilePath;
    }

    return jsonConfigFilePath;
}

export function getGlobalPluginConfigFilePath(homeDir: string = homedir()): string {
    return join(
        getOpenCodeConfigDirectory(homeDir),
        GLOBAL_PLUGIN_DIRECTORY_NAME,
        GLOBAL_PLUGIN_CONFIG_FILE_NAME,
    );
}

export function getOpenCodeLogDirectory(homeDir: string = homedir()): string {
    return join(homeDir, ".local", "share", "opencode", "log");
}

export function getDefaultPluginLogDirectory(homeDir: string = homedir()): string {
    return join(getOpenCodeLogDirectory(homeDir), "plugins", "opencode-tbot");
}

async function pathExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch (error) {
        if (isMissingFileError(error)) {
            return false;
        }

        throw error;
    }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
