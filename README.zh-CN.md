# opencode-tbot

一个通过 Telegram 驱动 [OpenCode](https://opencode.ai) 服务的客户端。

[English](./README.md) | [简体中文](./README.zh-CN.md)

> 该项目并非由 OpenCode 团队开发，也不隶属于 OpenCode 官方。

---

## 它是什么

`opencode-tbot` 是一个通过 Telegram 驱动 OpenCode 的客户端。你给机器人发送普通文本消息，它会把内容转发到当前 OpenCode 会话，再把结果回发到原聊天窗口。

如果你配置了兼容 OpenAI 的语音转写接口，机器人也可以接收 Telegram 语音消息，先转写文本，再走同一条 OpenCode 处理链路。

机器人也支持 Telegram 图片消息。它会从 Telegram 下载图片，转换成 OpenCode 的文件 part，并连同可选 caption 一起转发给 OpenCode。

机器人会将每个聊天的状态持久化到 SQLite，包括当前会话、项目绑定、已选 agent、已选模型、reasoning variant，以及界面语言偏好。

## 安装

```bash
pnpm install
```

创建本地环境变量文件：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

## 配置

请至少在 `.env` 中设置以下变量：

- `TELEGRAM_BOT_TOKEN`
- `OPENCODE_BASE_URL`

环境变量说明：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | 是 | Telegram 机器人 Token。 |
| `TELEGRAM_ALLOWED_CHAT_IDS` | 否 | 允许访问的 Telegram Chat ID，多个值用英文逗号分隔。为空时，机器人接受任意聊天的消息。 |
| `OPENCODE_BASE_URL` | 是 | OpenCode 服务地址，例如 `http://127.0.0.1:4096`。 |
| `OPENCODE_API_KEY` | 否 | 可选的 API Key，会传递给 OpenCode 客户端层。 |
| `STT_BASE_URL` | 否 | 兼容 OpenAI 的语音转写接口地址。只有启用 Telegram 语音转写时才需要。 |
| `STT_API_KEY` | 否 | 语音转写服务的可选 API Key。 |
| `STT_MODEL` | 否 | 语音转写模型名。只有启用 Telegram 语音转写时才需要。 |
| `STT_TIMEOUT_MS` | 否 | 语音转写请求超时时间，单位毫秒，默认值为 `30000`。 |
| `STT_LANGUAGE` | 否 | 可选的默认语言提示，会透传给语音转写接口。 |
| `STT_PROMPT` | 否 | 可选的提示词，会透传给语音转写接口以影响转写行为。 |
| `LOG_LEVEL` | 否 | 日志级别，默认值为 `info`。 |
| `BOT_STATE_DB_PATH` | 否 | 聊天状态的 SQLite 文件路径，默认值为 `./data/opencode-tbot.sqlite`。 |

语音转写说明：

- 语音输入是可选能力。未配置 STT 时，文本 prompt 功能不受影响。
- v1 只处理 Telegram `voice` 消息，不处理 `audio`、`document` 或 `video_note`。
- 机器人会在内存中下载语音并发送给 STT 接口，不会把音频落盘保存。

图片上传说明：

- 支持 Telegram `photo` 消息。
- 也支持 `document` 形式发送的图片文件。
- 图片会在内存中下载，并以 OpenCode file part 的形式转发；Telegram bot token 不会透传给 OpenCode。
- 如果图片带有 caption，caption 会作为同一次请求的 prompt 文本一起发送。

## 运行

先确保 OpenCode 服务已经启动，然后再运行机器人：

```bash
pnpm dev
```

如果你希望先编译再运行：

```bash
pnpm build
pnpm start
```

## 功能

- 在 Telegram 中把文本 prompt 发给 OpenCode
- 把 Telegram 图片发送给 OpenCode，并可附带 caption 作为 prompt
- 通过兼容 OpenAI 的 STT 服务处理 Telegram 语音消息，并继续走正常的 OpenCode prompt 链路
- 在聊天里创建和切换 OpenCode 会话
- 查看并切换 agent
- 查看并切换模型和 reasoning 等级
- 查看健康状态、路径、LSP 状态和 MCP 状态
- 支持英文和简体中文界面
- 可通过 Telegram chat allowlist 限制访问
- 使用本地 SQLite 持久化聊天绑定状态

## 命令

- `/start` 查看机器人简介
- `/health` 检查 OpenCode 服务健康状态
- `/path` 查看 OpenCode 路径和当前工作目录
- `/lsp` 查看当前项目的 LSP 服务状态
- `/mcp` 查看当前项目的 MCP 服务状态
- `/new [title]` 创建新的 OpenCode 会话
- `/agents` 或 `/agent` 查看可用 agent 并切换当前项
- `/sessions` 查看可用会话并切换当前项
- `/abort` 中止当前会话正在执行的请求
- `/model` 或 `/models` 查看可用模型并切换当前项
- `/language` 切换机器人显示语言

任何非命令文本消息都会被当作 prompt 发送给 OpenCode。如果已配置 STT，Telegram `voice` 消息会先转写，再走同一条 prompt 流程。Telegram 图片会作为 OpenCode file part 转发；如果存在 caption，caption 会一起作为 prompt 文本发送。

## 开发

类型检查：

```bash
pnpm typecheck
```

运行测试：

```bash
pnpm test
```

运行依赖安全审计：

```bash
pnpm audit
```

## 常见问题

### 是否必须先启动 OpenCode 服务？

是的。这个仓库是 Telegram 客户端层，不是 OpenCode 服务本身。

### 这是 OpenCode 官方项目吗？

不是。它只是对 OpenCode 的集成项目，并不隶属于 OpenCode 官方团队。

### 为什么推荐 Node.js 22？

项目使用了较新的 Node API，包括 `node:sqlite`，因此 Node.js 22 或更新版本更稳妥。
