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

const ANSI_ESCAPE_REGEX = /\x1B\[[0-?]*[ -/]*[@-~]/g;

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

function normalizeKey(rawKey: string): string {
  return rawKey.trim().replace(/[\s-]+/g, "_").toUpperCase();
}

function parseEnvLine(rawLine: string): { key: string; value: string } | null {
  const line = rawLine.replace(ANSI_ESCAPE_REGEX, "").trim();
  if (!line || line.startsWith("unset ")) {
    return null;
  }

  const patterns = [
    /^\$env:([A-Za-z_][A-Za-z0-9_\s-]*)\s*=\s*(.+)$/i, // PowerShell
    /^set\s+([A-Za-z_][A-Za-z0-9_\s-]*)\s*=\s*(.+)$/i, // cmd
    /^set\s+-gx\s+([A-Za-z_][A-Za-z0-9_\s-]*)\s+(.+)$/i, // fish
    /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_\s-]*)\s*=\s*(.+)$/i, // sh/zsh
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      return {
        key: normalizeKey(match[1]),
        value: unwrapQuotedValue(match[2]),
      };
    }
  }

  return null;
}

function hydrateEnvFromText(text: string): void {
  const wanted = new Set(CCR_ENV_KEYS);
  for (const rawLine of text.split(/\r?\n/)) {
    const parsed = parseEnvLine(rawLine);
    if (!parsed) {
      continue;
    }

    if (wanted.has(parsed.key as (typeof CCR_ENV_KEYS)[number])) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

function fallbackHydrateEnvViaShell(): void {
  try {
    if (process.platform === "win32") {
      const envDump = execSync(
        'powershell -NoProfile -Command "Invoke-Expression (& ccr activate); Get-ChildItem Env: | ForEach-Object { \\"$($_.Name)=$($_.Value)\\" }"',
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      hydrateEnvFromText(envDump);
      return;
    }

    const envDump = execSync('sh -lc \'eval "$(ccr activate)"; env\'', {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    hydrateEnvFromText(envDump);
  } catch {
    // Keep original behavior: final error will explain missing env.
  }
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

  hydrateEnvFromText(activateOutput);

  if (!process.env.ANTHROPIC_BASE_URL) {
    fallbackHydrateEnvViaShell();
  }

  if (!process.env.ANTHROPIC_BASE_URL) {
    throw new Error(
      "找不到 ANTHROPIC_BASE_URL。請先執行 `ccr start`，並確認 `ccr activate` 可正常輸出環境變數。",
    );
  }
}
