# opencode-tbot

一个通过 Telegram 驱动 [OpenCode](https://opencode.ai) 的插件。
基于 [grammY](https://grammy.dev) 和 `@opencode-ai/sdk` 实现。

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> 本项目并非由 OpenCode 团队开发，也不是 OpenCode 官方项目。

## 概览

`opencode-tbot` 让你可以在 Telegram 中操作 OpenCode，并为每个 chat 维护一份独立的活动绑定状态。

- 纯文本消息会转发到当前 OpenCode 会话。
- Telegram 照片和图片文档会作为 OpenCode 文件分段上传。
- OpenCode 发起的权限请求可以在 Telegram 内联按钮中批准或拒绝。
- 会话错误事件可以回推到已绑定的 Telegram chat。
- chat 绑定、语言选择，以及模型或 Agent 偏好会保存在 JSON 状态文件中。

## 环境要求

- 一个正在运行且会加载该插件的 OpenCode Host 进程。
- 一个 Telegram bot token。
- 用于 CLI 的 Node.js `>=22.12.0`。

## 获取 Telegram 凭据

- `botToken`：打开 Telegram，联系 `@BotFather`，执行 `/newbot`，按提示创建机器人并复制返回的 token。
- `userId` / `chatId`：在 Telegram 中打开 `@userinfobot`，复制它返回的数字 ID。对于和 bot 的私聊场景，这个值可以直接写入 `telegram.allowedChatIds`。

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
    "allowedChatIds": ["123456789"]
  },
  "tokens": {
    "showBreakdown": false
  }
}
```

### 字段说明

| 字段 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `telegram.botToken` | 是 | - | Telegram bot token。通常会在 `getMe` 校验通过后由安装器写入全局插件配置。 |
| `telegram.allowedChatIds` | 否 | `[]` | 允许访问的 Telegram chat ID。为空时，bot 会接受任意 chat 的消息。 |
| `tokens.showBreakdown` | 否 | `false` | `/token` 的全局开关，用于控制是否显示包含 `本次请求总输入`、`输出`、`推理`、`cache.read`、`cache.write` 的第二行页脚明细。第一行显示令牌总数始终按这五项重算，不会写入 worktree 状态文件。 |

## 快速开始

1. 运行 `npm exec -- opencode-tbot@latest`。
2. 如果需要限制可访问 chat，在 `~/.config/opencode/opencode-tbot/config.json` 中设置 `telegram.allowedChatIds`。
3. 在 Telegram 中执行 `/status` 验证连通性。
4. 执行 `/new [title]`，或者直接发送文本或图片消息开始使用。

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

## FAQ

### 需要一个正在运行的 OpenCode 实例吗？

需要。本仓库只提供 Telegram 集成层，依赖加载该插件的 OpenCode Host 进程。

### 需要全局安装 `opencode-tbot` 吗？

不需要。推荐方式是 `npm exec -- opencode-tbot@latest`。全局安装只会安装 CLI；OpenCode 仍然通过 `opencode.json` 读取插件注册。

### Telegram token 无效时会怎样？

`install` 会在写入 `opencode.json` 和 `~/.config/opencode/opencode-tbot/config.json` 之前失败。如果运行期 token 之后失效，插件会被禁用，但 OpenCode 仍应继续启动，不再因为插件启动失败而崩溃。

### 这是 OpenCode 官方项目吗？

不是。它与 OpenCode 集成，但不是由 OpenCode 团队开发。
