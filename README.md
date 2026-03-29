# CCR + Claude Agent SDK CLI

這是一個最小可用的 CLI 範例：

1. 你在終端輸入訊息
2. 程式透過 `@anthropic-ai/claude-agent-sdk` 呼叫 Claude
3. 連線路徑強制使用 `claude-code-router (ccr)`

## 需求

- Node.js 18+
- 已安裝並設定 `claude-code-router`
- `ccr` 服務已啟動

## 安裝

```bash
npm install
```

## 使用前先啟動 CCR

```bash
ccr start
```

> 本專案的 CLI 啟動時會自動執行 `ccr activate` 載入環境變數。若 `ccr` 沒安裝或沒設定好，程式會直接報錯停止。

## 啟動 CLI

```bash
npm run chat
```

輸入 `/exit` 可離開。
