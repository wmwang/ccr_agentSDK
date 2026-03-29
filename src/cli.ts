import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { setupCcrEnvironment } from "./ccr.js";

const DEBUG_MODE = process.argv.includes("--debug") || process.env.CLAUDE_DEBUG === "1";

function debugLog(message: string): void {
  if (!DEBUG_MODE) {
    return;
  }
  output.write(`[debug] ${message}\n`);
}

function summarizeSdkMessage(message: SDKMessage): string {
  if (message.type === "system") {
    return `system:${message.subtype}`;
  }
  if (message.type === "result") {
    return `result:${message.subtype}`;
  }
  if (message.type === "assistant") {
    return "assistant";
  }
  return message.type;
}

async function checkRouterReachability(): Promise<void> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl) {
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(baseUrl, {
      method: "GET",
      signal: controller.signal,
    });
    debugLog(`Router reachable: ${baseUrl} (HTTP ${response.status})`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `無法連到 CCR Router: ${baseUrl}。請確認在同一台機器已啟動 \`ccr start\`。詳細: ${detail}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function printAssistantMessage(message: SDKMessage): boolean {
  if (message.type !== "assistant") {
    return false;
  }

  let printed = false;
  for (const block of message.message.content) {
    if (block.type === "text" && block.text.trim()) {
      output.write(block.text);
      printed = true;
    }
  }

  return printed;
}

async function askClaude(prompt: string): Promise<void> {
  const timeoutMs = Number(process.env.CLAUDE_QUERY_TIMEOUT_MS ?? "120000");
  const abortController = new AbortController();
  let printedAnyText = false;
  let printedSystemHint = false;

  const waitingHintTimer = setTimeout(() => {
    printedSystemHint = true;
    output.write("\n[狀態] 正在等待 Claude 回應中...\n");
  }, 3000);

  const timeoutTimer = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    for await (const message of query({
      prompt,
      options: {
        cwd: process.cwd(),
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns: 8,
        abortController,
      },
    })) {
      debugLog(`event=${summarizeSdkMessage(message)}`);

      if (message.type === "assistant") {
        printedAnyText = printAssistantMessage(message) || printedAnyText;
      }

      if (message.type === "auth_status" && message.output.length > 0) {
        printedSystemHint = true;
        output.write(`\n[認證] ${message.output.join(" ")}\n`);
      }

      if (message.type === "system" && message.subtype === "api_retry") {
        printedSystemHint = true;
        output.write(
          `\n[重試] 第 ${message.attempt}/${message.max_retries} 次，${Math.ceil(message.retry_delay_ms / 1000)} 秒後重試。\n`,
        );
      }

      if (message.type === "result") {
        if (message.subtype === "success") {
          if (message.result.trim()) {
            if (printedAnyText || printedSystemHint) {
              output.write("\n");
            }
            output.write(message.result);
          }
        } else {
          const details = message.errors.join(" | ") || "Unknown execution error";
          throw new Error(`Agent 執行失敗: ${details}`);
        }
      }
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error(
        `等待逾時（>${Math.floor(timeoutMs / 1000)} 秒）。你可以檢查 ccr 狀態，或調高 CLAUDE_QUERY_TIMEOUT_MS。`,
      );
    }
    throw error;
  } finally {
    clearTimeout(waitingHintTimer);
    clearTimeout(timeoutTimer);
  }

  output.write("\n");
}

async function main(): Promise<void> {
  setupCcrEnvironment();
  await checkRouterReachability();

  const rl = createInterface({ input, output });
  output.write("Claude Agent SDK CLI (via CCR)\n");
  output.write("輸入訊息後按 Enter，輸入 /exit 離開。\n");
  if (DEBUG_MODE) {
    output.write("[debug] mode enabled\n");
  }
  output.write("\n");

  try {
    while (true) {
      const userInput = (await rl.question("你> ")).trim();

      if (!userInput) {
        continue;
      }

      if (userInput === "/exit") {
        break;
      }

      output.write("Claude> ");
      try {
        await askClaude(userInput);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.write(`\n[錯誤] ${message}\n`);
      }

      output.write("\n");
    }
  } finally {
    rl.close();
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  output.write(`[啟動失敗] ${message}\n`);
  process.exitCode = 1;
});
