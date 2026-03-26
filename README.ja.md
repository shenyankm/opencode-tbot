# opencode-tbot

[OpenCode](https://opencode.ai) を Telegram から操作するためのプラグインです。

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> このプロジェクトは OpenCode チームによって作成されたものではなく、OpenCode 公式の一部でもありません。

## 概要

`opencode-tbot` を使うと、Telegram から OpenCode を直接操作でき、chat ごとに独立したバインディング状態を保持できます。

- 通常のテキストメッセージは現在の OpenCode セッションへ転送されます。
- Telegram の写真や画像ドキュメントは OpenCode の file part としてアップロードされます。
- 画像のやり取りは一時的な fork セッションで実行されるため、その後のテキスト会話に画像コンテキストが残りません。
- OpenCode が発行した権限リクエストは、Telegram の inline ボタンから承認または拒否できます。
- セッションエラーイベントは、バインド済みの Telegram chat に通知できます。
- 音声メッセージは明示的に拒否され、ローカライズされた案内が返ります。
- chat のバインドとセッション選択は JSON 状態ファイルに保存されます。

## 要件

- プラグインを読み込んでいる OpenCode Host の実行中プロセス
- Telegram bot token
- CLI とローカル開発用の Node.js `>=22.12.0`
- リポジトリ開発用の `pnpm`

## インストールと更新

推奨インストール方法：

```bash
npm exec -- opencode-tbot@latest
```

インストーラーは次を行います。

- `~/.config/opencode/opencode.json` に `plugin: ["opencode-tbot"]` を書き込みます
- 足りない親ディレクトリを自動作成します
- `~/.config/opencode/opencode-tbot/config.json` を書き込み、または既存内容とマージします
- OpenCode の設定パス、プラグイン設定パス、既定のプラグインログディレクトリを表示します

`install` は既定コマンドです。次の形式は非対話インストールにも使えます。

```bash
npm exec -- opencode-tbot@latest --bot-token <token>
```

bot token を変えずに OpenCode の npm プラグイン登録だけを更新する場合は次を使います。

```bash
npm exec -- opencode-tbot@latest update
```

インストール済み CLI のバージョン確認：

```bash
npm exec -- opencode-tbot@latest --version
```

`install` と `update` は、`opencode.json` の npm プラグイン登録とプラグイン設定ファイルだけを管理します。

### CLI オプション

`install` がサポートするオプション：

- `--bot-token <token>` Telegram bot token を非対話で設定
- `--telegram-api-root <url>` Telegram Bot API の root URL を上書き
- `--home-dir <path>` カスタム home ディレクトリを使用

`update` がサポートするオプション：

- `--home-dir <path>`

## 設定

実行時設定は次のパスから読み込まれます。

- `~/.config/opencode/opencode-tbot/config.json`

プログラムから設定を渡すこともできます。渡した値はファイル値を上書きします。

OpenCode は次のパスから npm プラグイン登録を読み込みます。

- `~/.config/opencode/opencode.json`

このプラグインは `.env` から実行時設定を読み込みません。

### `config.json` の例

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

### フィールド

| フィールド | 必須 | 既定値 | 説明 |
| --- | --- | --- | --- |
| `telegram.botToken` | はい | - | Telegram bot token。通常はインストーラーがグローバル設定へ書き込みます。 |
| `telegram.allowedChatIds` | いいえ | `[]` | 許可する Telegram chat ID。空の場合は任意の chat を受け付けます。 |
| `telegram.apiRoot` | いいえ | `https://api.telegram.org` | Telegram Bot API の base URL。テストや self-hosted gateway に便利です。 |
| `state.path` | いいえ | `./data/opencode-tbot.state.json` | JSON 状態ファイルのパス。現在の OpenCode worktree を基準に解決されます。 |
| `prompt.waitTimeoutMs` | いいえ | `1800000` | 1 回の async prompt ライフサイクル全体に対する最大待機時間です。 |
| `prompt.pollRequestTimeoutMs` | いいえ | `15000` | OpenCode に対する recovery poll の各リクエストのタイムアウトです。 |
| `prompt.recoveryInactivityTimeoutMs` | いいえ | `120000` | prompt の進捗が止まった場合にだけ適用される recovery timeout です。 |
| `logging.level` | いいえ | `info` | host と file の両方で使う構造化ログレベルです。`debug`、`info`、`warn`、`error` に正規化されます。 |
| `logging.sinks.host` | いいえ | `true` | `client.app.log(...)` 経由で OpenCode Host にログを書き込むかどうかです。 |
| `logging.sinks.file` | いいえ | `true` | プラグイン独自の JSONL ファイルログを書き込むかどうかです。 |
| `logging.file.dir` | いいえ | `%USERPROFILE%/.local/share/opencode/log/plugins/opencode-tbot` | プラグインの JSONL ログディレクトリ。相対パスは現在の OpenCode worktree 基準で解決されます。 |
| `logging.file.retention.maxFiles` | いいえ | `30` | 保持するプラグインログファイルの最大数です。 |
| `logging.file.retention.maxTotalBytes` | いいえ | `314572800` | 保持するプラグインログファイルの総容量上限です。 |

### 補足

- `state.path` は現在の OpenCode worktree 基準で解決されます。
- `logging.file.dir` が相対パスの場合も、現在の OpenCode worktree 基準で解決されます。
- Telegram の prompt 処理は async-first です。プラグインは先に `session.promptAsync()` を送信し、その後にメッセージとセッション状態から最終応答を復元します。
- `telegram.allowedChatIds` を空にすると、bot は任意の chat からのメッセージを受け付けます。本番環境では明示的な制限を推奨します。
- 権限承認とセッションエラー通知は plugin hooks で処理されます。
- `/language` は現在 English、簡体中文、日本語をサポートし、対象 chat の Telegram コマンド説明も同期します。
- ファイルログは既定でメタデータのみを記録し、prompt 本文、添付内容、元 URL、secret は書き込みません。

## クイックスタート

1. `npm exec -- opencode-tbot@latest` を実行します。
2. 特定の chat のみを許可したい場合は、`~/.config/opencode/opencode-tbot/config.json` で `telegram.allowedChatIds` を設定します。
3. 対象 worktree で OpenCode を起動し、プラグイン runtime が読み込まれるようにします。
4. Telegram で `/status` を実行して接続を確認します。
5. `/new [title]` を実行するか、通常のテキストメッセージを送って使い始めます。

## コマンド

| コマンド | 動作 |
| --- | --- |
| `/start` | 短いウェルカムメッセージとクイックスタートの案内を表示します。 |
| `/status` | OpenCode の health、version、workspace path、plugin list、LSP 状態、MCP 状態をまとめて表示します。 |
| `/new [title]` | 現在のプロジェクトに新しい OpenCode セッションを作成します。 |
| `/agents` または `/agent` | 利用可能な Agent を一覧表示し、アクティブな Agent を切り替えます。 |
| `/sessions` | 利用可能なセッションを一覧表示し、アクティブなセッションを切り替え、rename 操作も提供します。 |
| `/cancel` | 保留中のセッション rename 入力を取り消すか、現在セッションで実行中のリクエストを中断します。 |
| `/model` または `/models` | OpenCode が接続済み provider に対して公開している model を一覧表示し、アクティブな model を切り替え、利用可能なら reasoning level も選べます。 |
| `/language` | 現在の chat に対する bot 表示言語を切り替えます。 |

### メッセージの挙動

- コマンド以外のテキストは prompt として OpenCode に送信されます。
- Telegram の写真や画像ドキュメントは OpenCode の file part として転送されます。
- 画像添付は現在セッションの一時 fork 内で処理されるため、後続のテキスト会話に汚染が残りません。
- `/cancel` は OpenCode セッションの処理と Telegram 側の待機状態を同時に中断し、次の prompt をすぐ開始できるようにします。
- Telegram の音声メッセージは未対応で、ローカライズされた拒否メッセージが返ります。

## ログ

- OpenCode Host のログディレクトリ: `%USERPROFILE%/.local/share/opencode/log`
- プラグインのログディレクトリ: `%USERPROFILE%/.local/share/opencode/log/plugins/opencode-tbot`
- ファイル形式: append-only の JSONL、1 行につき 1 件の構造化イベント
- 相関フィールド: `runtimeId`, `operationId`, `correlationId`, `updateId`, `chatId`, `sessionId`, `projectId`
- よく使う component: `runtime`, `telegram`, `opencode`, `prompt`, `plugin-event`, `storage`
- 既定の保持方針: 最新 30 ファイル、合計 300 MB 以下

## 開発

依存関係のインストール:

```bash
pnpm install
```

ビルド:

```bash
pnpm build
```

型チェック:

```bash
pnpm typecheck
```

通常のテスト実行:

```bash
pnpm test
```

CI に最も近い統合パス:

```bash
npm install -g opencode-ai
OPENCODE_HOST_E2E=1 pnpm test
```

PowerShell 版:

```powershell
npm install -g opencode-ai
$env:OPENCODE_HOST_E2E="1"; pnpm test
```

通常利用では、`~/.config/opencode/opencode.json` の npm 登録と、`~/.config/opencode/opencode-tbot/config.json` のプラグイン設定に依存してください。

## FAQ

### 実行中の OpenCode インスタンスは必要ですか？

はい。このリポジトリは Telegram 統合層だけを提供し、プラグインを読み込む OpenCode Host プロセスに依存します。

### これは OpenCode の公式プロジェクトですか？

いいえ。OpenCode と統合しますが、OpenCode チームによる開発ではありません。
