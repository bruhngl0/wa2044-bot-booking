import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync } from "fs";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("=".repeat(60));
console.log("🔍 .ENV FILE DIAGNOSTIC");
console.log("=".repeat(60));

// 1. Check current working directory
console.log("\n📁 Current Working Directory:");
console.log("  ", process.cwd());

// 2. Check script directory
console.log("\n📁 Script Directory:");
console.log("  ", __dirname);

// 3. Look for .env file in multiple locations
const possiblePaths = [
  join(process.cwd(), ".env"),
  join(__dirname, ".env"),
  join(__dirname, "..", ".env"),
  join(__dirname, "../..", ".env"),
];

console.log("\n🔎 Checking for .env file in:");
possiblePaths.forEach((path) => {
  const exists = existsSync(path);
  console.log(`  ${exists ? "✅" : "❌"} ${path}`);

  if (exists) {
    console.log("\n📄 .env File Contents (first 500 chars):");
    try {
      const content = readFileSync(path, "utf8");
      console.log("---");
      console.log(content.substring(0, 500));
      console.log("---");

      // Check for common issues
      console.log("\n🔍 Checking for common .env issues:");

      const lines = content
        .split("\n")
        .filter((line) => line.trim() && !line.startsWith("#"));
      console.log(`  Total non-empty lines: ${lines.length}`);

      // Check for spaces around =
      const hasSpaces = lines.some(
        (line) =>
          line.includes(" = ") || line.includes("= ") || line.includes(" ="),
      );
      console.log(
        `  ${hasSpaces ? "⚠️" : "✅"} Spaces around = (should be none)`,
      );

      // Check for quotes
      const hasQuotes = lines.some(
        (line) => line.includes('"') || line.includes("'"),
      );
      console.log(
        `  ${hasQuotes ? "⚠️" : "✅"} Contains quotes (usually not needed)`,
      );

      // Check for BOM
      const hasBOM = content.charCodeAt(0) === 0xfeff;
      console.log(`  ${hasBOM ? "⚠️" : "✅"} BOM (Byte Order Mark) at start`);

      // Try to load it
      console.log("\n🔧 Attempting to load with dotenv:");
      const result = dotenv.config({ path });
      console.log(
        `  Parsed keys: ${Object.keys(result.parsed || {}).join(", ")}`,
      );
    } catch (err) {
      console.log("  ❌ Error reading file:", err.message);
    }
  }
});

// 4. Check environment variables after loading
console.log("\n🌍 Current Environment Variables (WATI related):");
console.log(
  "  WATI_API_ENDPOINT:",
  process.env.WATI_API_ENDPOINT || "❌ NOT SET",
);
console.log(
  "  WATI_ACCESS_TOKEN:",
  process.env.WATI_ACCESS_TOKEN
    ? `${process.env.WATI_ACCESS_TOKEN.substring(0, 30)}...`
    : "❌ NOT SET",
);
console.log("  WATI_TEST_MODE:", process.env.WATI_TEST_MODE || "❌ NOT SET");
console.log(
  "  WHATSAPP_BOT_URL:",
  process.env.WHATSAPP_BOT_URL || "❌ NOT SET",
);

console.log("\n" + "=".repeat(60));
console.log("💡 RECOMMENDATIONS:");
console.log("=".repeat(60));

if (!existsSync(join(process.cwd(), ".env"))) {
  console.log("❌ No .env file found in current directory!");
  console.log("   Create .env file in: " + process.cwd());
  console.log("\n   Quick fix:");
  console.log("   cd " + process.cwd());
  console.log("   touch .env");
} else {
  console.log("✅ .env file exists in current directory");

  if (!process.env.WATI_API_ENDPOINT) {
    console.log("\n⚠️  Variables not loading properly. Common causes:");
    console.log("   1. Spaces around = sign (remove them)");
    console.log("   2. Quotes around values (remove them unless needed)");
    console.log("   3. File encoding issue (save as UTF-8 without BOM)");
    console.log("   4. Running script from wrong directory");
  }
}

console.log("\n✅ Correct .env format:");
console.log("---");
console.log("WATI_API_ENDPOINT=https://live-mt-server.wati.io/1051702");
console.log("WATI_ACCESS_TOKEN=Bearer eyJhbGci...");
console.log("WATI_TEST_MODE=false");
console.log(
  "WHATSAPP_BOT_URL=https://cira-interadditive-dixie.ngrok-free.dev/whatsapp",
);
console.log("---");
console.log("(No spaces, no quotes, no empty lines at the start)\n");
