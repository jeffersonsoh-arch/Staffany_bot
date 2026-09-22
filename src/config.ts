import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

export const config = {
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  staffanyApiKey: required("STAFFANY_API_KEY"),
  staffanyBaseUrl: process.env.STAFFANY_API_BASE_URL ?? "https://api.staffany.com",
  timezone: process.env.STAFFANY_TIMEZONE ?? "Asia/Singapore",
};
