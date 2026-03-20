# opencode-tbot

チャットから [OpenCode](https://opencode.ai) を操作するための Telegram プラグインです。

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> このプロジェクトは OpenCode チームによって開発されたものではなく、公式な関連もありません。

## できること

`opencode-tbot` を使うと、Telegram から OpenCode を操作できます。

- テキストメッセージは現在アクティブな OpenCode セッションに転送されます。
- Telegram の画像は OpenCode のファイルパートとしてアップロードされます。
- Telegram の音声メッセージは、通常の prompt フローに入る前に OpenRouter で文字起こしできます。
- OpenCode が発行した権限リクエストは、Telegram のインラインボタンから直接承認または拒否できます。
- セッション完了やエラーイベントは、紐付けられた Telegram チャットへ通知できます。
- チャット状態は JSON の state ファイルに保存され、Node と Bun の両方のランタイムで動作します。

## インストール

次を実行します。

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- install
```

インストーラーはプラグインをグローバルに登録し、デフォルトのランタイム設定を書き込みます。

インストール済み CLI のバージョン確認:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- --version
```

OpenCode に登録済みの npm プラグイン spec を更新:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- update
```

OpenCode 上でプラグインが `file:///.../node_modules/...` のようなパスで表示される場合は、古いローカル npm インストールを削除します。

```bash
npm uninstall opencode-tbot
```

## 設定

ランタイム設定は次の順序で読み込まれます。

1. `~/.config/opencode/opencode-tbot/config.json` のグローバルデフォルト
2. `<worktree>/tbot.config.json` のプロジェクト上書き設定

プロジェクト設定はグローバル設定に上書きマージされます。`telegram`、`state`、`openrouter` はセクション単位でディープマージされます。

### `tbot.config.json` の例

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

### フィールド

| フィールド | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `telegram.botToken` | はい | - | Telegram bot token。通常はインストーラーがグローバルプラグイン設定へ書き込みます。 |
| `telegram.allowedChatIds` | いいえ | `[]` | 許可する Telegram chat ID の配列。空の場合はすべての chat を受け付けます。 |
| `telegram.apiRoot` | いいえ | `https://api.telegram.org` | Telegram Bot API のベース URL。テストやセルフホストのゲートウェイ向けです。 |
| `state.path` | いいえ | `./data/opencode-tbot.state.json` | JSON state ファイルのパス。現在の OpenCode worktree からの相対パスとして解決されます。 |
| `openrouter.apiKey` | いいえ | `""` | OpenRouter API key。音声文字起こしを有効にする場合のみ必要です。 |
| `openrouter.model` | いいえ | `openai/gpt-audio-mini` | 音声文字起こしに使う OpenRouter モデル。 |
| `openrouter.timeoutMs` | いいえ | `30000` | 音声文字起こしのタイムアウト時間（ミリ秒）。 |
| `openrouter.transcriptionPrompt` | いいえ | `""` | 文字起こしプロンプトに追加される任意の補足指示。 |
| `logLevel` | いいえ | `info` | プラグインのログレベル。ログは `client.app.log()` 経由で出力されます。 |

## ランタイム上の前提

必須:

- `telegram.botToken`

任意:

- `telegram.allowedChatIds`
- `telegram.apiRoot`
- `state.path`
- `openrouter.apiKey`
- `openrouter.model`
- `openrouter.timeoutMs`
- `openrouter.transcriptionPrompt`
- `logLevel`

補足:

- `state.path` のデフォルトは `./data/opencode-tbot.state.json` で、現在の OpenCode worktree からの相対パスとして解決されます。
- ログは `client.app.log()` 経由で出力されます。
- 権限承認とセッション通知はプラグインの hook で処理されます。

## コマンド

- `/start` 短いウェルカムメッセージとクイックスタート手順を表示
- `/status` OpenCode のヘルス、パス、LSP、MCP の状態をまとめて表示
- `/new [title]` 新しい OpenCode セッションを作成
- `/agents` または `/agent` 利用可能な agent を一覧表示し、アクティブな agent を切り替え
- `/sessions` 利用可能なセッションを一覧表示し、アクティブなセッションを切り替え
- `/cancel` セッション名の変更をキャンセルするか、現在のセッションで実行中のリクエストを中止
- `/model` または `/models` 利用可能なモデルを一覧表示し、アクティブなモデルを切り替え
- `/language` bot の表示言語を切り替え

コマンド以外のテキストメッセージは prompt として扱われ、OpenCode に送信されます。OpenRouter が設定されている場合、Telegram の `voice` メッセージは文字起こし後に同じ prompt フローへ入ります。Telegram の画像は OpenCode のファイルパートとして転送されます。

## 開発

プラグインバンドルをビルド:

```bash
pnpm build
```

型チェック:

```bash
pnpm typecheck
```

テスト実行:

```bash
pnpm test
```

このリポジトリでソースベースのローカル読み込みを行う場合、OpenCode は [.opencode/plugins/opencode-tbot.ts](./.opencode/plugins/opencode-tbot.ts) を使って `src/plugin.ts` を再エクスポートできます。

## FAQ

### 実行中の OpenCode インスタンスは必要ですか？

はい。このリポジトリが提供するのは Telegram 連携レイヤーであり、プラグインを読み込む OpenCode ホストプロセスに依存します。

### これは OpenCode の公式プロジェクトですか？

いいえ。OpenCode と連携するプロジェクトですが、OpenCode チームが開発したものではありません。
