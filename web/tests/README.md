# 検証の案内

テストは自作のROM・セーブ・画像や固定した公開テスト用コードを使います。利用者のROM・セーブを成果物へ含めません。ブラウザ検証は通常利用のプロファイルとは分けます。

| 対象 | 主な検証 |
| --- | --- |
| モジュール・Workerの共通処理 | `module-links.cjs`、`worker-task.cjs` |
| コア・互換性 | `core.cjs`、`multicore.cjs`、`mgba-compatibility.cjs`、`nds-core.cjs` |
| セーブ・失敗時の保護 | `save-safety.cjs`、`save-worker.cjs`、`save-worker-fence.cjs`、`storage-protection.cjs` |
| セーブ変換の更新 | `start-save-component.cjs`、`start-save-migration.cjs`、`start-save-compatibility.cjs`、`start-rom-profile.cjs`、`start-save-ui.cjs` |
| ROM追加・更新・退避 | `rom-import.cjs`、`rom-zip.cjs`、`rom-update.cjs`、`backup.cjs`、`state-transfer.cjs` |
| PokemonStart更新通知・ROM互換性 | `start-updates.cjs`、`start-updates-browser.cjs`、`start-save-update-range.cjs`。固定メタデータだけを用い、ネット上のROM・PKSを取得しない |
| 起動中の操作保護 | `launch-controls.cjs`。ロード/セーブ検査の待機中のタッチ・ショートカット・自動保存、起動失敗後の復帰と既存セーブ保持 |
| スキン・画面・入力 | `skin-compatibility.cjs`、`responsive-skins.cjs`、`input-controls.cjs`、`touch-recovery.cjs` |
| 撮影・描画・音声 | `camera.cjs`、`recording-ui.cjs`、`runtime-performance.cjs`、`time-stretch.cjs` |
| 通信 | `room-link.cjs`、`direct-link.cjs`、`gb-local-link.cjs` |
| 更新・言語・プライバシー | `update.cjs`、`languages-offline.cjs`、`diagnostics.cjs`、`privacy.cjs` |
| 更新ファイルの再利用・容量不足 | `update-delta.cjs`、`update-download.cjs`、`update-safety.cjs`、`update-recovery.cjs`。隔離Cache Storage・合成資産を使用し、旧版移行、本文検証、取得失敗と再試行、更新待ち中の追加資産、自然な切替、容量不足後の回復とセーブ保持を確認する |
| 配布内容・対応ソース | `audit-content.py` と `../scripts/check-release.cjs` |

コマンドと環境変数の詳細は[開発README](../README.md)を参照してください。各テストの既存ファイル名・npmコマンドを入口として維持し、用途別の案内をここへ集めています。全対象の一覧はリポジトリのルートから `node web/scripts/test-all.cjs --list` で確認できます。

共通処理だけを確認する例:

```sh
node web/tests/module-links.cjs
node web/tests/worker-task.cjs
node web/scripts/check-modules.cjs
```

ブラウザ検証では `PLAYWRIGHT_MODULE`、`BROWSER_ENGINE`、`TEST_URL` を必要に応じて指定します。WebKitは `BROWSER_ENGINE=webkit` で実行します。自前でサーバーを用意するテストもあるため、対象のREADME説明とファイル先頭の設定を確認してください。

全件検証は通信の固定依存物を用意してから、次を実行します。

```sh
node web/scripts/test-all.cjs --serve
node web/scripts/test-all.cjs --serve --webkit
```

通信テストの準備は `python -B -X utf8 web/scripts/prepare-link-tests.py` と、出力される環境変数を使用します。テストは端末内の模擬中継へ接続します。

CIは両エンジンの検証を分割して実行します。結果は無視対象の `web/test-results/` に保存し、公開物へ含めません。PC版WebKitの合格は、iPhone実機の操作・速度・OSメニューまで保証するものではありません。


公開前UX整理の回帰検査：`storage-catalog`（原本を読み込まない一覧、旧記録補完・変更検出、索引との原子性）、`backup-lifecycle`（画面終了時のplan解放と復元完了）、`file-export`（ユーザー操作下の保存/共有、キャンセル、ダウンロード開始、URL解放）、`ux-review`（複数取り込みの継続・明示操作でのROM選択・カバー縮小・実際のスキン選択）、`offline-selection`（必要資産だけの保存と配信元停止後のSW応答）、`ux-layout`（9言語の保存/復元/書き出し/ROM操作/インポート/オフライン表示、タブの先頭復帰）。各検査は隔離した合成データを使用し、通常のChromiumとWebKit選択に登録する。`ux-layout`はOS保存/共有とオフライン通信を合成し、その他の画面と保存復元導線は実アプリを使う。

カバーの調整は `covers.cjs` でローカル画像の移動/拡大、保存画素、取消・失敗・遅延decode、矢印フォーカス、合成二指操作、ROM/セーブ/履歴の不変を確認します。

ROM選択のキャンセルは `rom-update.cjs` で空選択と入力要素からのbubbling cancelを検査し、シートと入力DOMの保持、保存データ不変、再選択成功を確認します。headlessのDOMイベント再現であり、OSネイティブのファイル選択ダイアログの実操作とは区別します。


PokemonStart L形式は `start-save-format.cjs` が独立生成した両スロット計3000枠・非ボックス領域・RTC・破損・カウンター・取消を検査します。`start-save-format-host.cjs` は従来変換との連結、0.38.1補正、1MiB容器、混在/逆戻り拒否、進捗を検査します。`start-save-format-browser.cjs` は合成ROMで更新画面→Worker→保存トランザクション→バックアップの不変を両ブラウザで検査し、ゲーム本体は実行しません。`start-save-format-component.cjs` は出典・契約・ハッシュの不整合を拒否します。
