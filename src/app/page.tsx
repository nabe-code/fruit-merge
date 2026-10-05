import { FruitMergeGameClient } from "@/features/fruit-merge/FruitMergeGameClient";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-8">
      <header className="text-center">
        <h1 className="text-4xl font-black tracking-tight text-amber-900 drop-shadow-[0_3px_0_#fff] sm:text-5xl">
          🍉 フルーツマージ 🍒
        </h1>
        <p className="mt-2 text-amber-800">同じフルーツをくっつけて、スイカを目指そう！</p>
      </header>
      <FruitMergeGameClient />
    </main>
  );
}
