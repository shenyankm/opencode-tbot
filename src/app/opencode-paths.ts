import { homedir } from "node:os";
import { join } from "node:path";

export const GLOBAL_PLUGIN_DIRECTORY_NAME = "opencode-tbot";
export const GLOBAL_PLUGIN_CONFIG_FILE_NAME = "config.json";
export const OPENCODE_CONFIG_FILE_NAME = "opencode.json";

export function getOpenCodeConfigDirectory(homeDir: string = homedir()): string {
    return join(homeDir, ".config", "opencode");
}

export function getOpenCodeConfigFilePath(homeDir: string = homedir()): string {
    return join(getOpenCodeConfigDirectory(homeDir), OPENCODE_CONFIG_FILE_NAME);
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
