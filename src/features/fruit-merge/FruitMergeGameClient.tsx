"use client";

import dynamic from "next/dynamic";

// ベストスコア(localStorage)や物理演算はブラウザ専用なのでSSRしない
export const FruitMergeGameClient = dynamic(
  () => import("./FruitMergeGame").then((m) => m.FruitMergeGame),
  {
    ssr: false,
    loading: () => <p className="py-40 text-2xl">🍉 準備中...</p>,
  },
);
