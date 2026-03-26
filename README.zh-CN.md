# opencode-tbot

一个通过 Telegram 驱动 [OpenCode](https://opencode.ai) 的插件。

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> 本项目并非由 OpenCode 团队开发，也不是 OpenCode 官方项目。

## 概览

`opencode-tbot` 让你可以在 Telegram 中操作 OpenCode，并为每个 chat 维护一份独立的活动绑定状态。

- 纯文本消息会转发到当前 OpenCode 会话。
- Telegram 照片和图片文档会作为 OpenCode 文件分段上传。
- OpenCode 发起的权限请求可以在 Telegram 内联按钮中批准或拒绝。
- 会话错误事件可以回推到已绑定的 Telegram chat。
- Telegram 语音消息功能已移除：Telegram 语音默认是 OGG 格式，接入可用语音模型需要额外转码，而转码带来的体积和维护成本过高，综合考虑后不再支持；收到语音消息时会返回本地化拒绝提示。
- chat 绑定、语言选择，以及模型或 Agent 偏好会保存在 JSON 状态文件中。

## 环境要求

- 一个正在运行且会加载该插件的 OpenCode Host 进程。
- 一个 Telegram bot token。
- 用于 CLI 和本地开发的 Node.js `>=22.12.0`。

## 安装、更新与卸载

推荐安装方式：

```bash
npm exec -- opencode-tbot@latest
```

安装器会：

- 在交互式运行时提示输入 Telegram bot token
- 在写入任何配置文件前通过 `getMe` 校验 Telegram bot token
- 写入或更新 `~/.config/opencode/opencode.json`，确保 `plugin` 中包含 `opencode-tbot`
- 写入或合并 `~/.config/opencode/opencode-tbot/config.json`
- 自动创建缺失的父目录
- 完成后仅输出最小化成功提示

在不修改现有插件配置的情况下刷新 OpenCode 插件注册：

```bash
npm exec -- opencode-tbot@latest update
```

移除 OpenCode 插件注册，同时保留现有插件配置文件：

```bash
npm exec -- opencode-tbot@latest uninstall
```

输出 CLI 版本：

```bash
npm exec -- opencode-tbot@latest --version
```

查看帮助：

```bash
npm exec -- opencode-tbot@latest --help
```

说明：

- `install` 只有在 Telegram token 通过远端校验后才会写入配置；如果校验失败，不会写入新的配置文件。
- `install` 会同时更新 `opencode.json` 和全局插件配置文件。
- `update` 只会刷新 `opencode.json`，不会改动现有插件配置内容。
- `uninstall` 会从 `opencode.json` 中移除 `opencode-tbot`，并保留 `~/.config/opencode/opencode-tbot/config.json`。
- OpenCode 会在启动时根据 `opencode.json` 自动安装 npm 插件，并缓存到 `~/.cache/opencode/node_modules/`，因此日常使用不需要 `npm install -g opencode-tbot`。
- 现有的 `~/.config/opencode/package.json`、`bun.lock`、`.gitignore`、`node_modules` 可能属于 OpenCode 自身的运行状态；安装器不会删除或迁移这些文件。
- 真正会阻止安装的是 `~/.config/opencode/plugins/opencode-tbot.*` 这类同名本地文件插件。遇到这种冲突时，安装器会提示先删除或重命名本地插件。

### CLI 参数

通用参数：

- `--help`
- `--version`

`install` 支持：

- `--bot-token <token>` 非交互式写入 Telegram bot token
- `--telegram-api-root <url>` 覆盖 Telegram Bot API 根地址
- `--home-dir <path>` 使用自定义 home 目录

`update` 支持：

- `--home-dir <path>`

`uninstall` 支持：

- `--home-dir <path>`

## 配置

运行时配置从以下路径加载：

- `~/.config/opencode/opencode-tbot/config.json`

程序化调用也可以显式传入配置对象。传入值会覆盖文件值。

OpenCode 会从以下路径读取 npm 插件注册：

- `~/.config/opencode/opencode.json`

本插件不会从 `.env` 读取运行时配置。

### `config.json` 示例

```json
{
  "telegram": {
    "botToken": "your_telegram_bot_token",
    "allowedChatIds": ["123456789"],
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
  "tokens": {
    "showBreakdown": false
  },
  "logging": {
    "level": "info",
    "sinks": {
      "host": true,
      "file": true
    },
    "file": {
      "dir": "<home>/.local/share/opencode/log/plugins/opencode-tbot",
      "retention": {
        "maxFiles": 30,
        "maxTotalBytes": 314572800
      }
    }
  }
}
```

### 字段说明

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `telegram.botToken` | 是 | - | Telegram bot token。通常会在 `getMe` 校验通过后由安装器写入全局插件配置。 |
| `telegram.allowedChatIds` | 否 | `[]` | 允许访问的 Telegram chat ID。为空时，bot 会接受任意 chat 的消息。 |
| `telegram.apiRoot` | 否 | `https://api.telegram.org` | Telegram Bot API 基础地址，适合测试或自建网关。 |
| `state.path` | 否 | `./data/opencode-tbot.state.json` | JSON 状态文件路径，相对当前 OpenCode worktree 解析。 |
| `prompt.waitTimeoutMs` | 否 | `1800000` | 单次异步 prompt 生命周期的最长等待时间。 |
| `prompt.pollRequestTimeoutMs` | 否 | `15000` | 每次向 OpenCode 发起恢复轮询请求时的超时时间。 |
| `prompt.recoveryInactivityTimeoutMs` | 否 | `120000` | 仅在 prompt 进度停止推进时生效的恢复超时时间。 |
| `tokens.showBreakdown` | 否 | `false` | `/token` 的全局开关，用于控制是否显示包含 `input`、`output`、`reasoning`、`cache.read`、`cache.write` 的第二行页脚明细。第一行显示令牌总数始终按这五项重算，不会写入 worktree 状态文件。 |
| `logging.level` | 否 | `info` | host 和 file sink 共用的结构化日志级别。未知值会归一化为 `info`。 |
| `logging.sinks.host` | 否 | `true` | 是否通过 `client.app.log(...)` 写入 OpenCode Host 日志。 |
| `logging.sinks.file` | 否 | `true` | 是否写入插件自己的 JSONL 文件日志。 |
| `logging.file.dir` | 否 | `<home>/.local/share/opencode/log/plugins/opencode-tbot` | 插件 JSONL 日志目录。相对路径按当前 OpenCode worktree 解析。 |
| `logging.file.retention.maxFiles` | 否 | `30` | 最多保留多少个插件日志文件。 |
| `logging.file.retention.maxTotalBytes` | 否 | `314572800` | 插件日志文件的总大小上限。 |

### 说明

- `state.path` 会相对当前 OpenCode worktree 解析。
- 如果 `logging.file.dir` 是相对路径，也会相对当前 OpenCode worktree 解析；未配置时默认写入用户 home 目录下的日志目录。
- `/token` 会更新 `~/.config/opencode/opencode-tbot/config.json` 中的全局 `tokens.showBreakdown` 设置，不会写入 worktree 状态文件。
- 回复页脚第一行始终保持为“耗时 | 显示令牌数”。开启后，`/token` 会额外显示第二行完整明细：`input`、`output`、`reasoning`、`cache.read`、`cache.write`。
- Telegram prompt 采用 async-first：插件先提交 `session.promptAsync()`，再通过会话消息和状态恢复最终回复。
- 如果 `telegram.allowedChatIds` 为空，bot 会接受任意 chat 的消息；生产环境建议显式限制。
- `/language` 会同时更新 bot 显示语言，以及当前 chat 的本地化 Telegram 命令描述。
- 文件日志默认只记录元数据，不会写入 prompt 正文、附件内容、原始 URL 或 secret。

## 快速开始

1. 运行 `npm exec -- opencode-tbot@latest`。
2. 如果需要限制可访问 chat，在 `~/.config/opencode/opencode-tbot/config.json` 中设置 `telegram.allowedChatIds`。
3. 在目标 worktree 中启动 OpenCode，让插件运行时被加载。
4. 在 Telegram 中执行 `/status` 验证连通性。
5. 执行 `/new [title]`，或者直接发送文本或图片消息开始使用。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/start` | 显示简短欢迎信息和快速开始步骤。 |
| `/status` | 汇总显示 OpenCode 健康状态、版本、工作区路径、插件列表、LSP 状态和 MCP 状态。 |
| `/new [title]` | 在当前项目中创建一个新的 OpenCode 会话。 |
| `/agents` 或 `/agent` | 列出可用 Agent，并切换当前 Agent。 |
| `/sessions` | 列出可用会话、切换当前会话，并提供重命名操作。 |
| `/cancel` | 取消待输入的会话重命名，或中止当前会话正在执行的请求。 |
| `/model` 或 `/models` | 显示 OpenCode 为已连接 provider 暴露的模型，切换当前模型，并在可用时选择推理级别。 |
| `/token` | 开启或关闭回复页脚第二行的完整令牌明细。该设置对整个插件全局生效。 |
| `/language` | 切换当前 chat 的 bot 显示语言，并重新同步命令描述。 |

### 消息行为

- 非命令文本会作为 prompt 发送给 OpenCode。
- Telegram 照片和图片文档会作为 OpenCode 文件分段转发。
- 图片附件会在当前活动会话的临时 fork 中处理，避免污染后续纯文本上下文。
- 权限审批可以直接通过 Telegram 内联按钮完成。
- `/cancel` 会同时中止 OpenCode 会话请求和本地 Telegram 等待状态，让下一次 prompt 能立即开始。
- Telegram 语音消息功能已移除：Telegram 语音默认是 OGG 格式，接入可用语音模型需要额外转码，而转码带来的体积和维护成本过高，综合考虑后不再支持；收到语音消息时会返回本地化拒绝提示。

## 日志

- OpenCode Host 日志目录：`<home>/.local/share/opencode/log`
- 默认插件日志目录：`<home>/.local/share/opencode/log/plugins/opencode-tbot`
- 文件格式：追加写入的 JSONL，每行一个结构化事件
- 常见关联字段：`runtimeId`、`operationId`、`correlationId`、`updateId`、`chatId`、`sessionId`、`projectId`
- 常见组件：`runtime`、`telegram`、`opencode`、`prompt`、`plugin-event`、`storage`
- 默认保留策略：最新 30 个文件，总大小不超过 300 MB

## FAQ

### 需要一个正在运行的 OpenCode 实例吗？

需要。本仓库只提供 Telegram 集成层，依赖加载该插件的 OpenCode Host 进程。

### 需要全局安装 `opencode-tbot` 吗？

不需要。推荐方式是 `npm exec -- opencode-tbot@latest`。全局安装只会安装 CLI；OpenCode 仍然通过 `opencode.json` 读取插件注册。

### Telegram token 无效时会怎样？

`install` 会在写入 `opencode.json` 和 `~/.config/opencode/opencode-tbot/config.json` 之前失败。如果运行期 token 之后失效，插件会被禁用，但 OpenCode 仍应继续启动，不再因为插件启动失败而崩溃。

### 这是 OpenCode 官方项目吗？

不是。它与 OpenCode 集成，但不是由 OpenCode 团队开发。
