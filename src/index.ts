import { bootstrap } from "./app/bootstrap.js";

async function main() {
    const { bot, container } = bootstrap();

    container.logger.info("bot starting...");
    await bot.start();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});