import {
    loadAppConfig,
    type LoadAppConfigOptions,
    type AppConfig,
    type PluginConfigSource,
} from "./config.js";
import {
    createAppContainer,
    type AppContainer,
} from "./container.js";
import type { OpenCodeSdkClientLike } from "../services/opencode/opencode.client.js";

export function bootstrapPluginApp(
    client: OpenCodeSdkClientLike,
    configSource: PluginConfigSource | undefined = {},
    options: LoadAppConfigOptions = {},
): { config: AppConfig; container: AppContainer } {
    const config = loadAppConfig(configSource, options);

    return {
        config,
        container: createAppContainer(config, client),
    };
}
