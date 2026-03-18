import { bootstrap } from "./app/bootstrap.js";
import { syncTelegramCommands } from "./bot/commands/sync-commands.js";

async function main() {
    const { bot, container } = bootstrap();

    container.logger.info("bot starting...");
    await syncTelegramCommands(bot, container.logger);
    await bot.start();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
