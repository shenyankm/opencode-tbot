import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const OPENCODE_TBOT_VERSION = resolvePackageVersion();

function resolvePackageVersion(): string {
    let directory = dirname(fileURLToPath(import.meta.url));

    while (true) {
        const packageFilePath = join(directory, "package.json");

        if (existsSync(packageFilePath)) {
            try {
                const parsed = JSON.parse(readFileSync(packageFilePath, "utf8")) as {
                    version?: unknown;
                };

                if (typeof parsed.version === "string" && parsed.version.trim().length > 0) {
                    return parsed.version;
                }
            } catch {
                // Fall through and continue searching parent directories.
            }
        }

        const parentDirectory = dirname(directory);

        if (parentDirectory === directory) {
            break;
        }

        directory = parentDirectory;
    }

    return "unknown";
}
