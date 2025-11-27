import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const defaultEnvPath = resolve(__dirname, "../.env");

if (!globalThis.__ENV_LOADED__) {
  const envPath = process.env.ENV_PATH
    ? resolve(process.env.ENV_PATH)
    : defaultEnvPath;

  const result = dotenv.config({ path: envPath });
  if (result.error && process.env.NODE_ENV !== "production") {
    console.warn(
      `⚠️  Unable to load .env file at ${envPath}: ${result.error.message}`,
    );
  } else if (process.env.NODE_ENV !== "production") {
    console.log(`✅ Loaded environment variables from ${envPath}`);
  }

  globalThis.__ENV_LOADED__ = true;
}

