# opencode-tbot

Telegram から [OpenCode](https://opencode.ai) を操作するためのプラグインです。

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

> このプロジェクトは OpenCode チームによって開発されたものではなく、公式プロジェクトでもありません。

## 概要

`opencode-tbot` を使うと、Telegram から OpenCode を操作でき、チャットごとに 1 つのバインド状態を維持できます。

- プレーンテキストメッセージは現在の OpenCode セッションに転送されます。
- Telegram の写真と画像ドキュメントは OpenCode のファイルパートとしてアップロードされます。
- 画像を含むターンは一時的に fork したセッションで実行されるため、後続のテキスト専用プロンプトに画像コンテキストが残りません。
- OpenCode が発行した権限リクエストは、Telegram のインラインボタンから承認または拒否できます。
- セッションエラーイベントは、紐付けられた Telegram チャットへ通知できます。
- 音声メッセージは明示的に拒否され、ローカライズされた案内を返します。
- チャットのバインドとセッション選択状態は JSON の state ファイルに保存されます。

## 前提条件

- このプラグインを読み込む OpenCode Host プロセスが動作していること。
- Telegram bot token を用意していること。
- CLI とローカル開発のために Node.js `>=22.12.0` が必要です。
- リポジトリ開発には `pnpm` が必要です。

## インストールと更新

推奨インストール方法:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- install
```

インストーラーは次を行います。

- グローバル OpenCode プラグイン一覧に `opencode-tbot@latest` を登録
- 実際に使われる OpenCode グローバル設定ファイルを更新
- グローバルのプラグイン実行設定を作成またはマージ
- OpenCode 設定パス、プラグイン設定パス、既定のプラグインログディレクトリを表示

`~/.config/opencode/opencode.jsonc` がすでに存在する場合はそのファイルを優先して更新し、存在しない場合は `~/.config/opencode/opencode.json` を使います。

インストール済み CLI のバージョン確認:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- --version
```

bot token を変更せず、OpenCode に登録された npm プラグイン spec だけを更新:

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- update
```

`install` は既定コマンドです。たとえば、非対話インストールでは次の形でも実行できます。

```bash
npm exec --package opencode-tbot@latest opencode-tbot -- --bot-token <token>
```

### CLI オプション

`install` で利用可能:

- `--bot-token <token>` Telegram bot token を非対話で設定
- `--telegram-api-root <url>` Telegram Bot API のベース URL を上書き
- `--plugin-spec <spec>` カスタム npm プラグイン spec を登録
- `--skip-register` OpenCode 側のプラグイン登録は変更せず、プラグイン設定だけを書き換え
- `--home-dir <path>` カスタム home ディレクトリを使用

`update` で利用可能:

- `--plugin-spec <spec>`
- `--home-dir <path>`

## 設定

ランタイム設定は次のパスからのみ読み込まれます。

- `~/.config/opencode/opencode-tbot/config.json`

OpenCode のプラグイン登録情報はグローバル OpenCode 設定に保存されます。

- 存在する場合は `~/.config/opencode/opencode.jsonc`
- なければ `~/.config/opencode/opencode.json`

このプラグインは `.env` からランタイム設定を読み込みません。グローバル JSON 設定を使ってください。

レガシー挙動:

- `<worktree>/tbot.config.json` はランタイムで無視されます。見つかった場合は移行用の警告ログが出ます
- 古い `openrouter` 音声文字起こし設定はランタイムで無視され、インストーラーが設定を書き直す際にも削除されます

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
  },
  "logLevel": "info"
}
```

### 設定項目

| 項目 | 必須 | 既定値 | 説明 |
| --- | --- | --- | --- |
| `telegram.botToken` | はい | - | Telegram bot token。通常はインストーラーがグローバル設定に書き込みます。 |
| `telegram.allowedChatIds` | いいえ | `[]` | 許可する Telegram chat ID。一覧が空なら任意の chat を受け付けます。 |
| `telegram.apiRoot` | いいえ | `https://api.telegram.org` | Telegram Bot API のベース URL。テストやセルフホスト環境向けです。 |
| `state.path` | いいえ | `./data/opencode-tbot.state.json` | JSON state ファイルのパス。現在の OpenCode worktree からの相対パスとして解決されます。 |
| `prompt.waitTimeoutMs` | いいえ | `1800000` | 1 回の非同期 prompt ライフサイクル全体に対する待機上限。 |
| `prompt.pollRequestTimeoutMs` | いいえ | `15000` | OpenCode への各 recovery poll リクエストのタイムアウト。 |
| `prompt.recoveryInactivityTimeoutMs` | いいえ | `120000` | 進捗が止まった場合にのみ適用される recovery タイムアウト。 |
| `logging.level` | いいえ | `info` | host/file 両方に使う構造化ログレベル。`debug`、`info`、`warn`、`error` に正規化されます。 |
| `logging.sinks.host` | いいえ | `true` | `client.app.log({ body: ... })` 経由で OpenCode Host ログへ書き込むかどうか。 |
| `logging.sinks.file` | いいえ | `true` | プラグイン独自の JSONL ファイルログを有効にするかどうか。 |
| `logging.file.dir` | いいえ | `%USERPROFILE%/.local/share/opencode/log/plugins/opencode-tbot` | プラグイン JSONL ログのディレクトリ。相対パスは現在の OpenCode worktree 基準で解決されます。 |
| `logging.file.retention.maxFiles` | いいえ | `30` | 保持するプラグインログファイル数の上限。 |
| `logging.file.retention.maxTotalBytes` | いいえ | `314572800` | 保持するプラグインログ合計サイズの上限。 |
| `logLevel` | いいえ | `info` | `logging.level` の互換エイリアス。後方互換のため引き続き利用できます。 |

### 補足

- `state.path` は現在の OpenCode worktree からの相対パスとして解決されます。
- `logging.file.dir` が相対パスの場合も現在の worktree から解決されます。
- Telegram の prompt 処理は async-first です。プラグインは `session.promptAsync()` を送信し、その後メッセージとセッション状態から最終応答を回収します。
- `telegram.allowedChatIds` を空のままにすると、bot は任意の chat からのメッセージを受け付けます。本番では制限を設定してください。
- 権限承認とセッションエラー通知はプラグイン hook で処理されます。
- `/language` は現在 English、简体中文、日本語 をサポートし、その chat 用の Telegram コマンド説明も同期します。
- ファイルログは既定でメタデータのみを記録し、prompt 本文、添付内容、生の URL、secret は書き込みません。

## クイックスタート

1. `npm exec --package opencode-tbot@latest opencode-tbot -- install` を実行します。
2. 特定の chat だけに制限したい場合は `~/.config/opencode/opencode-tbot/config.json` の `telegram.allowedChatIds` を設定します。
3. 対象 worktree で OpenCode を起動し、プラグインランタイムを読み込ませます。
4. Telegram で `/status` を実行して接続を確認します。
5. `/new [title]` を実行するか、直接テキストメッセージを送信して使い始めます。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `/start` | ウェルカムメッセージとクイックスタートを表示します。 |
| `/status` | OpenCode のヘルス、バージョン、ワークスペースパス、プラグイン一覧、LSP、MCP の状態をまとめて表示します。 |
| `/new [title]` | 現在のプロジェクトで新しい OpenCode セッションを作成します。 |
| `/agents` または `/agent` | 利用可能なエージェントを表示し、現在のエージェントを切り替えます。 |
| `/sessions` | 利用可能なセッションを表示し、切り替えやリネーム操作を提供します。 |
| `/cancel` | 保留中のセッション名変更入力をキャンセルするか、現在のセッションで動作中のリクエストを中止します。 |
| `/model` または `/models` | 利用可能なモデルを表示し、切り替えや推論レベル選択を行います。 |
| `/language` | 現在の chat に対する bot 表示言語を切り替えます。 |

### メッセージ動作

- コマンド以外のテキストは prompt として OpenCode に送信されます。
- Telegram の写真と画像ドキュメントは OpenCode のファイルパートとして転送されます。
- 画像添付は現在のセッションの一時 fork 内で処理されるため、後続のテキスト専用コンテキストを汚しません。
- `/cancel` は OpenCode セッション側の処理と Telegram 側の待機状態を同時に中止し、次の prompt をすぐ開始できるようにします。
- Telegram の音声メッセージは未対応で、ローカライズされた拒否メッセージを返します。

## ロギング

- OpenCode Host ログディレクトリ: `%USERPROFILE%/.local/share/opencode/log`
- プラグインログディレクトリ: `%USERPROFILE%/.local/share/opencode/log/plugins/opencode-tbot`
- ファイル形式: 追記型 JSONL、1 行 1 イベント
- 代表的な相関フィールド: `runtimeId`, `operationId`, `correlationId`, `updateId`, `chatId`, `sessionId`, `projectId`
- よく出るコンポーネント: `runtime`, `telegram`, `opencode`, `prompt`, `plugin-event`, `storage`
- 既定の保持ポリシー: 新しい 30 ファイルまで、合計 300 MB まで

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

通常テストの実行:

```bash
pnpm test
```

CI に最も近い統合経路の実行:

```bash
npm install -g opencode-ai
OPENCODE_HOST_E2E=1 pnpm test
```

PowerShell の場合:

```powershell
npm install -g opencode-ai
$env:OPENCODE_HOST_E2E="1"; pnpm test
```

通常利用では、グローバルにインストールした npm プラグインとグローバル OpenCode 設定を使ってください。このリポジトリは既定の `.opencode/plugins` bridge を含みません。

このリポジトリでソースベースのローカル読み込みを行いたい場合は、`.opencode/plugins/opencode-tbot.ts` を手動で作成してください。

```ts
export { default } from "../../src/plugin.ts";
```

有効にする読み込み経路は常に 1 つだけにしてください。手動で作成したローカル bridge か、グローバルにインストールした `opencode-tbot@latest` のどちらかを使います。

## FAQ

### 実行中の OpenCode インスタンスは必要ですか？

はい。このリポジトリは Telegram 連携レイヤーのみを提供しており、プラグインを読み込む OpenCode Host プロセスに依存します。

### なぜ OpenCode に `file:///.../node_modules/...` 形式のプラグインパスが表示されるのですか？

通常は、どこかのローカルプロジェクトに `opencode-tbot` が `node_modules` として入っていることを意味します。CLI はその状態を検出すると警告します。そのプロジェクトで `npm uninstall opencode-tbot` を実行してローカル依存を外し、推奨の `npm exec --package ...` インストールフローを使ってください。

### これは OpenCode の公式プロジェクトですか？

いいえ。OpenCode と連携するプロジェクトですが、OpenCode チームが開発したものではありません。
