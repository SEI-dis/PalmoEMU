# 追加コアの対応ソース

採用リビジョンは [SOURCES.json](../../SOURCES.json) の `alternateCores`、配布物と再ビルドの対応は [alternate-build-evidence.json](../alternate-build-evidence.json) に記録します。

| 機種 | 追加コア | 条件 |
| --- | --- | --- |
| GBA | VBA-Next | 32 MiBまで。64 MiB ROMはmGBA Celioを使う |
| NDS | melonDS 0.9.3 libretro | DSモード・ソフトウェア描画。FreeBIOSを使用。DSi・Wi-Fi・チートは非対応 |
| GB / GBC / FC / SFC / MD | jgenesis 0.14.1 | GBの外部ブートROMなし、SFCの外部コプロセッサROMなし。MD単体のみ。チートは非対応 |

ゲーム詳細の「コアを変更」で選択します。既存コアの保存先は維持し、追加コアのセーブ・ステート・復旧データは別の保存先に記録します。コア間で自動変換しません。jgenesisのエクスポートは、SRAMとRTCなどをまとめた `.jgsav` です。一般的な `.sav` の読み込みも可能ですが、互換性はゲーム・形式によります。

## VBA-Next / melonDS

`alternate-c-cores-source.tar.gz` を空のディレクトリへ展開します。コンパイラの依存ファイル、Makefile入力、原本の通知、変更済みWebアダプタが含まれます。ROM・市販BIOSは含みません。

Emscripten 4.0.15、CMake 3.31.6、Ninja 1.11.1.4を使用します。コンパイラの固定情報は `../mgba-web-port/upstream.json` を参照してください。Windowsで同じソースを別ディレクトリから再ビルドして比較しています。

```sh
cmake -S alternate-web -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=/path/to/emsdk/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake -DCORE_ROOT=/absolute/path/to/alternate-cores
cmake --build build --parallel 4
```

出力は `build/vba-next.js`、`vba-next.wasm`、`melonds.js`、`melonds.wasm` です。配布時は各 `cores/<コア名>/core.js` と `core.wasm` に置きます。読み込み先はWebアダプタが指定します。

変更日：2026-10-09。AGPLのWebアダプタを追加し、入力・音声・ステート・端末内セーブを接続しました。melonDSにはROMデータの生存期間を保つアダプタとSRAM入出力を追加し、未実装のチート初期化を使わないようにしました。FreeBIOSのBSD-2-Clause通知も同梱します。

## jgenesis

`jgenesis-web-source.tar.gz` を空のディレクトリへ展開します。ラッパー、変更済みコア、Cargo.lock、依存クレートのソースと通知、Cargoのオフライン設定を含みます。未使用のデスクトップUI・素材・テスト用バイナリは含めません。削除したファイルの項目だけをvendorチェックサム一覧から除き、残したファイルとクレートの元のチェックサムは維持しています。

使用ツール：Rust 1.99.0（`stable-x86_64-pc-windows-gnu`）、`wasm32-unknown-unknown` ターゲット、wasm-bindgen CLI 0.2.126、Emscripten 4.0.15のClang/llvm-ar。ホスト用CツールはLLVM-MinGW 20261006 UCRT x86_64です。ツール本体は対応ソースに含めません。

PowerShellで展開先を作業ディレクトリにし、各ツールをPATHに設定します。以下の `C:/tools/...` は自分のインストール先に変更してください。

```powershell
$sourceRoot = (Get-Location).Path
$env:RUSTFLAGS = "--remap-path-prefix=$sourceRoot=/source"
$sourceForward = $sourceRoot.Replace('\','/')
$env:CFLAGS_wasm32_unknown_unknown = "-ffile-prefix-map=$sourceForward=/source"
$env:CC_wasm32_unknown_unknown = 'C:/tools/emsdk/upstream/bin/clang.exe'
$env:AR_wasm32_unknown_unknown = 'C:/tools/emsdk/upstream/bin/llvm-ar.exe'
cargo build --offline --locked --release --target wasm32-unknown-unknown --manifest-path jgenesis-web-bridge/Cargo.toml
wasm-bindgen jgenesis-web-bridge/target/wasm32-unknown-unknown/release/local_play_jgenesis.wasm --target web --out-dir compiled --out-name core --no-typescript
```

Windows GNUホストのリンカーがGCCサポートライブラリを見つけられない場合は、Rustの `lib/rustlib/x86_64-pc-windows-gnu/lib/self-contained` を `LIBRARY_PATH` に設定します。

出力は `compiled/core.js` と `core_bg.wasm`。両方を `cores/jgenesis/` へ置きます。初期化時に同じ配信元から取得します。
Rust/Cargoのクレート識別子はビルド元のディレクトリにも依存するため、別のパスで作ったWASMはハッシュが変わることがあります。再ビルド記録では、同じビルドパスを空にし、配布アーカイブを改めて展開して、オブジェクトを再利用せずに比較します。ディレクトリ名やOSが異なる環境でのバイト一致を保証するものではありません。

変更日：2026-10-09。AGPLのWebラッパーを追加しました。GB・NES・SNES・MDに即時セーブ出力用APIを追加し、フレームを待たずに現在のSRAMとRTCを取得します。変更箇所は各 `api.rs` に明記しています。jgenesisの未使用GUIをworkspaceから外し、32Xの内蔵ファームウェア参照をゼロ配列へ置換しました。WebラッパーはMD単体だけを生成し、32X・Sega CDは公開していません。

これらのコアのライセンスはゲームやBIOSの利用許諾ではありません。対応ソース・依存通知・改変表示を配布バイナリとともに維持してください。

## 2026-10-13: 2P入力

配布アーカイブのWebラッパーはNES/SNES/MDの2Pも設定します。入力ビットを16ビットずつ1P／2Pへ割り当て、GB/GBCは従来どおり1Pだけを設定します。セーブ・ステートの構造は変更しません。未使用の2PがGBの1Pを消さないことを合成ROMで確認しました。配布アーカイブを改めて展開して再ビルドし、同じパスで生成したJS/WASMの一致を確認しています。
