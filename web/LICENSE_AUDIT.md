# Web版の公開に向けた確認記録 — 2026-10-13

**現在の許諾確認（2026-10-16）：追加範囲と公開候補の技術検証を確認済み。** 管理者は改変・オフライン配布・GitHub/ZIPでの改変ソース公開を説明された後、「クレジットに記載してたらOKって」と回答し、開発者は既に記載済みと補足した。既存のPokemonStart開発者/プロジェクトへのクレジットを条件として維持する。作者本人のメッセージを独立閲覧したとは主張せず、標準ライセンスや一般的な第三者再利用条件も推定しない。下記の未確認・未公開記録は当時の履歴で、今回の回答をcomponent.json/README/SOURCESへ反映した。検証範囲はRELEASE_VALIDATION.mdを参照。公開は同じコミットのCI成功後に行う。

対象はこの `web/`、検査CIとGitHub Pages用テンプレート、PalmoEMUの公開対象Git履歴です。
ManicEMUの元のiOSリポジトリ全体やその履歴は取り込んでいません。
配布ファイルの一覧とハッシュは RELEASE_CONTENT.json、確認結果は RELEASE_REVIEW.json に記録しています。
これはコード・配布物の確認であり、あらゆる国の法的紛争が絶対に起きないという保証ではありません。

## 本家UIの移植とAGPL

本家のメニュー・設定のコードは、AGPLの条件に従って利用できます。クレジットだけでは足りません。
AGPL 4・5・6・13条に合わせ、著作権・無保証・ライセンス表示、変更日と変更内容、
改変後の編集可能なソース、対応コアのソース・ビルド手順を同じサイトから無料で取得できるようにしています。
設定→「クレジット・ライセンス」から取得できます。改変WebコードはAGPL-3.0-or-laterで提供します。
購入制限、秘密保持、改変禁止などAGPLに追加の制限を課しません。

ライセンス画面にはManicEMU本家、mGBA本家、64MiBフォーク、Web接続部、各コア、
通信処理、PDF.jsなどの作者・プロジェクト名とGitHubリンクを明示しています。
採用した固定版へのリンクと、同じサイトから取得できる対応ソースを掲載しています。
作者のGitHubページへのリンクだけを、通知保持や対応ソース提供の代替とは扱いません。

ManicEMUのゲームメニュー、手動／自動ステート一覧、編集→削除確認、一般／詳細／サポート／その他の
設定構成を移植しました。移植元の正確なSwiftファイルは sources/manicemu-ui/ に残しています。
ゲームメニューの項目順と上部ショートカットは GameOption / GameOptionsView、共通の行と
ナビゲーションは ASListPage / ASListItemView / ASNavigationView に基づいています。
これらの原本は固定コミットの内容と一致し、個別の著作権表示を保持しています。
UIKitをブラウザ用DOMへ、RealmをIndexedDBへ置き換え、Web版では購入機能やiCloud連携などを省きました。

## 以前の確認事項と対応

| 項目 | 今回の処置 | 証拠 |
| --- | --- | --- |
| 既成WASMと対応ソースが不明確 | FC/SFC/MDを固定バージョンのソースとWeb用のlibretro接続部からビルド。mGBAを含め同梱するソースだけで再ビルドし、JS/WASM全8ファイルのSHA-256一致を確認 | sources/build-evidence.json、各BUILD.md |
| 非商用コアとGPLコードとの組み合わせ | Snes9xとGenesis Plus GXを配布から除外。SFCはMesen-S、MDはClownMDEmuに置換。EmulatorJS・RetroArchフロントエンドも除外 | SOURCES.json、licenses/、ソースアーカイブ |
| 本家画像・ロゴ等の権利 | メニュー・設定のAGPLコードは保持し、アプリロゴ・ゲーム機ロゴを配布しない。ManicEMU標準スキンのみ、下記CC BY 4.0の個別確認に従って同梱。標準スキン4色と幾何学アイコンは新規作成。フォントはOS標準のみ | src/skins/skin-art.js、src/skins/skins.js、src/shared.js、assets/、NOTICES.md |
| 元ソースに含まれる画像・フォント・テストROM | Webビルドの依存ファイルと必要なビルド定義、ライセンスだけを選別。アーカイブ内部までROM形式・署名・危険パス・未登録変更を検査 | scripts/audit-content.py、RELEASE_CONTENT.json |

## コア・依存物の扱い

- mGBAとWeb bridge: MPL-2.0のファイル単位ソース公開・通知を維持。inihとEmscriptenの通知も同梱。
  MPL第3.3条によるAGPLとの組み合わせの扱いを MPL_SECONDARY_LICENSE.md に明記し、
  改変した room-link.js にも両方の許諾を表示。改変部分のMPL許諾も維持します。
- FCEUmm: GPL-2.0-or-laterからGPL-3.0を選択。Mesen-S: GPL-3.0-or-later。
  LGPL-2.1-or-laterの音声・フィルター部分はLGPL 3条に従いGPL-3.0との構成に使用。
  改変して再ビルドできる対応ソースを提供。ClownMDEmu: AGPL-3.0。
- GPLv3/AGPLv3はそれぞれ13条の結合規定に従い、GPL部分の元の通知を消さず提供。
  Mesen-S内部にあるRetroArch由来のGPLフィルターも、その通知を維持。
- BSD/MIT/zlib/Apache/LLVM exception等は licenses/ と元ソースコメントに全文・帰属を保持。
  PDF.jsのApacheライセンスに基づくブラウザ用ファイル、固定バージョン情報、ライブラリソースを提供。
  コアやPDF.jsの更新時はこの確認をやり直す必要があります。

## スキン・ROM・通信

Deltaのファイル形式を読む機能と、他人のスキンを再配布する権利は別です。
同梱は `BUNDLED_SKINS.json` に記録したCC BY 4.0の7件のみです。その他は同梱・プロキシ配布せず、利用者が選んだローカルファイルのみ端末で処理します。
作者ごとの利用条件が適用され、公式サイトで紹介されていても、再配布が許可されているとは限りません。
ゲームROM、実機から抽出したBIOS、利用者のセーブ、ゲーム画像、チートコード集は同梱しません。
FreeBIOSなどのオープンソースによる代替実装は、元の許諾・著作権表示を保持して同梱します。ROMやBIOSの入手先を案内しません。
所持やローカル処理だけで、任意のROMの取得・改変・利用が必ず適法になるとは表示しません。

通信プレイを始めない通常の動作では、取得先はこのサイトのアプリファイルだけです。
ユーザーファイルのアップロードAPI、分析・広告・クラウドセーブはありません。通信プレイを明示的に開始した場合だけ、
Celio中継サーバーへ接続し、32個のシリアル通信値と接続状態を送ります。ROM・セーブファイルを
送るAPIはありませんが、IPアドレスとゲームの通信内容はサーバー側へ伝わります。
liru55のMPL-2.0通信コードの改変版と原文・ライセンス・採用リビジョンを同梱しています。
既存のAGPLアプリ・GPLデバイス処理とのライセンス表示と対応ソースは維持しています。
個々のゲームで交換・対戦ができるかどうかは、ライセンスとは別に動作確認が必要です。
保存先・通信経路・HTTP送信防止と、その限界は PRIVACY_AUDIT.md に記録しています。

## 2026-10-09の公開前検査

- ROM共有のメニュー・実処理・未対応時のROMダウンロード処理を削除。古いメニュー設定でも復活しないことを確認。
- アーカイブ内も含めてROM・BIOS・第三者スキン・認証情報の候補を検査。公開対象Git履歴と現在の登録候補も検査。
- 本家参照ファイルの著作権・ライセンス・固定ハッシュ、対応ソースZIPと現在の編集可能なコードの一致を確認。
- 開発出力を除いた配布用コピーで検査し、公開工程では記録やソースZIPを自動で承認・再生成しない構成に変更。
- UIの機能別分割後にEdge全テストと対応WebKitテストを実施。結果・限界は RELEASE_VALIDATION.md に記録。

## 一次資料

- ManicEMUの[LICENSE](https://github.com/Manic-EMU/ManicEMU/blob/fbaeab79c214d5920bb51afa6f2d786fb2b12a58/LICENSE) と同梱AGPL本文
- [MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/)、[GPL/AGPLの互換性](https://www.gnu.org/licenses/license-compatibility.en.html)
- [Mesen-S](https://github.com/libretro/Mesen-S/tree/9e4fdeb9b336470bc96beb8765b2e79c86a2da1e)、[ClownMDEmu](https://github.com/Clownacy/clownmdemu-libretro/tree/d43c2708b0a31c285ce16724b6c4a2e92af07346)
- [MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)、[文化庁：著作物の利用と許諾](https://www.bunka.go.jp/chosakuken/keiyaku_manual/1_1_1.html)
- [Delta公式スキン案内](https://faq.deltaemulator.com/using-delta/controller-skins)、[PDF.js](https://mozilla.github.io/pdf.js/getting_started/)

公開時はREADMEの手順に従い、check-releaseによる検査を行ってください。
ソースを削除した配布、別の素材・コアを追加した配布はこの確認の対象外です。

## 2026年10月9日の追加

ゲーム詳細をGameInfoView / GameInfoNavigationView / GameInfoDetailView / GameInfoCoverViewから移植し、
原本と変更通知を保持しました。NDSはlibretro/desmume2015の固定ソースをEmscripten 4.0.15で
ビルドしました。採用ファイルはGPL-2.0-or-laterと保持された許容的通知に従い、GPL-3.0を選択し、
AGPLとの結合は13条に従います。コンパイラの依存ファイルとビルド定義・通知を同梱します。
詳細は sources/nds-web/BUILD.md と sources/nds-build-evidence.json に記録します。
NDSの独立再ビルド成果物と配布JS/WASMのSHA-256を今回も比較し、一致を確認しました。
check-releaseはNDSも含め、対応ソースの固定ハッシュ・再ビルド証拠・配布バイナリを検査します。

外部カバーの検索・自動取得は、画像ごとの許諾を本プロジェクトで確認できないため公開版から除去しました。
Libretro Thumbnailsの公開リポジトリやクレジットを、個別画像の包括的な利用許諾とは扱いません。
カバー変更は端末内の画像選択と保存だけです。既存の利用者データは削除しません。
この判断は外部画像取得一般を違法と認定するものではありません。

## 選択できる追加コアと更新検査

VBA-Nextは `src/types.h` の「version 2, or ... any later version」に基づきGPL-3.0を選択します。
音声部分のLGPL-2.1-or-later、libretro-commonの許容的ライセンスと個別著作権表示も残します。
melonDSはGPL-3.0-or-laterで、FreeBIOSのBSD-2-Clause全文とGilead Kutnickの著作権表記を
Webページから参照できます。AGPLのWebアダプタとの結合はGPL/AGPL第13条に従います。

jgenesisはREADMEとLICENSEに基づくGPL-3.0です。AGPLのWebラッパーを追加し、即時セーブ出力用の
変更をソース内に明記しました。依存クレートのライセンスを一覧化し、MIT・Apache-2.0・BSD・Zlib・
Unicode等の通知とソースを同梱します。選択可能な代替ライセンスは原文を維持します。
対象ファイルには非商用限定のコアを採用していません。PicoDriveはその条件のため除外しました。
デスクトップUI・素材・テスト用バイナリは配布せず、未使用の32X内蔵ファームウェア参照を除去しました。
Webラッパーが生成するMD構成は本体単体だけです。Sega CD・32X・SFCの外部コプロセッサROMは同梱しません。

追加コアのソースは `alternate-c-cores-source.tar.gz` と `jgenesis-web-source.tar.gz`、ビルド手順は
`sources/alternate-web/BUILD.md`、依存一覧は同ディレクトリの `DEPENDENCIES.json` です。
公開判定では `sources/alternate-build-evidence.json` と配布バイナリ・アーカイブのハッシュを照合します。
ソースを取得できるリンクは `licenses.html` に常設し、変更版でも維持します。

64MBコアの更新検査は固定コミットから候補を作り、ソースの変更一覧・ビルド・保存互換性を確認します。
人によるライセンス確認と配布レビューを省略せず、Actionsの成果物は検査レポートだけに限定します。
新しい作者ソースや未審査のWASMを、自動で公開することはありません。

## 公開後の再確認 — 2026-10-09

### UIと構成

| 確認範囲 | 移植元・結果 |
| --- | --- |
| ライブラリ・下部タブ | GameListView / GamesNavigationView / HomeTabBar。機種別の一覧、検索、選択したタブのラベル表示を保持。ゲーム機のロゴは文字、アイコンは独自ベクターに置換 |
| ゲーム詳細・プレイ中メニュー | GameInfoView / GameInfoNavigationView / GameInfoDetailView / GameOptionsView / GameOption。詳細から明示的にプレイ、固定ヘッダー、グループと順序、ショートカットを確認 |
| ステート・復旧 | SaveStateListView。手動／自動、サムネイル、続ける、編集後の削除確認を確認。追記保存と自動復旧の保護はWeb版の安全策として維持 |
| 設定 | SettingsListView / SettingItem。「このWeb版について」を本家と同じ「その他」へ移動。購入・iCloud・ネイティブ専用項目は省略 |
| インポート | ImportServiceListView / ImportFileCollectionViewCell。独自の大きな導入カードを本家のファイル選択カードへ置換。クラウド・LAN・URLダウンロードは省略 |
| スキン・ボタン配置 | SkinSettingsView / FlexSkinSettingViewController / FlexItemView。プレビュー、ゲーム別スキン、画面／ボタンの編集を確認。標準の絵・幾何学アイコン、画面比率の維持と配置補助はWeb用 |
| 共通部品 | ASListPage / ASListItemView / ASNavigationView。行生成を src/components/rows.js に集約。既存DOM・エスケープ・入力操作を保持 |

参照Swiftは24ファイルすべて、固定コミットのGitオブジェクトとバイト単位で一致しました。
これは画面構成と操作のソース移植であり、UIKit自体の実行や全機能・全寸法の一致を意味しません。
Web版では音量・映像・入力設定は全ゲーム共通、スキン・配置・コア選択はゲーム別です。
この差は現在の設定モデルによるもので、ライセンスが移植を禁じているためではありません。
端末内保存、復旧、PWA更新、ブラウザの入力・音声・ファイル選択は引き続きWeb用の実装です。

### 各依存物の再確認

| 対象 | 確認した条件と配布上の処置 |
| --- | --- |
| ManicEMU | 原本の著作権・AGPL表示、変更通知、編集可能なWebソースとビルド手順、画面からのソース取得導線を保持 |
| mGBA / rom64 / Web接続部 | MPL原文と対応ソースを保持。第3.3条の追加許諾を明示。Exhibit Bを適用するソースヘッダーは検出されず、ライセンス本文中の雛形とは区別 |
| FCEUmm / DeSmuME 2015 / VBA-Next | GPL-2.0-or-laterの許諾を確認し、この構成ではGPL-3.0を選択。原文・作者・個別通知・対応ソースを保持 |
| Mesen-S / melonDS | GPLv3系の許諾と依存物通知を保持。MesenのLGPL部分の取り扱い、melonDSのBSD-2-Clause FreeBIOSの通知を確認 |
| ClownMDEmu | AGPL全文、コアとサブモジュールの固定版・作者通知・対応ソースを保持 |
| jgenesis | GPL-3.0の原文と改変通知を保持。依存一覧129項目の許諾種別、同梱ソースと通知を照合。MIT等の選択可能な許諾を維持 |
| Celio通信 | GPLデバイス処理とMPL通信処理を別ファイルで維持。後者の改変もMPLで提供し、組み合わせの追加許諾を明記。サーバー参照ソースと固定版を保持 |
| PDF.js / inih / ツールチェーン | Apache-2.0、BSD、MIT/NCSA、LLVM例外等の作者・全文・個別通知を保持。PDF.jsは同梱した固定版を使用 |
| 素材・利用者ファイル | 配布許諾を未確認のスキン、ゲーム画像、ゲームROM、実機抽出BIOSを同梱しない。許諾済みスキンは下記の固定一覧に限定。利用者ファイルのアップロードAPIは作成しない |

再スキャンの「non-commercial」候補2件は、claxonのApache-2.0説明と
gbc-lcdシェーダーのUnlicense本文で、いずれも商用・非商用の両方を許す文章でした。
非商用限定のコアを再導入したものではありません。
コアのバイナリと対応ソースの固定ハッシュ・再ビルド証拠は変更せず再照合します。

MPLの判断には[MPL本文](https://www.mozilla.org/en-US/MPL/2.0/)と
[Mozillaの組み合わせガイド](https://www.mozilla.org/en-US/MPL/2.0/combining-mpl-and-gpl/)を使用しました。
修正後、UI構成・通知・対応ソース・配布一覧を再確認し、公開には該当コミットのCI成功を必要とします。


## 2026-10-09 スキン互換対応の追加確認

Delta／Manicの公開形式仕様をもとに、配置の正規化・ブラウザ描画・入力アダプターを追加しました。
新規コードはAGPL-3.0-or-laterで提供します。Apple Core Imageのソースやバイナリは使用していません。
既存のManicEMU UI帰属表示、PDF.jsのApache-2.0表示は維持しています。

Solo Plastic GBA（aphaits）、Manic標準6機種、Delta標準DSの実ファイルはローカル検証専用です。
当初の互換テスト素材は同梱しません。後からCC BY 4.0の旧公式版7件だけを別途確認して同梱しました（下記参照）。Solo Plastic・Delta DSは同梱しません。
自動テストに使用する画像・ROMは新規作成したものです。公式案内へのリンクは配布許諾の代わりになりません。
未対応の効果・操作を明示し、完全互換という表示はしません。

## mGBA 6MiBセーブ対応版（2026-10-09）

`0ba86121bd92aa570d38301086d8e8f584238d62` のコンパイル依存ファイルを再収集し、配布するソースだけから別ディレクトリで再ビルド。JS・WASMの両方が一致しました。旧版との比較で、保持済みのライセンス・著作権通知と128件のコンパイル単位の冒頭通知に変更がないことを確認しました。ソース内の追加ライセンス通知も保持しています。Qtの自動バックアップ・USB接続コード、GUI素材はこのWebコアへ組み込んでいません。

ブリッジの変更はMPL-2.0で提供します。変更理由・固定リビジョン・ビルド手順は `sources/mgba-web-port/BUILD.md`、対応ソースと再ビルド結果は `SOURCES.json` と `sources/build-evidence.json` に記録しています。

3DSはループバックの専用開発サーバーだけで有効になる実装です。静的配布物の設定は無効で、Azaharのバイナリ・ユーザーのゲーム・鍵は含みません。3DSコアを配布する場合の依存物・対応ソース監査は別途必要です。今回の静的配布物のレビューを3DSバイナリの公開承認とは扱いません。


## 2026-10-09 CC BY 4.0の同梱スキン

`Manic-EMU/ManicEMUSkins` の固定コミット
`63c04f92febba461d10ea16ef00b0f76199a5b20` にある LICENSE（CC BY 4.0）と
README、GB・GBC・GBA・NES・SNES・MD・DS標準スキンを確認しました。
これは公開ライセンスによる許諾で、作者から個別の許諾回答を得たという意味ではありません。

- 原本ダウンロードのSHA-256、作品名、使用したファイル、配布用ファイルのハッシュを
  `BUNDLED_SKINS.json` に記録。参照するPDF 91枚を描画・目視確認し、ゲーム画像や
  コンソールメーカーのロゴ、外部フォントファイルを追加しないことを確認しました。
  作者によるManic EMUの表示は保持します。商標・意匠等の権利全般を保証する監査ではありません。
- 使用PDFと原文info.json、ライセンス・帰属・READMEを元素材ZIPに収録。macOSメタデータと未使用GB画像を除外。
  CC BY原文、元README、帰属・免責、変換内容を保持。画像はPNG、配置はWeb形式に変換。
- 選択画面からクレジットへリンク。コードのAGPLとは別の素材ライセンスとして明示し、
  追加制限やDRMを設けず、公認・推奨を示唆しません。
- 新しいSystem.coreの素材を一括採用しません。特にGBA最新版は旧版とバイト列が異なり、
  今回の許諾確認を引き継いだものとして扱いません。3DS・FLEX等も対象外です。
- `check-bundled-skins.py` で一覧外・変更・欠落・ZIP内の余分なファイルを拒否。
  `SOURCES.json` とリリースレビューで確認済み一覧自体も固定します。

一次資料：[採用版のLICENSE](https://github.com/Manic-EMU/ManicEMUSkins/blob/63c04f92febba461d10ea16ef00b0f76199a5b20/LICENSE)、
[CC BY 4.0の条件](https://creativecommons.org/licenses/by/4.0/deed.ja)。
配布元と素材の詳細は [素材の記録](sources/manic-skins/README.md) を参照してください。

## 0.3.15: 上流更新の反映（2026-10-12）

Celio-Serverの固定版8f509bdcのソース一式とGPL全文を検査し、テスト用ソースとして同梱します。
サーバーコードやnpm依存物をWeb実行物へ組み込む変更ではありません。room-link.jsの既存の
MPL-2.0通知、MPL 3.3によるAGPL-3.0-or-laterの提供、移植元ソースを維持し、変更日を追加しました。

FCEUmmは既存のGPL-2.0-or-laterのCファイル1件へ上流Mapper 176修正をバックポート。
元の権利通知は不変で、変更通知を追加しています。ステートの保存フィールド、依存関係、
残りのソースは変更していません。修正を含む対応ソースから独立再ビルドし、JS/WASMが一致しました。
修正版ソース・ビルド手順・ハッシュ・旧版との互換検査を同じ配布に揃えています。
新しいユーザー素材・ROM・ゲーム画像・BIOSは配布しません。詳細はUPSTREAM_REVIEW.mdとNOTICES.mdを参照してください。


## 0.3.16: 日本語の変更案内とタッチ操作（2026-10-12）

notices.htmlは日本語の要約として新規作成し、NOTICES.mdの原文・著作権表示・ライセンス全文・対応ソースへのリンクを維持します。原文の削除や非公式の翻訳への置き換えは行っていません。クレジット画面と履歴は同じrelease-notes.jsonから生成し、版の一致と生成結果を公開時に確認します。

追加するHTML・CSS・生成スクリプトと変更した検査はAGPL-3.0-or-later。新しい依存ライブラリ・第三者素材・コアはありません。Android向け対策はプレイ中だけのCSSによるスクロール伝播抑止で、ROM・セーブ・通信先・データ送信条件に変更はありません。対応ソースZIPと配布一覧へ新規ファイルを含めます。


## 0.3.17: 表示言語と構成整理（2026-10-12）

翻訳処理・英訳・共通部品・検査はAGPL-3.0-or-laterで新規作成。ManicEMU由来の画面をviewsへ、共通行をcomponentsへ移し、著作権者名と元のライセンス表示を保持しました。既存のGPL・MPLモジュールでは表示用の文言を翻訳関数へ渡す変更だけを行い、元のヘッダーと追加の提供条件を維持します。

英語化するのはアプリ側の説明と要約です。原ライセンス本文・著作権表示・原文へのリンクは残しています。新たな第三者ライブラリ、素材、コアバイナリ、通信先は加えていません。言語選択は端末のlocalStorageのみで、ROMやセーブの保存形式・保存キーは変更しません。対応ソース・移植対応表・配布記録にも移動先と新規ファイルを含めます。
## 0.3.18: 追加言語

中国語（簡体字・繁体字）・韓国語・スペイン語・フランス語・ドイツ語・ポルトガル語のアプリ文言を追加。元のライセンス全文・著作権者・URL・対応ソースは保持し、クレジットと変更通知の説明・要約を各言語で表示します。翻訳補助の経緯と範囲は`LOCALIZATION_REVIEW.md`に記録しています。翻訳用モデル・実行プログラムは開発用で、配布物・対応ソースZIPに含めません。新しい実行時ライブラリ、素材、コア、通信先は追加していません。

## 0.3.19: 翻訳用の開発ツール（2026-10-13）

Acorn 8.15.0の公式npm配布物から`dist/acorn.mjs`を取得し、npmのSHA-512 integrityを照合しました。元のMIT著作権・許諾文を`licenses/Acorn-MIT.txt`へ保存し、クレジットから上流・原文・ソースへリンクしています。Gitタグ8.15.0の注釈付きタグ`b63a4e15ce4ca3d4c85025f7e25cd83337198f78`はコミット`6dc537416ad628b3959b3ff963fbdcfdb380e0a3`を指します。そのタグのソースアーカイブ内のLICENSEと配布する原文を照合し、AUTHORSも保持しました。版・タグ・コミット・配布物と原文とソースのSHA-256は`SOURCES.json`と`scripts/i18n/vendor/acorn.json`に固定しています。

Acornは開発時のJavaScript構文解析だけに使用します。改変せずにMITの条件を保持して配布し、Web UIのAGPL表示をAcornへ適用するものではありません。翻訳生成器は新規のAGPL-3.0-or-laterコードです。Ollama・Gemmaの実行ファイルやモデルは同梱しません。使用する開発環境と原文を保持する範囲は`LOCALIZATION_REVIEW.md`に記録しています。コア、スキン、既存ライセンス原文の変更はありません。

ソースアーカイブには上流の同一リポジトリ内を指す作業用シンボリックリンクが2件あったため、配布検査の方針に従ってその2件だけを除去しました。通常ファイルの内容は全件一致を確認しています。変換前後のハッシュを固定し、`scripts/prepare-acorn.py`で再現できます。

## 0.3.20: 保存・操作・映像効果の移植（2026-10-13）

今回の出典と変更範囲は [FEATURE_REVIEW.md](FEATURE_REVIEW.md) を参照してください。
ManicEMUの追加6ファイルは固定版の原文を保持し、Webへの変更はAGPL-3.0-or-laterで公開します。
Celio Web由来のGPUドライバーと4件のmGBA最適化はMPL-2.0を維持し、バイナリに対応する改変ソース・ビルド方法を配布します。
RomPatcher.jsの必要な未改変ソースとMIT全文、xBRZのシェーダー原文・著作権・GPLv3全文・例外を同梱しました。
GPLv3第13節はAGPLv3との結合を認め、GPL部分の条件とAGPLのネットワーク利用者へのソース提供条件を保持します。
クレジットの上流リンクとライセンスリンク、対応ソースZIPを更新しました。新しいROM・BIOS・市販画像・外部通信先は追加していません。

## 0.3.22の追加確認（2026-10-13）

- 新しいpixel-transfer.jsはpm-start/mgba-celio-webの固定版23235bc6由来。作者・出典・変更通知・MPL-2.0とMPL第3.3条による追加選択肢を保持し、編集可能なコードを配布します。
- DSの5秒の疑似息入力はManicEMUの操作を参考にAGPLの既存部品へ追加。DeSmuME／melonDSの固定版にある公開APIを使用し、マイク録音・BIOS・ROMを追加していません。
- mGBAのRTC・振動とアーカイブのバージョン識別修正はMPLの変更通知を保持。3コアの対応ソースを独立ビルドして配布JS/WASMとの一致を確認しました。
- ZIP展開、設定、入力、更新案内は既存の標準ブラウザAPIで実装。追加の第三者依存物・画像・広告・解析サービスはありません。利用者データは今回も配布物・テスト素材・対応ソースに含めません。
- 既存のライセンス全文、著作権表示、同梱スキンのCC BY帰属、公開先の対応ソース提供は維持します。検査は固定した配布内容を対象とし、利用者のROMの権利を保証するものではありません。

## 0.3.29：保存・診断・参照元の更新確認（2026-10-14）

追加したブラウザのバックアップ、動作計測、画面消灯防止、診断許可リスト生成、上流メタデータ検出は本プロジェクトのAGPL-3.0-or-laterコードです。新しい外部依存・第三者画像・ROM・BIOSは含めません。Celio接続先の設定は既存MPL-2.0 transportの変更で、原著作権表示と対応ソースは維持します。

mGBAの保存観測用ブリッジはMPL-2.0で、変更日・保存領域への書込みの観測であること・ファイル送信を行わないことを記載しています。固定済みコアのソースアーカイブは変更せず、bridge.cと追加save-watch.hを配布し、2回の独立ビルドのJS/WASM一致とハッシュをbuild-evidence.jsonへ記録しました。生成済みバイナリだけを入れ替える変更ではありません。過去のgbLinkBuild等は当時の証跡として保持し、最新の証跡はsaveCompletionBuildです。

対応ソースZIPには新しいupstream-watch.ymlも含め、公開検査はレビューしたworkflowハッシュを照合します。検出ジョブは固定コミットと公開メタデータを比較するだけで、候補コードの採用・実行・ライセンス承認を行いません。提供セーブ変換器のファイルと許諾範囲は変えておらず、公開フィード未確認を検出結果へ明記します。Google認証・クラウドSDK・クラウドバックアップは今回の配布物にありません。

### 提供変換ツールの許諾記録の追加確認

2026-10-14、プロジェクト管理者へ作者本人による許可範囲を確認し、PalmoEMUへの組み込み・Web公開・改変・改変ソースの再配布について「許可済み」との回答を得ました。vendor/start-save-migrateの出典記録へ反映しました。管理者はさらに、作者の条件がクレジット掲載であることを確認しました。作者の原文メッセージは直接閲覧しておらず、標準のAGPL・MIT等の一般ライセンスを付与されたとは扱いません。提供エンジンと定義は変更せず、出典READMEと許可メタデータのハッシュだけ更新しました。これは管理者の確認に基づく記録で、作者の条件を代替・拡張するものではありません。

### 外部レビューを受けた追加確認

外部レビューは指摘候補として扱い、現在の実コードで確認しました。保存・終了・起動前救出・更新整合性の修正は既存の独自AGPLコードへの変更です。既存MPL由来の3モジュールとmGBAブリッジでは、フォルダー移動後に無効だったライセンス文書の相対参照を訂正し、元の権利通知とライセンスの選択条件は保持しました。提供変換器のエンジン・定義は不変です。

CSPのJavaScript文字列評価許可を外し、WebAssembly用の許可に限定しました。これは新たなコンテンツ利用許諾を与えるものではありません。配布検査ではライセンス原文・作者表示・ソースURL・固定ハッシュ・ソースZIPの全メンバーを照合し、利用者のROM・BIOS・セーブを配布から除外します。商用利用を禁じる未承認コアは従来どおり配布対象外です。

### 許諾とAGPL結合についての評価

組み込み・Web公開・改変・改変ソース再配布の作者許可と、条件はクレジット掲載であるという管理者の確認を配布の根拠として記録します。AGPL第7節(b)は合理的な権利表示・作者表示の保存を認めており、報告された条件に改変禁止・再配布禁止・非商用限定などの具体的な衝突は確認していません。一方、静的ES module importを使うため、Workerやフォルダー分離だけを根拠に独立したaggregateとは扱いません。第5節(c)・第10節の受領者の権利の論点は残り、作者の原文や法的判断まで確認済みとはしません。こちらから「第三者は再利用不可」という制限を追加したり、作者のコードへ標準ライセンスを勝手に付け替えたりしません。

component.jsonは専用検査でエンジン・定義・出典READMEのハッシュと契約形式を検査し、公開検査がその専用検査を呼び出します。さらに配布一覧とレビュー記録がcomponent.json自体のバイト列を固定します。今回SOURCES.jsonにもコンポーネントの出典とハッシュを記録します。

公開中継サービスについてはLINK_COMPATIBILITY.mdに一次資料と確認範囲を記録しました。GPLソースの許諾と運営サービスの利用を区別し、公開資料にPalmoEMUへの個別許諾や明示的な禁止の根拠は見つかっていません。接続は利用者の明示操作に限定し、接続先は選択可能です。PokemonStart/CFRUのゲーム制作条件をエミュレーター一般の条件へ拡張せず、本配布にはゲーム本体・ROMパッチ・BIOSを含めません。

GitHub Pagesの公式制限も2026-10-14に確認しました。公開サイト1 GB、月100 GBのソフト帯域制限、デプロイ10分が目安/制限であり、同時利用者数の保証ではありません。独自Actionsでは毎時10ビルドの制限は適用されません。参照：https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits


## 2026-10-16: 提供変換ツール1.0.8の更新

管理者が追加提供したSTART-Save-Migrate-0.48.0.htmlを静的に比較し、既存の変換専用コードへ数値定義を取り込んだ。提供物SHA-256はvendor/start-save-migrate/README.mdとcomponent.jsonへ記録。2026-10-14に確認した作者くりーぱーのプロジェクト向け許可とクレジット条件を維持し、PokemonStart開発者onikoro334274-cellも掲載する。今回も標準ライセンスや一般的な第三者再利用許諾を付与されたとは扱わない。

HTMLアプリ全体、編集機能、技・道具名、画像、ROM、利用者セーブは同梱しない。版別ID検査・版表記・出力終端の指定・再開位置の判定漏れを修正し、提供コードから変更した箇所を出典へ明記した。ホスト側の原本保護、互換性判定、Worker内変換と原子的保存の実装は既存のAGPLコードを更新する。配布ファイルと対応ソースを再生成し、原本添付や個人データが含まれないことを配布監査で確認する。


## 2026-10-16: PokemonStart 0.50.0付属移行ツール（未公開）

新しい付属HTMLは従来のくりーぱー版と別の出典として管理する。管理者は今回のツールについても、PalmoEMUへの組み込み・Web公開を「今回のツールも許可済み」と確認した。確認した範囲をvendor/start-save-format/README.mdとcomponent.jsonへ記録し、配布者pm-start/PokemonStartをクレジットへ追加した。個人作者や標準ライセンスは確認できていないため推定せず、以前の作者名・許可をこの別ファイルへ流用しない。作者本人の原文を独立閲覧したとの主張や、一般の第三者向け許諾の付与はしない。

抽出・改変の範囲は旧→L変換と暗号/形式処理で、逆変換・丸め・エディター・ゲーム資産は含めない。原本コピー、厳密検査、カウンター周回、非配置領域保持、結果検査を追加する。ホストの既存歴史補正と1MiB容器対応は別モジュールの責任として記録する。配布一覧の分類とソースZIPも別コンポーネントとして扱い、プロジェクト本体のAGPL表示で提供コードの権利条件を上書きしない。Workerでの実行を別著作物の証明とは扱わない。本記録は出典と管理者の許可確認を整理するもので、AGPLとの結合や第三者の権利範囲を独立に法的確定するものではない。

ROM・セーブ・PKS・元HTMLは配布しない。元HTML/静的復号JavaScriptのハッシュと採用版を記録し、通常ビルドと公開検査に新コンポーネントの出典・契約・ファイルハッシュ検査を組み込む。許可範囲を超える公開は別途判断し、今回の作業では公開しない。


## 2026-10-16: 0.50.1付属ツールへの更新（未公開）

利用者が0.50.1のHTMLを提供し、既存コンポーネントへの組み込み更新を依頼した。静的復号したforward writerの予備bank/sector-16処理を取り込み、従来の出典・管理者による許可確認の記録・権利範囲を維持する。くりーぱー版とは引き続き分離し、配布者pm-start/PokemonStartへのクレジットと参照版を更新。新たな標準ライセンスや個人作者、独立した権利者確認は主張しない。

HTML・復号した全JavaScript・PKS・実ROMは無視対象の調査領域または利用者のDownloadsにのみ置き、配布物へ含めない。採用した旧→Lの処理と出典ハッシュ、改変内容はvendor/start-save-formatおよびSOURCES.jsonで管理する。逆変換・丸め・ゲーム資産は追加しない。

## 2026-10-17: 0.53.1提供HTMLのW形式（公開保留）

0.53.1 ROMと併せて管理者が提供したHTMLの、変換に必要な前方向処理だけを既存の別出典コンポーネントへ適用。2026-10-16に確認されたクレジット条件付き組み込み・改変・Web/オフライン・改変ソース配布の範囲を維持し、標準ライセンスや個人作者を新たに推定しない。PokemonStart開発・協力はGitHubの正式アカウントonikoro334274-cell/liru55、旧移行ツール作者くりーぱーは別項目として保持。

元HTML・復号全コード・PKS・ROM・利用者セーブは配布しない。W形式の採用部分、厳密検査、原本/非配置領域保持、逆変換/丸め除外、出典ハッシュはvendor/start-save-formatに記録する。この記録は管理者確認と技術的な配布範囲の監査であり、第三者向け一般ライセンスや権利者原文を独立確認したとは扱わない。今回の指示に従いPages公開は保留する。
# 2026-10-21 mGBAコアの自動更新条件

ユーザーの指示により、既存のMPL-2.0コア更新を、限定した差分検査・互換性検証・全CI後に自動採用する。
ルートのライセンスだけでなく配布対象の権利表記・ソースヘッダー・依存物一覧を比較し、変更があれば自動処理を停止する。
新しい許諾を自動取得・承認したとは扱わない。対応ソースを同時更新し、独立再ビルドの一致を必須にする。
netlink-8（b6633141108285fc825106ffc28f7fae7c323305）は既存の配布依存物・著作権表示を維持し、PalmoEMU独自の5ファイルの修正も保持できることを確認した。
候補のバイナリ・ソースはこの検査を通過した範囲だけをActions成果物に含め、未審査の上流ツリー全体は配布しない。
検査済みファイルの一覧・対応ソース証拠のハッシュのみ自動更新を許可し、既存の未解決事項・許諾範囲・翻訳・UI・ワークフローは自動採用で変更しない。

## 2026-10-21 HGX source review (0.3.38)

`rom64-hgx-1` / `e691a05b10e3ad1c6f95485ea3f539037519877a` のHGX2背景描画拡張を取り込んだ。
作者は liru55。既存MPL-2.0ヘッダー、LICENSE、配布する依存物を保持している。
CMakeLists.txtの差分は既定OFFの描画テスト用ターゲット追加のみで、個別に確認した。
通常の自動採用ポリシーを緩和せず、ほかの全ヘッダー・依存物は従来の検査で照合した。
配布ソースの独立再ビルドでJS/WASMが一致。ROM・セーブ・BIOSは同梱していない。
専用HGX2ゲームROMで隣接マップの描画・境界移動・PC環境の負荷を確認した。詳細と未確認範囲はRELEASE_VALIDATION.mdに記録する。利用者から0.3.38の公開指示を受け、同一コミットの全CI成功後に公開する。物理iPhoneと全マップの検証を完了したという意味ではない。

## 2026-10-23 — 0.3.39 manual source/dependency review

Reviewed rom128-2 b3975350076fbd3d86e7dc6796cdadb0ccdb9a89 against the shipped HGX core. CMake changes add HGX4/OBJ256 sources and optional native test/GUI settings; those native frontends are not compiled. version metadata is scoped to the source tree. README_DE copyright-year/punctuation changes do not alter permission. New HGX4/OBJ256 sources are MPL-2.0; newly compiled zlib inflate/adler/crc helpers retain upstream notices and the full zlib license in mGBA-compiled-file-notices.txt. Compression encoders and general VFS compression are not enabled in the shipped target. Independently rebuilt compiler-closure source produces identical JS/WASM.

The supplied 0.59.0 converter is statically decoded and compared with the adapted forward-only engine. The maintainer-confirmed 2026-10-16 credit condition remains in component.json, README, SOURCES and licenses.html. The distributor/project is pm-start/PokemonStart, with onikoro334274-cell and liru55 project credits; no individual converter author is invented. Distribution contains the adapted engine and corresponding source, not the original HTML, ROM or user save. The current user explicitly requests commit/push/publication after validation.
