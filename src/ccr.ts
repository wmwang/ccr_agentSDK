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

function unwrapQuotedValue(rawValue: string): string {
  const value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function extractEnvValue(activateOutput: string, key: string): string | undefined {
  for (const rawLine of activateOutput.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const exportPrefix = `export ${key}=`;
    if (line.startsWith(exportPrefix)) {
      return unwrapQuotedValue(line.slice(exportPrefix.length));
    }

    const fishPrefix = `set -gx ${key} `;
    if (line.startsWith(fishPrefix)) {
      return unwrapQuotedValue(line.slice(fishPrefix.length));
    }

    const kvPrefix = `${key}=`;
    if (line.startsWith(kvPrefix)) {
      return unwrapQuotedValue(line.slice(kvPrefix.length));
    }

    const cmdSetPrefix = `set ${key}=`;
    if (line.toLowerCase().startsWith(cmdSetPrefix.toLowerCase())) {
      return unwrapQuotedValue(line.slice(cmdSetPrefix.length));
    }

    const psPrefix = `$env:${key}`;
    if (line.toLowerCase().startsWith(psPrefix.toLowerCase())) {
      const idx = line.indexOf("=");
      if (idx >= 0) {
        return unwrapQuotedValue(line.slice(idx + 1));
      }
    }
  }

  return undefined;
}

export function setupCcrEnvironment(): void {
  let activateOutput: string;

  try {
    activateOutput = execSync("ccr activate", {
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
    const value = extractEnvValue(activateOutput, key);
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
