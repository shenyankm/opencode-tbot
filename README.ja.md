# opencode-tbot

Telegram から [OpenCode](https://opencode.ai) を操作するためのプラグインです。

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> このプロジェクトは OpenCode チームによる公式開発ではなく、OpenCode の公式プロジェクトでもありません。

## 概要

`opencode-tbot` を使うと、Telegram から OpenCode を操作し、chat ごとに独立したアクティブなバインディング状態を保持できます。

- プレーンテキストメッセージは現在の OpenCode セッションに転送されます。
- Telegram の写真や画像ドキュメントは OpenCode の file part としてアップロードされます。
- 画像付きのやり取りは一時的な fork セッションで処理されるため、その後のテキスト専用プロンプトに画像コンテキストが残りません。
- OpenCode が発行した権限リクエストは Telegram のインラインボタンから承認または拒否できます。
- セッションエラーイベントは、バインド済みの Telegram chat に通知できます。
- 音声メッセージは明示的に拒否され、ローカライズされた案内が返ります。
- chat のバインド、言語設定、モデルやエージェントの選択は JSON 状態ファイルに保存されます。

## 要件

- このプラグインを読み込む OpenCode Host プロセスが起動していること
- Telegram bot token
- CLI とローカル開発用の Node.js `>=22.12.0`
- リポジトリ開発用の `pnpm`

## インストール、更新、アンインストール

推奨インストール方法:

```bash
npm exec -- opencode-tbot@latest
```

インストーラーは次を行います。

- 対話実行時には Telegram bot token の入力を促します
- 設定ファイルを書き込む前に `getMe` で Telegram bot token を検証します
- `~/.config/opencode/opencode.json` を書き換え、`plugin` に `opencode-tbot` が含まれるようにします
- `~/.config/opencode/opencode-tbot/config.json` を書き込み、または既存内容とマージします
- 足りない親ディレクトリを自動作成します
- 完了時には最小限の成功メッセージだけを表示します

`install` は既定コマンドです。非対話実行では token を明示的に渡してください。

```bash
npm exec -- opencode-tbot@latest --bot-token <token>
```

既存のプラグイン設定を変更せずに OpenCode のプラグイン登録だけを更新する場合:

```bash
npm exec -- opencode-tbot@latest update
```

OpenCode のプラグイン登録を削除し、既存のプラグイン設定ファイルは残す場合:

```bash
npm exec -- opencode-tbot@latest uninstall
```

CLI バージョンを表示:

```bash
npm exec -- opencode-tbot@latest --version
```

ヘルプを表示:

```bash
npm exec -- opencode-tbot@latest --help
```

補足:

- `install` は Telegram token のリモート検証に成功したあとでだけ設定を書き込みます。検証に失敗した場合、新しい設定は書き込まれません。
- `install` は `opencode.json` とグローバルプラグイン設定ファイルの両方を更新します。
- `update` は `opencode.json` だけを更新し、既存のプラグイン設定内容は変更しません。
- `uninstall` は `opencode.json` から `opencode-tbot` を削除し、`~/.config/opencode/opencode-tbot/config.json` はそのまま残します。
- OpenCode は起動時に `opencode.json` から npm プラグインを自動インストールし、`~/.cache/opencode/node_modules/` にキャッシュするため、通常利用では `npm install -g opencode-tbot` は不要です。
- 既存の `~/.config/opencode/package.json`、`bun.lock`、`.gitignore`、`node_modules` は OpenCode 自身の実行状態に属している可能性があるため、インストーラーは削除も退避も行いません。
- 衝突として扱うのは `~/.config/opencode/plugins/opencode-tbot.*` にある同名のローカルファイルプラグインだけです。見つかった場合は npm プラグインを有効にせず、名前変更または削除を案内します。

### CLI オプション

共通オプション:

- `--help`
- `--version`

`install` がサポートするオプション:

- `--bot-token <token>` Telegram bot token を非対話で設定
- `--telegram-api-root <url>` Telegram Bot API の root URL を上書き
- `--home-dir <path>` カスタム home ディレクトリを使用

`update` がサポートするオプション:

- `--home-dir <path>`

`uninstall` がサポートするオプション:

- `--home-dir <path>`

## 設定

実行時設定は次のパスから読み込まれます。

- `~/.config/opencode/opencode-tbot/config.json`

プログラムから設定を明示的に渡すこともできます。渡した値はファイル値を上書きします。

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
      "dir": "<home>/.local/share/opencode/log/plugins/opencode-tbot",
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
| `telegram.botToken` | はい | - | Telegram bot token。通常は `getMe` 検証に成功したあとでインストーラーがグローバルプラグイン設定へ書き込みます。 |
| `telegram.allowedChatIds` | いいえ | `[]` | 許可する Telegram chat ID。空の場合は任意の chat からのメッセージを受け付けます。 |
| `telegram.apiRoot` | いいえ | `https://api.telegram.org` | Telegram Bot API の base URL。テストや self-hosted gateway 向けです。 |
| `state.path` | いいえ | `./data/opencode-tbot.state.json` | JSON 状態ファイルのパス。現在の OpenCode worktree を基準に解決されます。 |
| `prompt.waitTimeoutMs` | いいえ | `1800000` | 1 回の async prompt ライフサイクル全体に対する最大待機時間です。 |
| `prompt.pollRequestTimeoutMs` | いいえ | `15000` | OpenCode に対する各 recovery poll リクエストのタイムアウトです。 |
| `prompt.recoveryInactivityTimeoutMs` | いいえ | `120000` | prompt の進捗が止まったときにだけ適用される recovery timeout です。 |
| `logging.level` | いいえ | `info` | host と file sink で使う構造化ログレベルです。未知の値は `info` に正規化されます。 |
| `logging.sinks.host` | いいえ | `true` | `client.app.log(...)` 経由で OpenCode Host にログを書き込むかどうかです。 |
| `logging.sinks.file` | いいえ | `true` | プラグイン独自の JSONL ファイルログを書き込むかどうかです。 |
| `logging.file.dir` | いいえ | `<home>/.local/share/opencode/log/plugins/opencode-tbot` | プラグインの JSONL ログディレクトリ。相対パスは現在の OpenCode worktree 基準で解決されます。 |
| `logging.file.retention.maxFiles` | いいえ | `30` | 保持するプラグインログファイルの最大数です。 |
| `logging.file.retention.maxTotalBytes` | いいえ | `314572800` | 保持するプラグインログファイルの総容量上限です。 |

### 補足

- `state.path` は現在の OpenCode worktree 基準で解決されます。
- `logging.file.dir` が相対パスの場合も現在の OpenCode worktree 基準で解決されます。未指定の場合はユーザーの home ディレクトリ配下の既定ログディレクトリが使われます。
- Telegram の prompt 処理は async-first です。プラグインは `session.promptAsync()` を送信し、その後にセッションメッセージと状態から最終応答を復元します。
- `telegram.allowedChatIds` を空にすると、bot は任意の chat からのメッセージを受け付けます。本番環境では明示的な制限を推奨します。
- `/language` は bot の表示言語を切り替えるだけでなく、その chat 用の Telegram コマンド説明も再同期します。
- ファイルログは既定でメタデータのみを記録し、prompt 本文、添付内容、元 URL、secret は書き込みません。

## クイックスタート

1. `npm exec -- opencode-tbot@latest` を実行します。
2. 特定の chat のみを許可したい場合は、`~/.config/opencode/opencode-tbot/config.json` で `telegram.allowedChatIds` を設定します。
3. 対象 worktree で OpenCode を起動し、プラグイン runtime が読み込まれるようにします。
4. Telegram で `/status` を実行して接続を確認します。
5. `/new [title]` を実行するか、テキストまたは画像メッセージを直接送って使い始めます。

## コマンド

| コマンド | 動作 |
| --- | --- |
| `/start` | 短いウェルカムメッセージとクイックスタートの案内を表示します。 |
| `/status` | OpenCode の health、version、workspace path、plugin list、LSP 状態、MCP 状態をまとめて表示します。 |
| `/new [title]` | 現在のプロジェクトに新しい OpenCode セッションを作成します。 |
| `/agents` または `/agent` | 利用可能なエージェントを一覧表示し、現在のエージェントを切り替えます。 |
| `/sessions` | 利用可能なセッションを一覧表示し、切り替えや名前変更操作を提供します。 |
| `/cancel` | 保留中のセッション名変更入力を取り消すか、現在のセッションで実行中のリクエストを中止します。 |
| `/model` または `/models` | OpenCode が接続済み provider 向けに公開しているモデルを表示し、現在のモデルや推論レベルを切り替えます。 |
| `/language` | 現在の chat の bot 表示言語を切り替え、コマンド説明を再同期します。 |

### メッセージの挙動

- コマンド以外のテキストは prompt として OpenCode に送信されます。
- Telegram の写真と画像ドキュメントは OpenCode の file part として転送されます。
- 画像添付は現在のアクティブセッションの一時 fork 内で処理されるため、後続のテキスト専用コンテキストを汚しません。
- 権限承認は Telegram のインラインボタンから処理できます。
- `/cancel` は OpenCode セッションの処理と Telegram 側の待機状態を同時に中止し、次の prompt をすぐ開始できるようにします。
- Telegram の音声メッセージは未対応で、ローカライズされた拒否メッセージを返します。

## ログ

- OpenCode Host のログディレクトリ: `<home>/.local/share/opencode/log`
- 既定のプラグインログディレクトリ: `<home>/.local/share/opencode/log/plugins/opencode-tbot`
- ファイル形式: append-only の JSONL、1 行につき 1 件の構造化イベント
- 主な相関フィールド: `runtimeId`, `operationId`, `correlationId`, `updateId`, `chatId`, `sessionId`, `projectId`
- よく使う component: `runtime`, `telegram`, `opencode`, `prompt`, `plugin-event`, `storage`
- 既定の保持方針: 最新 30 ファイル、合計 300 MB 以下

## 開発

依存関係をインストール:

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

テスト一式を実行:

```bash
pnpm test
```

CLI テストファイルを実行:

```bash
pnpm exec tsx --test tests/cli.test.ts
```

CI に最も近い統合経路:

```bash
npm install -g opencode-ai
OPENCODE_HOST_E2E=1 pnpm test
```

PowerShell:

```powershell
npm install -g opencode-ai
$env:OPENCODE_HOST_E2E="1"; pnpm test
```

## FAQ

### 実行中の OpenCode インスタンスは必要ですか？

はい。このリポジトリは Telegram 連携レイヤーのみを提供し、プラグインを読み込む OpenCode Host プロセスに依存します。

### `opencode-tbot` をグローバルインストールする必要はありますか？

いいえ。推奨フローは `npm exec -- opencode-tbot@latest` です。グローバルインストールは CLI を入れるだけで、OpenCode 側のプラグイン登録は引き続き `opencode.json` から読み込まれます。

### Telegram token が無効な場合はどうなりますか？

`install` は `opencode.json` と `~/.config/opencode/opencode-tbot/config.json` を書き込む前に失敗します。実行中に token が無効化された場合でも、プラグインは無効化されるだけで、OpenCode 本体はクラッシュせずに起動を続ける想定です。

### これは OpenCode の公式プロジェクトですか？

いいえ。OpenCode と連携しますが、OpenCode チームが開発したものではありません。
