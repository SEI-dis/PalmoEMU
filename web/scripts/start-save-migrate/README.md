# セーブ変換ツールの更新

くりーぱーさんから届く変換ツールと、PalmoEMUの保存保護を分けて管理します。通常の更新対象は `web/vendor/start-save-migrate/` にまとめています。ゲームの更新だけで変換ツールの定義を書き換えたり、未確認の互換性を追加したりしないでください。

## ファイルの役割

| 場所 | 役割 |
| --- | --- |
| `web/vendor/start-save-migrate/engine.js` | 提供コードから抽出した変換処理。編集機能・素材・通信処理は含めない |
| 同 `manifest.js` | 提供された対応版・変換先・保存形式の定義。版番号の取得元 |
| 同 `README.md` | 作者、出典、提供物のハッシュ、許諾の記録、抽出時の変更点 |
| 同 `component.json` | 提供物・抽出ファイルのハッシュ、ツール版と変換先、対応するホスト側の形式 |
| `web/src/start-save/provider.js` | 提供エンジンのAPIを取り込む唯一のアプリ側入口 |
| 同 `definition.js`・`contract.js` | 定義の読込みと、PalmoEMUが扱える保存形式の検査 |
| 同 `migration.js` | 入力制限、原本のコピー、保存版の照合、中断、変換後の検査 |
| 同 `rom-profile.js`・`compatibility.js`・`version.js` | ROMの最低対応セーブ版の読取り、変換要否、版の表記 |
| 同 `client.js`・`worker.js` | Workerの呼出し、保存元の変更検知、結果の受け渡し |
| `web/src/library/rom-update.js`・`web/src/storage/storage.js` | ROM更新と既存の原子的保存・バックアップ処理 |
| `web/src/views/start-save-migrate.js` | 変換画面。提供エンジンを直接操作しない |

ファイル名の変換先、変換結果の版の照合、対応版一覧は `manifest.js` から取得します。保存先のキーやデータベース構造は更新対象にしません。ROMの最低対応版と変換ツールの出力版は別の情報です。古いROM向けの確認済み互換性範囲を、ツールの最新版に合わせて自動的に広げないでください。

## 新しい提供物を受け取ったら

以下のコマンドはリポジトリのルートで実行します。候補はGit管理外の `work/start-save-candidate/` などで準備し、使用中の4ファイルへ直接上書きしません。

1. 提供されたHTML／ソースZIPと作者・許諾を確認し、元のファイルのSHA-256を記録します。原本は公開フォルダーへ置きません。ROM・セーブ・素材・検査用の個人データも同梱しません。
2. 提供元のソースと現在の `engine.js`・`manifest.js` を比較し、変換に必要な部分を候補へ抽出します。元のブラウザアプリ全体や編集機能を移植しないでください。既存の旧バンク検証など、READMEに記録したローカル修正が必要かを確認します。HTML／ZIPの構成が変わる可能性があるため、この抽出と意味の確認は自動化していません。
3. 候補の `README.md` と `component.json` を更新します。現在のJSONをひな型にし、`toolVersion`・`outputVersion` を提供元の定義に合わせ、`sources` は受け取った原本、`files` は抽出後の各ファイルのSHA-256とします。PowerShellでは `Get-FileHash -Algorithm SHA256 -LiteralPath <ファイル>` で取得できます（JSONは小文字の16進数）。新しいライセンス原文が付いた場合は保持し、適用範囲を確認して `LICENSE` のハッシュも登録します。
4. 下記の候補検査で、必要なAPI、版の順序、保存形式、ファイルの一致を確認します。差分には対応版の追加・削除、出力版、変更ファイル、出典情報の変更が出ます。候補のJavaScriptを実行せず、インストール先も書き換えません。

```sh
node web/scripts/start-save-migrate/check.mjs
node web/scripts/start-save-migrate/check.mjs work/start-save-candidate
git diff --no-index -- web/vendor/start-save-migrate work/start-save-candidate
```

`git diff --no-index` は差分があると終了コード1になります。検査成功は、動作・互換性・公開許諾の承認ではありません。ハッシュを更新するだけでレビューを省略しないでください。

5. 差分をレビューしてから、候補のファイルを `web/vendor/start-save-migrate/` へ反映します。APIが変わった場合は `provider.js` で差異を吸収できるか確認します。保存レイアウト・容量・暗号化・版変数が変わる場合、`contract.js` が拒否するので、保存保護と合成データのテストを先に対応させます。版番号だけを理由に制限を緩めないでください。
6. 以下の回帰検査を行います。変換の各段階、両スロット、選択外スロット、RTC、原本不変、破損拒否、中断、更新前バックアップ、保存先の競合・ロールバックを確認します。追加の版や変換処理には、実際の差分に対応する検査を追加してください。既存の0.42.3を期待するテストは過去の回帰データであり、一括置換しません。

```sh
node web/tests/start-save-component.cjs
node web/tests/start-save-migration.cjs
node web/tests/start-save-compatibility.cjs
node web/tests/start-rom-profile.cjs
node web/scripts/check-modules.cjs
```

別途検証サーバーを起動し、隔離ChromiumとPC版WebKitの両方で `web/tests/start-save-ui.cjs`・`web/tests/start-save-update-range.cjs` を実行します。ブラウザの準備と `TEST_URL`・`BROWSER_ENGINE` の指定は [開発用のテスト](../../README.md#開発用のテスト) を参照してください。利用者のROMやセーブで自動検査しません。

7. 作者・許諾や配布物が変われば通知と監査記録も更新し、[公開手順](../../../deployment/README.md)に従ってバージョン・変更通知、オフラインマニフェスト、対応ソース、配布一覧とレビュー記録を更新します。同じコミットの公開前CI成功後に公開します。`check-release.cjs` でもコンポーネント検査を必須にしています。

現在の提供エンジンは1.0.8、対応定義は0.48.0までです。新版の技・持ち物の上限検査を修正しました。PalmoEMUでは、実際のROMが受け入れる範囲内で、再開補正まで確認できた定義を中間出力に選びます（現在は最大0.42.5）。定義に版番号が増えただけでは出力の上限を広げず、以降のゲーム内更新をROMに任せます。互換な新版セーブは変換せず保持し、古い版への変換は拒否します。新しい版を入れても、未知のゲーム側の保存構造・イベント・テーブルとの完全な互換性を保証するものではありません。
