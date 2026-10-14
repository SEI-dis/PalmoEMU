# Celio通信の互換確認

確認日: 2026-10-08。tests/link.cjsが生成する自作GBAプログラムで検査しました。

## 実装

src/link/room-link.jsは、liru55/mgba-celio-webのMPL-2.0通信コードを移植したものです。
部屋作成・参加、Engine.IO 4 / Socket.IOイベント、32ワードのシリアルパケット、順序番号・ACK、状態・コマンドを合わせています。
既存の64MiB対応コアへCelioDeviceを接続し、コアのバイナリやステート形式は変更していません。

UIの通常操作では接続しません。「部屋を作る」「参加」で、相手の版と同じ
celio-server.up.railway.appへWSS接続します。部屋番号は4桁で、パスワード認証はありません。

## 確認した組み合わせ

| 対象 | 固定版 |
| --- | --- |
| このWeb版のコア | onikoro334274-cell/mGBA_celio_edition 0ba86121bd92aa570d38301086d8e8f584238d62 |
| 移植元の通信コード | liru55/mgba-celio-web 58d463ebe2302e4fc70098760dcfc84ca69329db / web/link-session.js |
| 比較用の公開版 | liru55/mgba-celio-web gh-pages eb441dc2e4ddec951c70c413599ab2a0e77a739b |
| ローカル検査用サーバー | Celio-Link/Celio-Server d19ad22a0c6a11467c9234c6cacd291eb0f15dbd |

比較用ファイルは改変せず使用しました。配布アプリには比較用WASMを同梱しません。

| ファイル | SHA-256 |
| --- | --- |
| 公開版 mgba.js | f15e0fde3c66253ff3c0dc9d216710f5676dc90fdd13e5c8560a99e48d7ae810 |
| 公開版 mgba.wasm | 3f5cb4f061b29ed7dedbc4dab4c94cc55a6353fe71980963f782cd17ea612c59 |
| 公開版 link-session.js | 063e1a11aeee3ed43e5a3178f206920e8388c8c3c6a22f024daddc7980ad3d65 |

## 検査範囲

room-link.cjsとprivacy.cjsはWindows上のEdge・WebKitの両方で合格しました。
save-safety.cjsで、端末内バックアップ・正常終了時の保存・中断時の復旧・容量不足時の拒否も確認しました。

- この版が部屋を作り、公開版のコア・通信処理が参加する組み合わせ。
- 公開版側が部屋を作り、この版が参加する組み合わせ。
- 各GBA CPUがSIO経由で相手の値を受け取り、相手の色を描くこと。
- 2つの独立したブラウザ保存領域で、部屋番号UIから接続すること。
- 通信中は1倍速で、自動保存が通信前のバックアップを上書きしないこと。
- 接続を切ると通信前のCPUレジスタ・セーブ・画面を戻し、元の速度設定へ戻ること。
- 正常終了コマンドとサーバーのsessionCloseを受けた場合だけ、正常終了として扱うこと。
- バックアップの保存に失敗した場合は開始せず、破損した保存データを復元しないこと。
- 通信画面の表示・番号入力・通常プレイで自動接続しないこと。
- 送信イベント・サイズ・32ワードの形式を限定し、ユーザーファイル名などを含めないこと。

検査用のローカルサーバーは、固定版のClient・SessionManager・Sessionをそのまま使い、待ち受けを127.0.0.1の一時ポートに限定しています。
公開中継サーバーでも自作プログラムによる相互接続を確認しました。公開サービスの将来の稼働や仕様は管理できません。

実際のゲームでの交換・対戦の完了、異なるゲーム・改造版同士の互換、Windows版・iOSアプリ版・実機との接続は未検証です。
モバイル端末の実機検査は未実施です。PC版WebKitの結果だけで実機対応を保証しません。

## 再検査

Playwrightを開発用環境に用意します。ブラウザにはEdge/ChromiumまたはWebKitを使います。
検査用の依存ファイルはGit管理外のwork以下へ置きます。

1. sources/celio-server-source.tar.gzをwork/celio-serverへ展開し、その中で `npm ci --ignore-scripts --no-audit --no-fund` を実行します。
2. 同フォルダーで `node_modules/.bin/esbuild src/client.ts src/sessionManager.ts --bundle --packages=external --format=esm --platform=node --outdir=test-built` を実行します。Windowsでは `.cmd` を使用できます。
3. 比較用固定版のmgba.js・mgba.wasm・link-session.jsをGitHubの上記コミットからwork/celio-referenceへ取得し、上記ハッシュと照合します。ROM・セーブを取得する必要はありません。
4. CELIO_SERVER_ROOTとCELIO_REFERENCE_ROOTをそれぞれの絶対パスに設定し、`node web/tests/room-link.cjs` を実行します。PLAYWRIGHT_MODULEには必要ならPlaywrightのインストール先を設定します。WebKitはBROWSER_ENGINE=webkitを設定します。
5. `node web/tests/privacy.cjs` と `node web/tests/save-safety.cjs` も実行します。save-safetyはローカル開発サーバーを起動しておきます。

room-link.cjsのWebSocket転送はテスト専用のNodeプロセス内で行います。製品にプロキシAPIやアップロードAPIを追加するものではありません。

## 0.3.5: 端末内2台・USB実機（2026-10-09）

同じ固定版のlink-session.jsとcelio-serial.jsを参照し、通信制御をdirect-link.jsへ分離しました。
2台は独立したWASMメモリを持ち、1つの描画時計で同数のフレームを実行します。
表示・入力・音声は選択中のプレイヤーへ切り替え、通信中は1倍速です。2Pには同じROMを使います。

1Pは既存の保存先、2PはゲームIDに紐づく専用の保存先を使います。開始前の1Pバックアップを保持し、
ゲーム側の両方の終了通知後に2台分のセーブと復旧状態を1つのIndexedDBトランザクションで保存します。
片方の保存セッションが不一致なら全体を拒否します。中止時は1Pを元へ戻し、既存の2Pセーブを変更しません。
2Pセーブは前回分・ファイル・最初からを選べ、通信中に2P分をエクスポートできます。

USBはユーザー操作からWeb Serialの機器選択を開き、115200bpsのCelioフレーム（GBヘッダー、チャネル、長さ、最大64バイト）を扱います。
Celio対応変換器と実機通信ケーブルが必要です。通常のUSBケーブルだけで実機を認識する機能ではありません。USB切断・中止で戻せるのはブラウザ側だけで、実機のセーブは復元できません。
PCの対応Chrome / Edge用です。APIのないブラウザでは接続ボタンを無効化します。iPhone Safariは非対応です。
端末内・USBの両モードは中継サーバーへ接続せず、ROM・セーブを送信しません。

`tests/direct-link.cjs` はEdgeおよびPC版WebKitで次を検証しています。

- 自作GBAプログラム2個が実際のWASM CPUからCelioパケットを交換し、相手の色を受信。
- 同じ時計によるフレーム進行、フローティングUIでの1P／2P切り替え。
- 通信中止による復旧、双方終了通知からの2人分の保存、片側セッション不一致時の全体拒否。
- 模擬USBストリームでの分割パケット結合、ワードのバイト順、抜線による終了処理。
- USB非対応の表示、機器選択のキャンセル。テストは実際のUSB機器を開きません。

iPhone/Android実機での端末内通信性能、Celio実機アダプター、実ゲームの交換・対戦は未検証です。
端末内2台はCPU・メモリの負荷が増えます。既存の部屋番号方式も引き続き使用できます。

## 0.3.15: 新しいCelioサーバー（2026-10-12）

Celio-Server 8f509bdcf2a8383b936e0f2f31b2f6553ae421ceではdeviceDataが配列になり、
コマンド・セッションイベントにもACKが必要です。ACK付きモードコマンドから新形式へ切り替えます。
旧d19ad22a形式にACKを追加するとRxJSの引数が変わるため、旧形式への送信は従来どおりです。

- 新形式の送信は同じ実行ターンで最大32パケットにまとめ、64イベントまで並行送信。未確認分も含めて1024パケット／状態通知まで。
- 最大1024パケットの受信を一括検査。番号で順序を戻し、再送されたデータ／コマンドは一度だけ実行し、ACKは再度返す。
- 新形式のデータと状態通知は同じ番号／UUIDで最大6回送信。拒否・応答待ち上限・待ち行列上限・切断では中止して通信前へ戻す。
- sessionClose／partnerLeftにもソケットを閉じる前にACKを返す。ゲーム側の正常終了がある場合だけ結果を保持。

`prepare-link-tests.py` は旧版に加え、GPL全文付きの新固定版をwork/celio-server-modernへ展開・ビルドします。
`room-link.cjs` が両方を順に起動し、Chromium（Edge）・PC版WebKitで実際のWASM CPU間のデータ交換、
旧上流Web実装との双方の役割、1倍速・バックアップ・切断復旧・正常終了を確認しました。
新サーバー試験では両方向のACKを意図的に捨て、再送してもゲームを再初期化しないことを確認しています。
同時に `room-protocol.cjs` で順序逆転・重複・不正／巨大データ・負のACK・タイムアウト・上限と終了後の送信停止を検査します。

相互接続対象の上流Web固定版は旧形式です。新サーバーで未対応の旧クライアントまで動かせるわけではありません。
中継URLが同じでも、相手側の実装・ゲームが対応する必要があります。新形式の試験はローカル中継だけを使用し、
公開サーバーのデプロイ版、実機iPhone、実ゲームでの交換・対戦の完了は未確認です。人数は2人のままです。
