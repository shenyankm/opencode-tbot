# opencode-tbot

Telegram から [OpenCode](https://opencode.ai/v2/docs) を操作するプラグインです。会話、画像、セッション、モデル、Agent、権限承認に対応します。grammY と OpenCode V2 SDK を使用し、OpenCode 公式チームとは関係ありません。

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

## クイックスタート

SDK `2.0.29` と互換性のある OpenCode V2、および Node.js `>=22.12.0` が必要です。OpenCode V1 には対応しません。

1. Telegram の `@BotFather` で `/newbot` を実行して bot を作成します。`@userinfobot` で自分の数値 ID を取得し、プライベートチャットのアクセス制限に使います。
2. OpenCode とプラグインをインストールし、案内に従って bot token と owner の Telegram ユーザー ID を入力します。

   ```bash
   npm install -g @opencode/cli@2.0.29
   npm exec -- opencode-tbot@latest
   ```

3. インストーラーが保存した許可 ID を確認し、共有サービスを起動してプロジェクトの場所を読み込みます。

   ```bash
   opencode serve --service
   # 別のターミナルでプロジェクトディレクトリから実行：
   opencode api location.get --header "x-opencode-directory:$(node -p 'encodeURIComponent(process.cwd())')"
   ```

4. OpenCode を起動したまま Telegram で bot を開き、`/status`、続いて `/new [タイトル]` またはメッセージを送ります。

共有サービスの起動だけではプロジェクトのプラグインは読み込まれません。単独の `opencode serve` には必要なサービス検出情報がありません。設定変更後は `opencode reload` で既存の共有サービスを再読み込みできます。

## 設定

インストーラーは token を検証してから `~/.config/opencode/opencode-tbot/config.json` に書き込みます。

```json
{
  "telegram": {
    "botToken": "your_telegram_bot_token",
    "allowedChatIds": ["123456789"]
  }
}
```

`allowedChatIds` が空または省略された場合は、チャットとコールバックをすべて拒否します。初回インストールは owner ID が必須です（無人実行は `--owner-id <id>`）。許可 ID を表示し、owner を指定しなければ既存リストを保持します。公開モードと最初のメッセージによる自動ペアリングはありません。許可したグループは承認を含む**全メンバー**を信頼します。owner のみに限定する場合は個人チャット ID を指定してください。許可を取り消したら `opencode reload` を実行します。履歴のバインドとメニューも通知や承認に使用できなくなります。`~/.config/opencode/opencode.json` への `"plugins": ["opencode-tbot"]` の登録も自動です。プラグインの options はファイル設定より優先されます。既存の V1 登録は options を保持して移行します。実行時に `.env` は読み込みません。

チャット設定は JSON 状態ファイルに保存します。機密情報をマスクしたログはホストコンソールと `~/.local/share/opencode/log/plugins/opencode-tbot/` に出力します。

思考内容と展開状態は `<状態ファイルのパス>.thinking/` の非公開ファイルに保存します。再起動後も過去の思考を開くには、これらのファイルを保持してください。

## コマンド

| コマンド | 動作 |
| --- | --- |
| `/start` | クイックスタートを表示。 |
| `/status` | ホスト、ワークスペース、プラグイン、MCP の状態を表示。 |
| `/new [タイトル]` | 現在のプロジェクトにセッションを作成。 |
| `/sessions` | セッションの切り替えと名前変更。 |
| `/model`、`/models` | プロバイダー別にモデルと推論レベルを選択し、現在の選択を表示。 |
| `/agents`、`/agent` | Agent を選択。 |
| `/cancel` | リクエストを停止、または名前変更を取り消し。 |
| `/language` | 英語、簡体字中国語、日本語を切り替え。 |

V2 HTTP API は LSP 状態を公開していないため、取得不可と表示します。

## メッセージの動作

- コマンドメニュー、権限承認、リアルタイム応答、状態を含むすべてのテキストは Telegram Rich Messages を使用します。ネイティブ Markdown で見出し、リスト、コード、表を保持します。新しい Telegram クライアントをご利用ください。
- 個人チャットの回答はネイティブ Rich Message ドラフトで配信し、完成した分割部分と最終回答をメッセージとして保存します。他のチャットではメッセージを編集します。表は行の間で分割し、各部分にヘッダーを繰り返します。未完成の行は次の出力を待ちます。長い単一行は約1,024文字の目安を超える場合があり、安全な長さを超えた行は内容を失わずプレーンテキストで送信します。
- 思考は「💭 思考 · 展開」のインラインボタンで同じメッセージ内で展開・折りたたみでき、展開中も更新されます。回答と状態は別に表示します。長い思考と回答は約 1,024 文字に分割し、文や段落の境界を優先して全文を保持します。ツールの要約は表示しません。
- 停止ボタンは対応するリクエストのみ停止し、生成済みの内容を保持します。取り消す際は対応する未配信の入力も削除します。準備中の取り消しで以前に紐付けたセッションを中断することはありません。リモートでの取り消しに失敗してもローカルの待機を終了します。
- プラグインの停止や再読み込みでローカルの待機を終了します。再読み込み中も OpenCode が実行中のセッションを管理します。セッションの中断には `/cancel` を使ってください。
- プロバイダーエラー時は生成済みの回答を保持し、エラーを別のメッセージで表示します。コンテキスト圧縮の進捗も独立して表示します。
- 最後にワークスペース、`provider / model(推論レベル)`、Agent、コンテキストの残りの割合、容量、所要時間（`s`/`m`/`h`）を表示します。モデル・Agent の変更、場所の移動、圧縮時に同じメッセージを更新します。圧縮後の使用量は新しい値を取得するまで不明と表示します。
- 写真と画像ファイルは一時的なセッションのフォークで処理します。権限はボタンで承認できます。音声メッセージには対応しません。
- 一時的なネットワーク障害では自動再接続します。無効な token やポーリングの競合では停止します。更新後は `/model` で古いモデルメニューを開き直してください。

モデルと Agent の選択は OpenCode セッションに属します。チャットや TUI ごとに独立した選択が必要な場合は、別のセッションを使ってください。

## 更新とアンインストール

```bash
npm exec -- opencode-tbot@latest update
npm exec -- opencode-tbot@latest uninstall
```

どちらも設定ファイルを保持します。`update` は登録を更新し、`uninstall` は登録を削除します。その他の CLI オプションは `--help` を参照してください。

## 開発と CI

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

[CI](./.github/workflows/ci.yml) は PR と `main` への push で実行します。Node 22.12.0／24 で型、単体テスト、ビルド、CLI の成果物を検証します。独立したジョブでパッケージを OpenCode `2.0.29` に読み込み、ローカルの Telegram API モックで検証します。実際の認証情報やモデルへのリクエストは不要です。

ローカルでホスト統合テストを実行するには、対応する OpenCode CLI を `PATH` に追加してください。

```bash
OPENCODE_HOST_E2E=1 pnpm exec tsx --test tests/opencode-host.integration.test.ts
```

## 診断、制限と履歴保持

プロジェクトディレクトリで `npm exec -- opencode-tbot@latest doctor` を実行すると、Node、許可 ID、書き込み権限、Telegram webhook、共有ホスト、読み込み済みの場所を読み取り専用で確認します。更新を消費せずに競合 poller を検出する API はないため、不明と表示し 409 の対処方法を案内します。

Token 設定はアトミックに置換し、POSIX のファイルは `0600`、専用ディレクトリは `0700` に制限します。Windows は現在のユーザーの継承 ACL を使用します。数値モードだけでは ACL 分離を証明できないため、共有 Windows ホストでは ACL を確認してください。

| 設定 | 初期値 |
|---|---|
| `telegram.botToken` | 必須 |
| `telegram.allowedChatIds` | `[]`（すべて拒否） |
| `telegram.apiRoot` | `https://api.telegram.org` |
| `state.path` | `./data/opencode-tbot.state.json`、ワークツリー相対 |
| `prompt.waitTimeoutMs` | `1800000` |
| `prompt.pollRequestTimeoutMs` | `15000` |
| `prompt.recoveryInactivityTimeoutMs` | `120000` |
| `tokens.showBreakdown` | `false` |
| `logging.level` | `info` |
| `logging.sinks.host`, `logging.sinks.file` | `true` |
| `logging.file.dir` | `~/.local/share/opencode/log/plugins/opencode-tbot/` |
| `logging.file.retention.maxFiles` | `30` |
| `logging.file.retention.maxTotalBytes` | `314572800` |

準備の期限は 60 秒、ダウンロードの合計タイムアウトは 30 秒、実際に読み込む上限は 20 MiB です。Stop は準備にも適用され、遅れて届いた結果でチャットを再設定しません。一時セッション削除の期限は独立した 5 秒です。失敗時は記録した session ID を OpenCode で削除してください。タイムスタンプ保存失敗は警告に留め、完成した回答を保持します。不正な状態や未知のバージョンは元のファイルを保持してエラーにします。

思考履歴は 30 日、最大 2,000 ファイル / 32 MiB で、書き込み時に最大 1 分に 1 回整理します。承認履歴は 30 日、最大 1,000 件で、期限切れの保留ボタンも無効です。即時整理するにはプラグインを停止し、ワークツリーで `npm exec -- opencode-tbot@latest prune` を実行して再起動します。復旧や移行の前に状態をバックアップしてください。

公開前は `pnpm lint`、`pnpm verify:package`、`pnpm verify:release`（クリーンなコミット、一致するバージョン tag と CHANGELOG が必要）を使用します。公開後は `node scripts/verify-package.mjs --registry <version>` で npm パッケージを検証します。`main` には未公開の変更があり得ます。公開済みバージョンは `package.json` と release tag で確認してください。デスクトップの手動検証は `pnpm exec tsx tests/telegram-desktop.manual.ts` で、許可済みチャットと制御した provider イベントだけを使用します。

[最適化と検証結果（2026-10-20）](docs/validation/2026-10-20-optimizations/README.md)
