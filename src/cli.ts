import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { setupCcrEnvironment } from "./ccr.js";

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

  const rl = createInterface({ input, output });
  output.write("Claude Agent SDK CLI (via CCR)\n");
  output.write("輸入訊息後按 Enter，輸入 /exit 離開。\n\n");

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
