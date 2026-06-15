# KauScope（カウスコープ）

楽天市場の商品価格を検索し、最安値・最高値・平均価格を表示するアフィリエイト向け価格チェッカーのMVPです。

## 機能

- 商品名検索
- 楽天市場の商品価格取得
- 最安値・最高値・平均価格の自動計算
- 商品カード表示
- 楽天アフィリエイトURL対応
- API未設定時のデモモード
- PR表記入りのLP風デザイン

## セットアップ

依存パッケージなしで動きます。Node.js 18以上だけ必要です。

```bash
cp .env.example .env
npm start
```

ブラウザで開く：

```text
http://localhost:3000
```

## 楽天API設定

`.env` に以下を入れてください。

```env
RAKUTEN_APPLICATION_ID=あなたのアプリID
RAKUTEN_ACCESS_KEY=あなたのアクセスキー
RAKUTEN_AFFILIATE_ID=あなたの楽天アフィリエイトID
PORT=3000
```

`RAKUTEN_APPLICATION_ID` と `RAKUTEN_ACCESS_KEY` が空の場合は、デモデータで動きます。

## 公開方法の考え方

GitHub PagesだけだとAPIキーがブラウザ側に見えてしまいます。
本番では Render / Vercel / Cloudflare Workers などに `server.js` 側を置き、APIキーは環境変数で管理してください。

## 注意書き

価格・在庫・ポイント還元・送料は変動します。実運用ではページ内に以下のような文言を入れてください。

> ※当ページはPRを含みます。価格・在庫・ポイント還元・送料は取得時点の情報です。最新情報は各販売ページでご確認ください。

## 次の拡張案

1. SQLite / Supabase に検索履歴を保存
2. 30日・90日の平均価格推移グラフを追加
3. 防災グッズ、車用品、日用品などジャンル別ページを作る
4. Yahoo!ショッピングアフィリエイト取得後に対応ECを追加
