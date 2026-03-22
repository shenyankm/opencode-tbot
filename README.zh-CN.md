# opencode-tbot

一个通过 Telegram 驱动 [OpenCode](https://opencode.ai) 的插件。

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> 本项目并非由 OpenCode 官方团队开发，也不隶属于 OpenCode 官方。

## 概览

`opencode-tbot` 让你可以在 Telegram 中直接操作 OpenCode，并为每个 chat 维护一份绑定状态。

- 纯文本消息会转发到当前 OpenCode 会话。
- Telegram 照片和图片文档会作为 OpenCode 文件片段上传。
- 图片轮次会在临时 fork 会话中执行，避免后续纯文本对话继承图片上下文。
- OpenCode 发起的权限请求可以直接在 Telegram 内联按钮中批准或拒绝。
- 会话错误事件可以回推到已绑定的 Telegram chat。
- 语音消息会被明确拒绝，并返回本地化提示。
- 聊天绑定和会话选择状态会保存在 JSON 状态文件中。

## 环境要求

- 一个正在运行并加载该插件的 OpenCode Host 进程。
- 一个 Telegram bot token。
- Node.js `>=22.12.0`，用于 CLI 和本地开发。
- `pnpm`，用于仓库开发。

## 安装与更新

推荐安装方式：

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- install
```

安装器会：

- 写入 `~/.config/opencode/plugins/opencode-tbot.js`
- 在目录不存在时自动创建所需的父级目录
- 写入或合并 `~/.config/opencode/opencode-tbot/config.json`
- 输出插件 bridge 路径、插件配置路径和默认插件日志目录

`install` 是默认命令。下面这种方式也可用于非交互安装：

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- --bot-token <token>
```

只刷新全局插件 bridge，而不修改 bot token：

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- update
```

查看已安装 CLI 版本：

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- --version
```

`install` 和 `update` 现在只维护全局 bridge 与插件配置，不会改写 `opencode.json` 或 `opencode.jsonc`。

### CLI 参数

`install` 支持：

- `--bot-token <token>` 非交互写入 Telegram bot token
- `--telegram-api-root <url>` 覆盖 Telegram Bot API 根地址
- `--skip-register` 只重写插件配置，不修改全局插件 bridge
- `--home-dir <path>` 使用自定义 home 目录

`update` 支持：

- `--home-dir <path>`

## 配置

运行时配置从以下路径加载：

- `~/.config/opencode/opencode-tbot/config.json`

如果以编程方式加载插件，也可以显式传入配置对象；显式传入的值会覆盖文件中的值。

OpenCode 会从以下路径加载全局插件 bridge：

- `~/.config/opencode/plugins/opencode-tbot.js`

本插件不会从 `.env` 读取运行时配置。

### `config.json` 示例

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
  }
}
```

### 配置字段

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `telegram.botToken` | 是 | - | Telegram bot token。通常由安装器写入全局插件配置。 |
| `telegram.allowedChatIds` | 否 | `[]` | 允许访问的 Telegram chat ID。为空时接受任意 chat。 |
| `telegram.apiRoot` | 否 | `https://api.telegram.org` | Telegram Bot API 根地址，适合测试或自建网关。 |
| `state.path` | 否 | `./data/opencode-tbot.state.json` | JSON 状态文件路径，相对当前 OpenCode worktree 解析。 |
| `prompt.waitTimeoutMs` | 否 | `1800000` | 单次异步 prompt 生命周期的总等待上限。 |
| `prompt.pollRequestTimeoutMs` | 否 | `15000` | 每次向 OpenCode 发起恢复轮询请求时的超时时间。 |
| `prompt.recoveryInactivityTimeoutMs` | 否 | `120000` | 仅在长时间没有新进展时生效的恢复超时。 |
| `logging.level` | 否 | `info` | Host 与文件日志共用的结构化日志级别，会规范化为 `debug`、`info`、`warn` 或 `error`。 |
| `logging.sinks.host` | 否 | `true` | 是否通过 `client.app.log(...)` 写入 OpenCode Host 日志。 |
| `logging.sinks.file` | 否 | `true` | 是否写入插件自身的 JSONL 文件日志。 |
| `logging.file.dir` | 否 | `%USERPROFILE%/.local/share/opencode/log/plugins/opencode-tbot` | 插件 JSONL 日志目录。相对路径会基于当前 OpenCode worktree 解析。 |
| `logging.file.retention.maxFiles` | 否 | `30` | 最多保留多少个插件日志文件。 |
| `logging.file.retention.maxTotalBytes` | 否 | `314572800` | 插件日志文件总大小上限。 |

### 说明

- `state.path` 会相对当前 OpenCode worktree 解析。
- `logging.file.dir` 如果是相对路径，也会相对当前 OpenCode worktree 解析。
- Telegram prompt 采用 async-first：插件先提交 `session.promptAsync()`，再通过消息和状态恢复最终回复。
- 如果 `telegram.allowedChatIds` 为空，bot 会接受任意 chat 的消息；生产环境建议显式限制。
- 权限审批和会话错误通知通过插件 hooks 处理。
- `/language` 当前支持 English、简体中文、日语，并同步当前 chat 的 Telegram 命令描述。
- 文件日志默认只记录元数据，不写入 prompt 正文、附件内容、原始 URL 或 secrets。

## 快速开始

1. 运行 `npm exec --package opencode-tbot@latest opencode-tbot -- install`。
2. 如果需要限制可访问 chat，在 `~/.config/opencode/opencode-tbot/config.json` 中设置 `telegram.allowedChatIds`。
3. 在目标 worktree 中启动 OpenCode，让插件运行时被加载。
4. 在 Telegram 中执行 `/status` 验证连通性。
5. 运行 `/new [title]`，或直接发送文本消息开始使用。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/start` | 显示欢迎消息和快速开始说明。 |
| `/status` | 汇总显示 OpenCode 健康状态、版本、工作区路径、插件列表、LSP 状态和 MCP 状态。 |
| `/new [title]` | 在当前项目中创建一个新的 OpenCode 会话。 |
| `/agents` 或 `/agent` | 列出可用 Agent 并切换当前 Agent。 |
| `/sessions` | 列出可用会话、切换当前会话，并提供重命名操作。 |
| `/cancel` | 取消待输入的会话重命名，或中止当前会话正在运行的请求。 |
| `/model` 或 `/models` | 列出可用模型、切换当前模型，并在可用时选择推理级别。 |
| `/language` | 切换当前 chat 的 bot 显示语言。 |

### 消息行为

- 非命令文本会作为 prompt 发送给 OpenCode。
- Telegram 照片和图片文档会作为 OpenCode 文件片段转发。
- 图片附件会在当前会话的临时 fork 中处理，避免污染后续纯文本上下文。
- `/cancel` 会同时中止 OpenCode 会话请求和本地 Telegram 等待状态，让下一次 prompt 可以立即开始。
- Telegram 语音消息暂不支持，会收到本地化拒绝提示。

## 日志

- OpenCode Host 日志目录：`%USERPROFILE%/.local/share/opencode/log`
- 插件日志目录：`%USERPROFILE%/.local/share/opencode/log/plugins/opencode-tbot`
- 文件格式：追加写入的 JSONL，每行一个结构化事件
- 关联字段：`runtimeId`、`operationId`、`correlationId`、`updateId`、`chatId`、`sessionId`、`projectId`
- 常见组件：`runtime`、`telegram`、`opencode`、`prompt`、`plugin-event`、`storage`
- 默认保留策略：最新 30 个文件，且总大小不超过 300 MB

## 开发

安装依赖：

```bash
pnpm install
```

构建：

```bash
pnpm build
```

类型检查：

```bash
pnpm typecheck
```

运行默认测试集：

```bash
pnpm test
```

运行最接近 CI 的集成路径：

```bash
npm install -g opencode-ai
OPENCODE_HOST_E2E=1 pnpm test
```

PowerShell 写法：

```powershell
npm install -g opencode-ai
$env:OPENCODE_HOST_E2E="1"; pnpm test
```

正常使用应依赖自动生成的全局 bridge `~/.config/opencode/plugins/opencode-tbot.js` 和全局插件配置。本仓库默认不提供项目级 `.opencode/plugins` bridge。

如果你需要在本仓库里做源码级调试，请手动创建 `.opencode/plugins/opencode-tbot.ts`：

```ts
export { default } from "../../src/plugin.ts";
```

同一时间只保留一种加载路径即可：要么使用手动创建的本地 bridge，要么使用 `~/.config/opencode/plugins/` 下自动生成的全局 bridge。

## FAQ

### 需要一个正在运行的 OpenCode 实例吗？

需要。本仓库只提供 Telegram 集成层，依赖加载该插件的 OpenCode Host 进程。

### 为什么生成出来的 bridge 可能会指向 `file:///.../node_modules/...`？

这通常表示安装器是在某个已经把 `opencode-tbot` 装进本地 `node_modules` 的项目里运行的，所以生成的 bridge 指向了那个包路径。如果你希望 bridge 直接指向发布包，重新执行推荐的 `npm exec --package ...` 安装流程即可。

### 这是 OpenCode 官方项目吗？

不是。它集成 OpenCode，但并非 OpenCode 官方团队开发。
