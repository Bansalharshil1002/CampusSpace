import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const configPath = resolve(".output/server/wrangler.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));

// Nitro writes Windows separators on Windows; Workers needs POSIX paths.
config.assets = config.assets ?? {};
config.assets.directory = "../public";

const workerName = process.env.RST_WORKER_NAME?.trim();
if (workerName) config.name = workerName;

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Patched ${configPath} (worker: ${config.name})`);
