# opencode-tbot

通过 Telegram 操作 [OpenCode](https://opencode.ai/v2/docs)：对话、图片、会话、模型、Agent 与权限审批。基于 grammY 和 OpenCode V2 SDK，与 OpenCode 官方团队无隶属关系。

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

## 快速开始

需要兼容 SDK `2.0.29` 的 OpenCode V2，以及 Node.js `>=22.12.0`。不支持 OpenCode V1。

1. 在 Telegram 联系 `@BotFather`，执行 `/newbot` 创建机器人；通过 `@userinfobot` 获取自己的数字 ID，用于限制私聊访问。
2. 安装 OpenCode 和插件，按提示输入 bot token：

   ```bash
   npm install -g @opencode/cli@2.0.29
   npm exec -- opencode-tbot@latest
   ```

3. 在下方配置中设置 `telegram.allowedChatIds`，然后启动共享服务，并从项目目录加载工作区：

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

`allowedChatIds` 为空或省略时允许所有聊天访问。安装器同时在 `~/.config/opencode/opencode.json` 注册 `"plugins": ["opencode-tbot"]`；插件 options 可覆盖文件配置。已有 V1 注册会保留 options 并迁移。运行时不读取 `.env`。

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
