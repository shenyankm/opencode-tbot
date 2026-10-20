# opencode-tbot

通过 Telegram 操作 [OpenCode](https://opencode.ai/v2/docs)：对话、图片、会话、模型、Agent 与权限审批。基于 grammY 和 OpenCode V2 SDK，与 OpenCode 官方团队无隶属关系。

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

## 快速开始

需要兼容 SDK `2.0.29` 的 OpenCode V2，以及 Node.js `>=22.12.0`。不支持 OpenCode V1。

1. 在 Telegram 联系 `@BotFather`，执行 `/newbot` 创建机器人；通过 `@userinfobot` 获取自己的数字 ID，用于限制私聊访问。
2. 安装 OpenCode 和插件，按提示输入 bot token 和 owner 的 Telegram 用户 ID：

   ```bash
   npm install -g @opencode/cli@2.0.29
   npm exec -- opencode-tbot@latest
   ```

3. 检查安装器保存的授权 ID，然后启动共享服务，并从项目目录加载工作区：

   ```bash
   opencode serve --service
   # 在另一个终端中，进入项目目录后执行：
   opencode api location.get --header "x-opencode-directory:$(node -p 'encodeURIComponent(process.cwd())')"
   ```

4. 保持 OpenCode 运行。在 Telegram 打开机器人，发送 `/status`，再发送 `/new [标题]` 或直接输入消息。

仅启动共享服务不会加载项目插件；单独的 `opencode serve` 缺少插件需要的服务发现信息。修改配置后，可通过 `opencode reload` 重载已有的共享服务。

## 配置

安装器先校验 token，再写入 `~/.config/opencode/opencode-tbot/config.json`：

```json
{
  "telegram": {
    "botToken": "your_telegram_bot_token",
    "allowedChatIds": ["123456789"]
  }
}
```

`allowedChatIds` 为空或省略时拒绝所有聊天和回调。首次安装必须填写 owner ID（无人值守安装使用 `--owner-id <id>`），安装器会显示最终授权 ID；未指定替换 owner 时保留已有名单。不提供公开模式或首消息自动配对。授权群聊即信任**群内全部成员**，包含权限审批；仅限 owner 时请只授权私聊 ID。撤销聊天后执行 `opencode reload`，历史绑定和菜单也不能继续发送通知或审批。安装器同时在 `~/.config/opencode/opencode.json` 注册 `"plugins": ["opencode-tbot"]`；插件 options 可覆盖文件配置。已有 V1 注册会保留 options 并迁移。运行时不读取 `.env`。

聊天偏好保存在 JSON 状态文件中。脱敏日志输出到主机控制台及 `~/.local/share/opencode/log/plugins/opencode-tbot/`。

思考内容及展开状态以私有文件保存在 `<状态文件路径>.thinking/`；保留这些文件，重启后才能重新展开历史思考。

## 命令

| 命令 | 功能 |
| --- | --- |
| `/start` | 查看快速入门。 |
| `/status` | 查看主机、工作区、插件和 MCP 状态。 |
| `/new [标题]` | 在当前项目创建会话。 |
| `/sessions` | 切换或重命名会话。 |
| `/model`、`/models` | 按提供商分组选择模型与思考强度，标记当前选择。 |
| `/agents`、`/agent` | 切换 Agent。 |
| `/cancel` | 停止请求或取消待处理的重命名。 |
| `/language` | 切换英语、简体中文和日语。 |

V2 HTTP API 不提供 LSP 状态，因此该项显示为不可查询。

## 消息行为

- 所有文本消息均使用 Telegram Rich Messages，包括命令菜单、权限审批、实时回复与状态。原生 Markdown 保留标题、列表、代码块和表格；请使用较新的 Telegram 客户端。
- 私聊回答使用原生 Rich Message 草稿流式输出，完整分段与最终回答保存为正式消息；其他聊天类型通过编辑消息实时更新。表格只在完整行之间切分，每段重复表头，生成中的不完整行暂存。单行过长时允许超过 1,024 字符目标；超过安全长度的行按纯文本完整发送。
- 思考以「💭 思考 · 展开」单行显示，点击在原消息中展开、收起，展开期间继续实时更新，与回答、状态分开。长思考和回答按约 1,024 字符完整分段，优先保留句子与段落边界；不显示工具摘要。
- 停止按钮只停止对应请求，并保留已生成内容。取消时也会移除该请求尚未投递的输入；取消准备中的请求不会中断之前绑定的会话。远端取消失败时仍会结束本地等待。
- 停止或重载插件会结束本地请求等待。插件重载期间，进行中的会话仍由 OpenCode 执行；可使用 `/cancel` 中断会话。
- 模型服务出错时保留已生成的回答，并单独显示错误。上下文压缩使用独立进度消息。
- 结尾状态显示工作区、`提供商 / 模型(思考强度)`、Agent、上下文剩余比例、窗口上限和耗时（`s`/`m`/`h`）。切换模型或 Agent、移动工作区及压缩后更新同一条状态；压缩后未收到新用量时显示未知。
- 图片和图片文档在临时会话分支中处理，权限请求通过按钮审批。不支持语音消息。
- 临时网络故障会自动重连；无效 token 或重复轮询冲突会停止。升级后请用 `/model` 重新打开旧模型菜单。

模型与 Agent 选择属于 OpenCode 会话；聊天或 TUI 需要独立选择时，请使用不同会话。

## 更新与卸载

```bash
npm exec -- opencode-tbot@latest update
npm exec -- opencode-tbot@latest uninstall
```

两者均保留插件配置：`update` 刷新注册，`uninstall` 移除注册。其他 CLI 选项见 `--help`。

## 开发与 CI

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

[CI](./.github/workflows/ci.yml) 在 PR 和 `main` 推送时运行：使用 Node 22.12.0／24 检查类型、单元测试、构建与 CLI 产物。独立任务将插件打包后放入 OpenCode `2.0.29` 验证，Telegram API 使用本地模拟服务，不需要真实凭据或模型请求。

本地运行主机集成测试前，确保匹配版本的 OpenCode CLI 已加入 `PATH`：

```bash
OPENCODE_HOST_E2E=1 pnpm exec tsx --test tests/opencode-host.integration.test.ts
```

## 诊断、限制与历史保留

在项目目录执行 `npm exec -- opencode-tbot@latest doctor`，只读检查 Node、授权、路径可写性、Telegram webhook、共享宿主与已加载的工作区。Telegram 没有不消费更新的竞争 poller 查询接口；诊断会明确显示未知并说明 409 冲突的处理方法。

Token 配置通过临时文件原子替换；POSIX 文件权限为 `0600`，插件专用目录为 `0700`。Windows 使用当前用户继承的 ACL，数值权限不能证明 ACL 隔离；共享 Windows 主机需检查目录 ACL。更新时保留配置。

| 配置项 | 默认值 |
|---|---|
| `telegram.botToken` | 必填 |
| `telegram.allowedChatIds` | `[]`（拒绝全部） |
| `telegram.apiRoot` | `https://api.telegram.org` |
| `state.path` | `./data/opencode-tbot.state.json`，相对于工作区 |
| `prompt.waitTimeoutMs` | `1800000` |
| `prompt.pollRequestTimeoutMs` | `15000` |
| `prompt.recoveryInactivityTimeoutMs` | `120000` |
| `tokens.showBreakdown` | `false` |
| `logging.level` | `info` |
| `logging.sinks.host`、`logging.sinks.file` | `true` |
| `logging.file.dir` | `~/.local/share/opencode/log/plugins/opencode-tbot/` |
| `logging.file.retention.maxFiles` | `30` |
| `logging.file.retention.maxTotalBytes` | `314572800` |

准备阶段总截止时间为 60 秒；下载总超时 30 秒，按实际读取字节限制为 20 MiB。Stop 同时覆盖准备与执行阶段，晚返回的结果不能重新绑定聊天。临时会话删除使用独立 5 秒超时；失败时记录 session ID，供在 OpenCode 中删除。仅更新时间戳失败会记录警告并保留完整回答。结构错误或未知版本的状态文件会报错并保留原文件。

思考历史保留 30 天，最多 2,000 个文件 / 32 MiB，写入时至多每分钟清理一次。权限历史保留 30 天、最多 1,000 条，过期的待审批按钮也会失效。立即清理：先停止插件，在其工作区执行 `npm exec -- opencode-tbot@latest prune`，然后重启。恢复或迁移前应备份状态文件。

发布检查使用 `pnpm lint`、`pnpm verify:package`、`pnpm verify:release`（要求干净提交、匹配的版本 tag 与 CHANGELOG）；发布后运行 `node scripts/verify-package.mjs --registry <version>` 验证 npm 包。`main` 可以包含未发布内容，已发布版本以 `package.json` 和 release tag 为准。桌面端手工验收夹具：`pnpm exec tsx tests/telegram-desktop.manual.ts`，仅使用已授权聊天和可控 provider 事件。

[优化与验收报告（2026-10-20）](docs/validation/2026-10-20-optimizations/README.md)
