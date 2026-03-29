import { execSync } from "node:child_process";

const CCR_ENV_KEYS = [
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "NO_PROXY",
  "DISABLE_TELEMETRY",
  "DISABLE_COST_WARNINGS",
  "API_TIMEOUT_MS",
] as const;

function extractEnvValue(envDump: string, key: string): string | undefined {
  const line = envDump
    .split("\n")
    .find((entry) => entry.startsWith(`${key}=`));

  if (!line) {
    return undefined;
  }

  const value = line.slice(key.length + 1);
  return value.length > 0 ? value : undefined;
}

export function setupCcrEnvironment(): void {
  let envDump: string;

  try {
    envDump = execSync('zsh -lc \'eval "$(ccr activate)"; env\'', {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error while running ccr activate.";
    throw new Error(
      `無法啟用 Claude Code Router。請先確認已安裝並可執行 \`ccr\`，且 Router 已完成設定。\n原始錯誤: ${message}`,
    );
  }

  for (const key of CCR_ENV_KEYS) {
    const value = extractEnvValue(envDump, key);
    if (value) {
      process.env[key] = value;
    }
  }

  if (!process.env.ANTHROPIC_BASE_URL) {
    throw new Error(
      "找不到 ANTHROPIC_BASE_URL。請先執行 `ccr start`，並確認 `ccr activate` 可正常輸出環境變數。",
    );
  }
}
