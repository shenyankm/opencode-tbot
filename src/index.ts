import { run } from "@grammyjs/runner";
import { bootstrap } from "./app/bootstrap.js";
import { syncTelegramCommands } from "./bot/commands/sync-commands.js";

async function main() {
    const { bot, container } = bootstrap();

    container.logger.info("bot starting...");
    await syncTelegramCommands(bot, container.logger);
    const runner = run(bot);

    const stop = () => {
        runner.stop();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
