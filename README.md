# KauScope Final LP

PC/SPヒーロー画像切り替え付きのKauScope完成版です。

## 入っているもの

- server.js
- package.json
- public/index.html
- public/app.js
- public/styles.css
- public/images/hero-pc.png
- public/images/hero-sp.png

## Render環境変数

すでに設定済みならそのままでOKです。

- RAKUTEN_APPLICATION_ID
- RAKUTEN_ACCESS_KEY
- RAKUTEN_AFFILIATE_ID

任意:

- RAKUTEN_REFERER_URL=https://kauscope.onrender.com

## GitHubで差し替えるファイル

基本はZIP内の中身をすべて差し替えてください。

## 反映手順

1. GitHubにアップロード / 差し替え
2. Commit changes
3. Renderで Manual Deploy
4. Deploy latest commit

## 画像切り替え

index.html 内で以下のようにPC/SPを自動切り替えしています。

- PC: public/images/hero-pc.png
- スマホ: public/images/hero-sp.png
