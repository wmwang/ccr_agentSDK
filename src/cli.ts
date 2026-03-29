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
  let printedAnyText = false;

  for await (const message of query({
    prompt,
    options: {
      cwd: process.cwd(),
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      maxTurns: 8,
    },
  })) {
    if (message.type === "assistant") {
      printedAnyText = printAssistantMessage(message) || printedAnyText;
    }

    if (message.type === "result") {
      if (message.subtype === "success") {
        if (message.result.trim()) {
          if (printedAnyText) {
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
