# iOSで使用する上で必要な設定

## すでに実装済み

| 項目 | 内容 |
|------|------|
| **ビューポート** | `viewport-fit=cover` でノッチ・ホームバー領域まで表示 |
| **Safe Area** | `env(safe-area-inset-top/bottom)` で余白を確保（ヘッダー・固定バー・コンテナ） |
| **高さ** | `100dvh` でアドレスバー考慮のビューポート高さ |
| **音声** | 「出張する？」タップでBGM開始（ユーザージェスチャー対応）。`webkitAudioContext` 対応 |
| **ダブルタップ防止** | viewport に `maximum-scale=1.0, user-scalable=no`。全局に `touch-action: manipulation`。意図しないズーム・遅延を防止 |
| **タッチ** | `touchstart` で音声コンテキスト有効化。`-webkit-tap-highlight-color: transparent`。`user-select: none`（入力欄は `text` で上書き） |
| **スクロール** | `-webkit-overflow-scrolling: touch` でスムーズスクロール（メインエリア） |
| **レイアウト** | 768px以下で縦型・コンパクト、高さ700px以下でさらに圧縮 |

---

## 配信時に必須

| 項目 | 設定内容 |
|------|----------|
| **HTTPS** | iOS Safari / WebView では **必ず HTTPS** で配信する（`file://` は制限あり） |
| **同一オリジン** | BGMのMP3は **index.html と同じオリジン** に置く（相対パスで読み込み） |

---

## あるとよい追加設定（任意）

| 項目 | 設定例 |
|------|--------|
| **ホーム画面追加時** | `<meta name="apple-mobile-web-app-capable" content="yes">` でフルスクリーン表示 |
| **ステータスバー** | `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` で見た目を調整 |
| **電話番号の自動リンク無効** | `<meta name="format-detection" content="telephone=no">`（数字だけの地域名で誤検出する場合） |
| **PWA** | `manifest.json` とサービスワーカーで「ホームに追加」時のアイコン・名前を指定 |

---

## 動作確認の目安（iOS）

- [ ] Safari で「出張する？」タップでBGMが鳴る
- [ ] 縦向きでカレンダー・地域タグ・固定バーがはみ出さず見える（またはメインのみスクロール）
- [ ] ドラッグ＆ドロップで地域をカレンダーに配置・右エリアへ戻して解除できる
- [ ] PDFで決定でダウンロードできる
- [ ] ホーム画面に追加した場合、ノッチ・ホームバー付近のボタンが押しやすい（Safe Area が効いている）
