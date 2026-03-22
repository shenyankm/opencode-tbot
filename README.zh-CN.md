# opencode-tbot

一个通过 Telegram 驱动 [OpenCode](https://opencode.ai) 的插件。

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> 本项目并非由 OpenCode 官方团队开发。

## 概览

`opencode-tbot` 允许你直接在 Telegram 中操作 OpenCode。

- 文本消息会转发到当前 OpenCode 会话。
- Telegram 图片会作为 OpenCode 文件片段上传。
- 图片轮次会在临时 fork 会话中执行，避免后续纯文本上下文被污染。
- Telegram 语音消息会被明确拒绝。
- OpenCode 的权限请求可以直接在 Telegram 中审批。
- 会话完成和错误事件可以回推到已绑定的 Telegram chat。
- 聊天绑定状态会保存在 JSON 状态文件中。

## 环境要求

- 一个正在运行、并会加载该插件的 OpenCode Host 进程。
- 一个 Telegram bot token。
- Node.js `>=22.12.0`。

## 安装

推荐安装方式：

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- install
```

安装器会全局注册插件、写入默认运行时配置，并打印插件配置路径与默认日志目录。

查看 CLI 版本：

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- --version
```

更新 OpenCode 中注册的 npm 插件 spec：

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- update
```

### CLI 参数

`install` 支持：

- `--bot-token <token>` 非交互写入 Telegram bot token
- `--telegram-api-root <url>` 覆盖 Telegram Bot API 根地址
- `--plugin-spec <spec>` 注册自定义 npm 插件 spec
- `--skip-register` 只重写插件配置，不改 OpenCode 插件注册
- `--home-dir <path>` 使用自定义 home 目录

`update` 支持：

- `--plugin-spec <spec>`
- `--home-dir <path>`

## 配置

运行时配置只从 `~/.config/opencode/opencode-tbot/config.json` 加载。

遗留的 `<worktree>/tbot.config.json` 会在运行时被忽略；如果检测到，插件会记录一条警告，提示你把配置迁移到全局文件。

遗留的 `openrouter` 语音转写配置会在运行时被忽略；安装器重写配置时也会自动移除它们。

### 全局 `config.json` 示例

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
  "prompt": {
    "waitTimeoutMs": 1800000,
    "pollRequestTimeoutMs": 15000,
    "recoveryInactivityTimeoutMs": 120000
  },
  "logging": {
    "level": "info",
    "sinks": {
      "host": true,
      "file": true
    },
    "file": {
      "dir": "C:/Users/your-user/.local/share/opencode/log/plugins/opencode-tbot",
      "retention": {
        "maxFiles": 30,
        "maxTotalBytes": 314572800
      }
    }
  },
  "logLevel": "info"
}
```

### 配置字段

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `telegram.botToken` | 是 | - | Telegram bot token。通常由安装器写入。 |
| `telegram.allowedChatIds` | 否 | `[]` | 允许访问的 Telegram chat ID。为空时接受任意 chat。 |
| `telegram.apiRoot` | 否 | `https://api.telegram.org` | Telegram Bot API 根地址。 |
| `state.path` | 否 | `./data/opencode-tbot.state.json` | JSON 状态文件路径，相对当前 OpenCode worktree 解析。 |
| `prompt.waitTimeoutMs` | 否 | `1800000` | 单次异步 prompt 生命周期的最大等待时间。 |
| `prompt.pollRequestTimeoutMs` | 否 | `15000` | 每次恢复轮询请求的超时时间。 |
| `prompt.recoveryInactivityTimeoutMs` | 否 | `120000` | 仅在 OpenCode 长时间没有新进展时生效的恢复超时。 |
| `logging.level` | 否 | `info` | 结构化日志级别。 |
| `logging.sinks.host` | 否 | `true` | 是否通过 `client.app.log({ body: ... })` 写入 OpenCode Host 日志。 |
| `logging.sinks.file` | 否 | `true` | 是否写入插件自己的 JSONL 文件日志。 |
| `logging.file.dir` | 否 | `%USERPROFILE%/.local/share/opencode/log/plugins/opencode-tbot` | 插件日志目录。 |
| `logging.file.retention.maxFiles` | 否 | `30` | 最多保留多少个插件日志文件。 |
| `logging.file.retention.maxTotalBytes` | 否 | `314572800` | 插件日志文件总大小上限。 |
| `logLevel` | 否 | `info` | `logging.level` 的兼容别名。 |

### 说明

- `state.path` 会相对当前 OpenCode worktree 解析。
- Telegram prompt 采用 async-first：插件先提交异步 prompt，再通过消息与状态恢复最终回复。
- 如果 `telegram.allowedChatIds` 为空，bot 会接受任意 chat 的消息；生产环境建议显式限制。
- 权限审批与会话通知通过插件 hooks 处理。
- `/language` 当前支持 English、简体中文、日语。
- 默认会双写日志：OpenCode Host 日志 + 插件 JSONL 文件日志。
- 文件日志默认只记录元数据，不记录 prompt 正文、附件内容、原始 URL 或 secrets。

## 日志

- OpenCode Host 日志目录：`%USERPROFILE%/.local/share/opencode/log`
- 插件日志目录：`%USERPROFILE%/.local/share/opencode/log/plugins/opencode-tbot`
- 文件格式：JSONL，每行一条结构化事件
- 关键关联字段：`runtimeId`、`operationId`、`correlationId`、`updateId`、`chatId`、`sessionId`、`projectId`
- 常见组件：`runtime`、`telegram`、`opencode`、`prompt`、`plugin-event`、`storage`
- 默认保留策略：最多 30 个文件，总大小不超过 300 MB

## 快速开始

1. 运行 `npm exec --package opencode-tbot@latest opencode-tbot -- install`。
2. 如需限制可访问 chat，在 `~/.config/opencode/opencode-tbot/config.json` 中设置 `telegram.allowedChatIds`。
3. 在目标 worktree 中启动 OpenCode。
4. 在 Telegram 中执行 `/status` 验证连通性。
5. 执行 `/new [title]`，或者直接发送文本/图片开始使用。

## 命令

- `/start` 显示欢迎信息和快速开始说明
- `/status` 显示 OpenCode 健康状态、路径、LSP、MCP 等信息
- `/new [title]` 创建新会话
- `/agents` 或 `/agent` 列出并切换 agent
- `/sessions` 列出并切换会话
- `/cancel` 取消重命名，或中止当前正在运行的请求
- `/model` 或 `/models` 列出并切换模型
- `/language` 切换显示语言

消息处理规则：

- 非命令文本会作为 prompt 发送给 OpenCode。
- Telegram 图片会作为 OpenCode 文件片段上传。
- 图片消息会在临时 fork 会话中处理。
- `/cancel` 会同时中止 OpenCode 会话和本地 Telegram 等待状态。
- Telegram 语音消息不受支持，会收到本地化拒绝提示。

## 开发

构建：

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

本仓库本地开发时，OpenCode 可以通过 [.opencode/plugins/opencode-tbot.ts](./.opencode/plugins/opencode-tbot.ts) 直接加载 `src/plugin.ts`。

OpenCode 可能会在同一进程中同时加载本地 `.opencode/plugins/` bridge 和已安装的 `opencode-tbot@latest` npm 插件。当前实现已经防止重复启动 Telegram runner，但本地开发仍建议只保留一种加载方式。

## FAQ

### 需要一个正在运行的 OpenCode 实例吗？

需要。这个仓库只提供 Telegram 集成层，依赖加载它的 OpenCode Host 进程。

### 这是 OpenCode 官方项目吗？

不是。它集成 OpenCode，但不是 OpenCode 官方项目。
