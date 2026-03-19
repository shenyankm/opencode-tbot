# opencode-tbot

一个通过 Telegram 驱动 [OpenCode](https://opencode.ai) 的插件。

[English](./README.md) | [简体中文](./README.zh-CN.md)

> 本项目并非由 OpenCode 团队开发，也不隶属于 OpenCode 官方。

## 项目说明

`opencode-tbot` 允许你直接在 Telegram 中操作 OpenCode。

- 文本消息会转发到当前 OpenCode 会话。
- Telegram 图片会作为 OpenCode 文件片段上传。
- Telegram 语音消息可先通过 OpenRouter 转写，再进入正常 prompt 流程。
- OpenCode 触发的权限请求可以直接在 Telegram 中通过内联按钮批准或拒绝。
- 会话完成和错误事件可以主动回推到绑定的 Telegram chat。
- 聊天状态通过 JSON 状态文件持久化，可兼容 Node 和 Bun 运行环境。

## 安装

执行：

```bash
npx opencode-tbot@latest install
```

安装器会注册全局插件并写入默认运行时配置。

## 配置

运行时配置按以下优先级加载：

1. 全局默认配置 `~/.config/opencode/opencode-tbot/config.json`
2. 项目覆盖配置 `<worktree>/tbot.config.json`

项目配置会覆盖全局默认值；`telegram`、`state`、`openrouter` 这些分段配置会进行深合并。

### `tbot.config.json` 示例

```json
{
  "telegram": {
    "botToken": "your_telegram_bot_token",
    "allowedChatIds": [123456789],
    "apiRoot": "https://api.telegram.org"
  },
  "state": {
    "path": "./data/opencode-tbot.state.json"
  },
  "openrouter": {
    "apiKey": "your_openrouter_api_key",
    "model": "openai/gpt-audio-mini",
    "timeoutMs": 30000,
    "transcriptionPrompt": ""
  },
  "logLevel": "info"
}
```

### 配置字段

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `telegram.botToken` | 是 | - | Telegram bot token。通常由安装器写入全局插件配置。 |
| `telegram.allowedChatIds` | 否 | `[]` | 允许访问的 Telegram chat ID 数组。为空时表示接受任意 chat。 |
| `telegram.apiRoot` | 否 | `https://api.telegram.org` | Telegram Bot API 根地址，适合测试或自托管网关。 |
| `state.path` | 否 | `./data/opencode-tbot.state.json` | JSON 状态文件路径，相对当前 OpenCode worktree 解析。 |
| `openrouter.apiKey` | 否 | `""` | OpenRouter API key。仅在启用语音转写时需要。 |
| `openrouter.model` | 否 | `openai/gpt-audio-mini` | 语音转写使用的 OpenRouter 模型。 |
| `openrouter.timeoutMs` | 否 | `30000` | 语音转写超时时间，单位毫秒。 |
| `openrouter.transcriptionPrompt` | 否 | `""` | 追加到内置转写提示词后的可选说明。 |
| `logLevel` | 否 | `info` | 插件日志级别。日志统一通过 `client.app.log()` 上报。 |

## 运行时约定

必填：

- `telegram.botToken`

可选：

- `telegram.allowedChatIds`
- `telegram.apiRoot`
- `state.path`
- `openrouter.apiKey`
- `openrouter.model`
- `openrouter.timeoutMs`
- `openrouter.transcriptionPrompt`
- `logLevel`

说明：

- `state.path` 默认是 `./data/opencode-tbot.state.json`，并相对当前 OpenCode worktree 解析
- 日志通过 `client.app.log()` 统一输出
- 权限审批和会话通知由插件 hook 处理

## 命令

- `/start` 显示欢迎信息和快速开始说明
- `/help` 显示完整命令说明和示例
- `/status` 显示 OpenCode 健康状态、路径、LSP 和 MCP 信息
- `/new [title]` 创建新的 OpenCode 会话
- `/agents` 或 `/agent` 列出可用 agent 并切换当前 agent
- `/sessions` 列出会话并切换当前会话
- `/cancel` 取消会话重命名，或中止当前会话正在运行的请求
- `/model` 或 `/models` 列出可用模型并切换当前模型
- `/language` 切换 bot 显示语言

任意非命令文本都会被当作 prompt 发送给 OpenCode。配置了 OpenRouter 后，Telegram `voice` 消息会先转写再进入同一条 prompt 流程。图片会作为 OpenCode 文件片段上传。

## 开发

构建插件：

```bash
pnpm build
```

类型检查：

```bash
pnpm typecheck
```

运行测试：

```bash
pnpm test
```

在本仓库中做源码调试时，OpenCode 可以通过 [.opencode/plugins/opencode-tbot.ts](./.opencode/plugins/opencode-tbot.ts) 直接加载 `src/plugin.ts`。

## 常见问题

### 我需要一个正在运行的 OpenCode 实例吗？

需要。这个仓库提供的是 Telegram 集成层，依赖加载它的 OpenCode Host 进程。

### 这是 OpenCode 官方项目吗？

不是。它只是与 OpenCode 集成，并非 OpenCode 官方项目。
