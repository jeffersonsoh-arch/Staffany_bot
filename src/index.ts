import { createBot } from "./bot.js";

const bot = createBot();

bot
  .launch()
  .then(() => console.log("StaffAny Telegram bot is running."))
  .catch((err) => {
    console.error("Failed to start bot:", err);
    process.exit(1);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
