import { OpenCode } from "@opencode/client";
import { Service } from "@opencode/client/service";
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

export async function createPluginSdkClient(
    context: { location: { directory: string } },
    discover: typeof Service.discover = Service.discover,
): Promise<OpenCodeSdkClientLike> {
    const endpoint = await discover({ version: (version) => version.startsWith("2.") });

    if (!endpoint) {
        throw new Error("OpenCode V2 service is unavailable. Start OpenCode with opencode serve --service.");
    }

    const client = OpenCode.make({
        baseUrl: endpoint.url,
        headers: {
            ...Service.headers(endpoint),
            "x-opencode-directory": encodeURIComponent(context.location.directory),
        },
    });
    const info = await client.server.info({ signal: AbortSignal.timeout(10_000) });

    if (info.pid !== process.pid) {
        throw new Error("The registered OpenCode V2 service does not own this plugin instance.");
    }

    return client;
}

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
