# opencode-tbot

一个通过 Telegram 驱动 [OpenCode](https://opencode.ai) 的插件。

[English](./README.md) | [简体中文](./README.zh-CN.md)

> 本项目不是由 OpenCode 团队开发，也不隶属于 OpenCode 官方。

## 项目说明

`opencode-tbot` 允许你直接在 Telegram 中与 OpenCode 交互。

- 文本消息会转发到当前活跃的 OpenCode 会话。
- Telegram 图片会作为 OpenCode 文件片段上传，若带有 caption，则会一起作为 prompt 文本发送。
- Telegram 语音消息可以先通过 OpenRouter 语音转写，再进入正常的 prompt 流程。
- 每个聊天的状态会持久化到 SQLite，包括绑定的会话、选定的 agent、模型、推理变体和偏好的界面语言。

当前仓库只保留 OpenCode 插件模式，不再支持独立运行的 bot 进程。

## 安装

请按以下步骤完成全局注册和当前工作区配置。

### 环境要求

- 需要安装并能够加载 OpenCode。
- 本地构建和开发需要 Node.js 22.12.0 或更高版本。
- 你需要一个来自 BotFather 的 Telegram bot token。

### 配置层级

项目有两层配置：

- 全局插件注册：`~/.config/opencode/opencode.json`
- 当前 worktree 的运行配置：`tbot.config.json`

Windows 下，`~` 会解析为当前用户的主目录。

### 手动安装

1. 打开或创建 `~/.config/opencode/opencode.json`。
2. 确保使用的是单数 `plugin` 键，而不是 `plugins`。
3. 将 `opencode-tbot@latest` 加入 `plugin` 数组，如果已经存在就不要重复添加。
4. 在要运行 bot 的 OpenCode worktree 中，创建或更新 `tbot.config.json`。
5. 可以直接参考 `tbot.config.example.json` 作为模板。
6. 设置 `telegram.botToken`，再按需调整其他可选字段。
7. 重新启动 OpenCode，并确保它是在同一个 worktree 中启动的。
8. 发送 `/start` 或 `/status` 验证插件是否正常工作。

如果 `telegram.botToken` 已经配置好，OpenCode 重新加载插件后即可直接启动。若缺少 token，交互式启动会提示输入，并将值写回 `tbot.config.json`。非交互式启动会直接报配置错误。

如果你希望由 OpenCode 或其他代理自动完成安装，可使用 [INSTALL.md](./INSTALL.md) 中的安装契约。

### `tbot.config.json` 示例

```json
{
  "telegram": {
    "botToken": "your_telegram_bot_token",
    "allowedChatIds": []
  },
  "database": {
    "path": "./data/opencode-tbot.sqlite"
  },
  "openrouter": {
    "apiKey": "",
    "model": "openai/gpt-audio-mini",
    "timeoutMs": 30000,
    "transcriptionPrompt": ""
  },
  "logLevel": "info",
  "opencodeApiKey": ""
}
```

全局注册并不代表 Telegram 凭证也是全局共享的。除非你手动在多个项目里复用同一个 token，否则每个 worktree 仍然读取自己的 `tbot.config.json`。

## 包入口

包根入口和 [src/plugin.ts](./src/plugin.ts) 都会指向插件运行时。`dist/index.js` 是 npm/OpenCode 使用的包入口，`dist/plugin.js` 则保留为显式子路径导出。

在本仓库内进行本地开发时，[.opencode/plugins/opencode-tbot.ts](./.opencode/plugins/opencode-tbot.ts) 会直接把 `src/plugin.ts` 暴露给 OpenCode，从源码目录加载插件。

## 配置

`tbot.config.json` 是主运行时配置文件。旧文件名 `opencode-tbot.config.json` 仍然兼容。

必填项：

- `telegram.botToken`

可选项：

- `telegram.allowedChatIds`
- `database.path`
- `openrouter.apiKey`
- `openrouter.model`
- `openrouter.timeoutMs`
- `openrouter.transcriptionPrompt`
- `logLevel`
- `opencodeApiKey`

配置字段：

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `telegram.botToken` | 是 | - | Telegram bot token。交互式插件启动时如果缺少该值，插件会提示输入并写回 `tbot.config.json`。 |
| `telegram.allowedChatIds` | 否 | `[]` | 允许访问的 Telegram chat ID 数组。如果为空，表示接受任意聊天。 |
| `database.path` | 否 | `./data/opencode-tbot.sqlite` | 聊天状态的 SQLite 文件路径，会相对于当前 OpenCode worktree 解析。 |
| `openrouter.apiKey` | 否 | `""` | OpenRouter API key，仅在启用 Telegram 语音转写时需要。 |
| `openrouter.model` | 否 | `openai/gpt-audio-mini` | 用于语音转写的 OpenRouter 模型。 |
| `openrouter.timeoutMs` | 否 | `30000` | 语音转写请求超时时间，单位毫秒。 |
| `openrouter.transcriptionPrompt` | 否 | `""` | 追加到内置语音转写提示词后面的可选说明。 |
| `logLevel` | 否 | `info` | 插件运行时使用的日志级别。 |
| `opencodeApiKey` | 否 | `""` | 保留的兼容字段。插件运行时实际使用的是注入的 OpenCode SDK client。 |

全局安装并不意味着 Telegram 凭证也会全局共享。插件只会通过 `~/.config/opencode/opencode.json` 做一次全局注册，但 `telegram.botToken` 仍然按 worktree 从各自的 `tbot.config.json` 读取，除非你手动在多个项目中复用同一个 token。

### 语音转写说明

- 语音输入是可选的。如果没有配置 OpenRouter 语音转写，文本和图片功能仍然正常工作。
- 当前版本只处理 Telegram 的 `voice` 消息，不处理 `audio`、`document` 或 `video_note`。
- 语音文件只在内存中处理，不会落盘保存。

### 图片说明

- 支持 Telegram `photo` 消息。
- 也支持以 `document` 形式发送的图片文件。
- 图片会在内存中下载后，作为 OpenCode 文件片段继续转发。

## 功能

- 在 Telegram 中向 OpenCode 发送文本 prompt
- 将 Telegram 图片连同可选 caption 一起转发给 OpenCode
- 通过 OpenRouter 语音转写处理 Telegram 语音消息
- 在聊天中创建和切换 OpenCode 会话
- 查看和切换 agent
- 查看和切换模型与推理级别
- 通过 `/status` 查看健康状态、路径、LSP 和 MCP 信息
- 支持英文和简体中文界面
- 支持 Telegram Chat ID 白名单
- 使用 SQLite 持久化聊天绑定状态

## 命令

- `/start` 显示欢迎信息和快速开始步骤
- `/help` 显示完整命令说明和示例
- `/status` 显示聚合后的 OpenCode 健康状态、路径、LSP 和 MCP 状态
- `/new [title]` 创建新的 OpenCode 会话
- `/agents` 或 `/agent` 列出可用 agent 并切换当前 agent
- `/sessions` 列出会话并切换当前会话
- `/cancel` 取消会话重命名，或中止当前会话正在运行的请求
- `/model` 或 `/models` 列出可用模型并切换当前模型
- `/language` 切换 bot 的显示语言

任何非命令文本都会被当作 prompt 发送给 OpenCode。如果配置了 OpenRouter 语音转写，Telegram `voice` 消息也会先转写再进入同一条 prompt 流程。图片会作为 OpenCode 文件片段上传。

## 开发

构建插件 bundle：

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

执行依赖安全检查：

```bash
pnpm audit
```

## 部署

支持的部署模式：

- 推荐的 npm 安装：在 OpenCode 中全局注册 `opencode-tbot@latest`，并在每个 worktree 中保留自己的 `tbot.config.json`。
- 代理驱动安装：让 OpenCode、Claude Code、Cursor 或其他代理按照 [INSTALL.md](./INSTALL.md) 中的提示词自动完成安装。
- 本地开发桥接：在本仓库中使用 [.opencode/plugins/opencode-tbot.ts](./.opencode/plugins/opencode-tbot.ts) 直接 re-export `src/plugin.ts`。
- 未发布外部项目回退：先构建 `dist`，再在目标 OpenCode 项目中创建一个 bridge 文件去 re-export `dist/plugin.js`。

更完整的部署说明和取舍分析请参考 [docs/deployment.md](./docs/deployment.md)。

## 常见问题

### 我需要一个正在运行的 OpenCode 实例吗？

需要。这个仓库提供的是 Telegram 集成层，依赖加载它的 OpenCode 主进程。

### 这是 OpenCode 官方项目吗？

不是。它只是与 OpenCode 集成，不属于 OpenCode 官方团队。

### 为什么推荐 Node.js 22？

项目使用了较新的 Node API，包括 `node:sqlite`，因此 Node.js 22 及以上是最稳妥的基线版本。
