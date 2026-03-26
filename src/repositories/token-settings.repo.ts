import type { TokenSettingsRepository } from "../domain/token/token-settings.repository.js";
import {
    type TokenSettings,
} from "../domain/token/token-settings.entity.js";
import {
    mergePluginConfigSources,
    readPluginConfigFile,
    writePluginConfigFile,
} from "../app/plugin-config.js";

export class InMemoryTokenSettingsRepository implements TokenSettingsRepository {
    private settings: TokenSettings;

    constructor(initialSettings: TokenSettings) {
        this.settings = normalizeTokenSettings(initialSettings);
    }

    async get(): Promise<TokenSettings> {
        return {
            showBreakdown: this.settings.showBreakdown,
        };
    }

    async set(settings: TokenSettings): Promise<void> {
        this.settings = normalizeTokenSettings(settings);
    }
}

export class FileTokenSettingsRepository implements TokenSettingsRepository {
    private settings: TokenSettings;
    private writeQueue = Promise.resolve();

    constructor(
        private readonly configFilePath: string,
        initialSettings: TokenSettings,
    ) {
        this.settings = normalizeTokenSettings(initialSettings);
    }

    async get(): Promise<TokenSettings> {
        return {
            showBreakdown: this.settings.showBreakdown,
        };
    }

    async set(settings: TokenSettings): Promise<void> {
        const normalizedSettings = normalizeTokenSettings(settings);

        const nextWrite = this.writeQueue.then(async () => {
            const currentConfig = await readPluginConfigFile(this.configFilePath);
            const sanitizedConfig = sanitizeDeprecatedTokenConfig(currentConfig);
            const nextConfig = mergePluginConfigSources(sanitizedConfig, {
                tokens: {
                    showBreakdown: normalizedSettings.showBreakdown,
                },
            });

            await writePluginConfigFile(this.configFilePath, nextConfig);
            this.settings = normalizedSettings;
        });

        this.writeQueue = nextWrite.then(() => undefined, () => undefined);

        await nextWrite;
    }
}

function normalizeTokenSettings(settings: TokenSettings): TokenSettings {
    return {
        showBreakdown: settings.showBreakdown === true,
    };
}

function sanitizeDeprecatedTokenConfig<TConfig extends Record<string, unknown>>(config: TConfig): TConfig {
    if (!config.tokens || typeof config.tokens !== "object" || Array.isArray(config.tokens)) {
        return config;
    }

    const nextTokens = {
        ...config.tokens,
    } as Record<string, unknown>;

    delete nextTokens.totalIncludes;

    return {
        ...config,
        tokens: nextTokens,
    };
}
