# 🍉 フルーツマージ 🍒

同じフルーツをくっつけて進化させ、スイカを目指す物理パズルゲームです。
Next.js (App Router) + [matter-js](https://brm.io/matter-js/) で動いています。

## 必要な環境

- Node.js 20.9.0 以上（Next.js 16 の要件）
- npm

```bash
node -v   # v20.9.0 以上であることを確認
```

## セットアップ

```bash
git clone git@github.com:nabe-code/fruit-merge.git
cd fruit-merge
npm install
```

## ゲームの起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開くとゲームが始まります。

## 遊び方

| 操作 | マウス / タッチ | キーボード |
| --- | --- | --- |
| 落とす位置を動かす | ポインタを左右に動かす | `←` / `→` |
| フルーツを落とす | クリック / タップ | `Space` / `↓` |

同じ種類のフルーツ同士がぶつかると、一段階大きいフルーツに進化します。
フルーツが箱からあふれるとゲームオーバーです。ベストスコアはブラウザに保存されます。

## その他のコマンド

```bash
npm run build   # 本番ビルド
npm run start   # 本番ビルドの起動（build 後）
npm run lint    # Lint
```

## ディレクトリ構成

```
src/
├── app/                    # ページ・レイアウト
└── features/fruit-merge/   # ゲーム本体（物理演算・フルーツ定義・効果音）
```
