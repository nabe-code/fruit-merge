export type Fruit = {
  emoji: string;
  name: string;
  radius: number;
  color: string;
  score: number;
};

// 小さい順。同じフルーツがぶつかると次の段階に進化する
export const FRUITS: Fruit[] = [
  { emoji: "🫐", name: "ブルーベリー", radius: 16, color: "#6c7bd9", score: 1 },
  { emoji: "🍒", name: "さくらんぼ", radius: 22, color: "#e0445a", score: 3 },
  { emoji: "🍓", name: "いちご", radius: 29, color: "#ff6b6b", score: 6 },
  { emoji: "🍊", name: "みかん", radius: 37, color: "#ffa23a", score: 10 },
  { emoji: "🍋", name: "レモン", radius: 45, color: "#ffe066", score: 15 },
  { emoji: "🍎", name: "りんご", radius: 54, color: "#ff4d4d", score: 21 },
  { emoji: "🍑", name: "もも", radius: 63, color: "#ffb4a2", score: 28 },
  { emoji: "🍍", name: "パイナップル", radius: 73, color: "#f6c945", score: 36 },
  { emoji: "🥥", name: "ココナッツ", radius: 84, color: "#a47551", score: 45 },
  { emoji: "🍈", name: "メロン", radius: 96, color: "#b5e48c", score: 55 },
  { emoji: "🍉", name: "スイカ", radius: 110, color: "#52b788", score: 66 },
];

// 落とせるのは小さい5種類まで
export const DROPPABLE_MAX = 4;

export function randomDroppable(): number {
  return Math.floor(Math.random() * (DROPPABLE_MAX + 1));
}
