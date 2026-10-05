"use client";

import Matter from "matter-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { FRUITS, randomDroppable } from "./fruits";
import { playBoom, playDrop, playFanfare, playPop } from "./sound";

const WIDTH = 420;
const HEIGHT = 640;
const WALL = 20;
const DROP_Y = 60;
const DANGER_Y = 110;
const DROP_COOLDOWN_MS = 450;
const GAME_OVER_MS = 2000;
const COMBO_WINDOW_MS = 1000;
const SPAWN_ANIM_MS = 350;
const BEST_KEY = "fruit-merge-best";

type FruitBody = Matter.Body & {
  fruitLevel?: number;
  merged?: boolean;
  bornAt?: number;
  overSince?: number | null;
  // ぷるぷる用のバネ（正で横に潰れ、負で縦に伸びる）
  wob?: number;
  wobV?: number;
  // 合体で生まれたときのポップアニメーション開始時刻
  popAt?: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  star: boolean;
  spin: number;
};

type Popup = { x: number; y: number; text: string; life: number; size: number; color: string };
type Ring = { x: number; y: number; r: number; maxR: number; life: number; color: string };
type Banner = { emoji: string; name: string; start: number };

type Fx = {
  shake: number;
  flash: number;
  slowUntil: number;
  combo: number;
  lastMergeAt: number;
  rings: Ring[];
  banner: Banner | null;
};

const newFx = (): Fx => ({
  shake: 0,
  flash: 0,
  slowUntil: 0,
  combo: 0,
  lastMergeAt: 0,
  rings: [],
  banner: null,
});

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeBest(v: number) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    // ストレージが使えない環境では保存しない
  }
}

export function FruitMergeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const pointerXRef = useRef(WIDTH / 2);
  const currentRef = useRef(0);
  const nextRef = useRef(1);
  const lastDropRef = useRef(0);
  const gameOverRef = useRef(false);
  const particlesRef = useRef<Particle[]>([]);
  const popupsRef = useRef<Popup[]>([]);
  const scoreRef = useRef(0);
  const maxLevelRef = useRef(0);
  const fxRef = useRef<Fx>(newFx());

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(readBest);
  const [current, setCurrent] = useState(0);
  const [next, setNext] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [maxLevel, setMaxLevel] = useState(0);
  const [runId, setRunId] = useState(0);

  const addScore = useCallback((v: number) => {
    scoreRef.current += v;
    setScore(scoreRef.current);
  }, []);

  const createFruit = useCallback((level: number, x: number, y: number) => {
    const f = FRUITS[level];
    const body = Matter.Bodies.circle(x, y, f.radius, {
      restitution: 0.15,
      friction: 0.3,
      density: 0.001 * (1 + level * 0.1),
    }) as FruitBody;
    body.fruitLevel = level;
    body.bornAt = performance.now();
    body.overSince = null;
    body.wob = 0;
    body.wobV = 0;
    return body;
  }, []);

  const burst = useCallback((x: number, y: number, color: string, n: number, power = 1) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (1 + Math.random() * 4) * power;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1,
        life: 1,
        color,
        star: Math.random() < 0.3,
        spin: Math.random() * Math.PI,
      });
    }
  }, []);

  // 物理エンジン & 描画ループ
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c2d = canvas.getContext("2d");
    if (!c2d) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    c2d.scale(dpr, dpr);

    const fx = fxRef.current;
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.1 } });
    engineRef.current = engine;
    const wallOpts = { isStatic: true, friction: 0.5 };
    Matter.Composite.add(engine.world, [
      Matter.Bodies.rectangle(WIDTH / 2, HEIGHT + WALL / 2 - WALL, WIDTH, WALL, wallOpts),
      Matter.Bodies.rectangle(WALL / 2, HEIGHT / 2, WALL, HEIGHT * 2, wallOpts),
      Matter.Bodies.rectangle(WIDTH - WALL / 2, HEIGHT / 2, WALL, HEIGHT * 2, wallOpts),
    ]);

    const slowMo = (ms: number, scale: number) => {
      fx.slowUntil = performance.now() + ms;
      engine.timing.timeScale = scale;
    };

    Matter.Events.on(engine, "collisionStart", (ev) => {
      const now = performance.now();
      for (const { bodyA, bodyB } of ev.pairs) {
        const a = bodyA as FruitBody;
        const b = bodyB as FruitBody;

        if (a.fruitLevel === undefined || a.fruitLevel !== b.fruitLevel) {
          // 着地・衝突の勢いでぷるんと潰れる
          const speed = Matter.Vector.magnitude(Matter.Vector.sub(a.velocity, b.velocity));
          const kick = Math.min(speed * 0.015, 0.14);
          if (a.fruitLevel !== undefined) a.wobV = (a.wobV ?? 0) + kick;
          if (b.fruitLevel !== undefined) b.wobV = (b.wobV ?? 0) + kick;
          continue;
        }
        if (a.merged || b.merged) continue;
        a.merged = b.merged = true;
        const level = a.fruitLevel;
        const x = (a.position.x + b.position.x) / 2;
        const y = (a.position.y + b.position.y) / 2;
        Matter.Composite.remove(engine.world, [a, b]);

        fx.combo = now - fx.lastMergeAt < COMBO_WINDOW_MS ? fx.combo + 1 : 1;
        fx.lastMergeAt = now;
        const comboRate = 1 + (fx.combo - 1) * 0.5;
        playPop(level + 1 + (fx.combo - 1) * 0.7);

        if (level === FRUITS.length - 1) {
          // スイカ同士は消えて大ボーナス
          burst(x, y, "#ff4d6d", 60, 2.5);
          burst(x, y, "#ffd166", 60, 2);
          fx.rings.push({ x, y, r: 0, maxR: 400, life: 1, color: "#ff4d6d" });
          fx.shake += 28;
          fx.flash = 0.9;
          slowMo(700, 0.2);
          playBoom(1.5);
          addScore(500);
          popupsRef.current.push({ x, y, text: "🎉 +500", life: 1, size: 40, color: "#d00000" });
          continue;
        }

        const nextLevel = level + 1;
        const merged = createFruit(nextLevel, x, y);
        merged.popAt = now;
        merged.wobV = 0.25;
        Matter.Composite.add(engine.world, merged);

        const f = FRUITS[nextLevel];
        burst(x, y, f.color, 8 + nextLevel * 4, 1 + nextLevel * 0.12);
        fx.rings.push({ x, y, r: f.radius * 0.5, maxR: f.radius * 2.2, life: 1, color: f.color });
        fx.shake += nextLevel * (nextLevel >= 6 ? 1.6 : 0.6);
        if (nextLevel >= 6) {
          fx.flash = Math.max(fx.flash, 0.15 + (nextLevel - 6) * 0.1);
          playBoom(0.4 + (nextLevel - 6) * 0.2);
        }
        if (nextLevel >= 8) slowMo(300 + (nextLevel - 8) * 100, 0.3);

        const gained = Math.round(f.score * comboRate);
        addScore(gained);
        popupsRef.current.push({
          x,
          y,
          text: `+${gained}`,
          life: 1,
          size: 20 + nextLevel * 2,
          color: "#e85d04",
        });
        if (fx.combo >= 2) {
          popupsRef.current.push({
            x,
            y: y - 30,
            text: `${fx.combo} COMBO!`,
            life: 1.2,
            size: 18 + Math.min(fx.combo, 6) * 3,
            color: "#7209b7",
          });
        }

        if (nextLevel > maxLevelRef.current) {
          maxLevelRef.current = nextLevel;
          setMaxLevel(nextLevel);
          if (nextLevel >= 3) {
            fx.banner = { emoji: f.emoji, name: f.name, start: now };
            playFanfare();
          }
        }
      }
    });

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    let raf = 0;
    const draw = () => {
      const now = performance.now();
      if (fx.slowUntil && now > fx.slowUntil) {
        fx.slowUntil = 0;
        engine.timing.timeScale = 1;
      }

      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      c2d.clearRect(0, 0, WIDTH, HEIGHT);

      // 画面揺れ
      if (fx.shake > 0.3) {
        c2d.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
        fx.shake *= 0.88;
      } else {
        fx.shake = 0;
      }

      // 箱（揺れで端が見えないよう少し大きめに塗る）
      const grad = c2d.createLinearGradient(0, 0, 0, HEIGHT);
      grad.addColorStop(0, "#fff8e7");
      grad.addColorStop(1, "#ffe3b8");
      c2d.fillStyle = grad;
      c2d.fillRect(-40, -40, WIDTH + 80, HEIGHT + 80);
      c2d.fillStyle = "#c98b4f";
      c2d.fillRect(-40, -40, WALL + 40, HEIGHT + 80);
      c2d.fillRect(WIDTH - WALL, -40, WALL + 40, HEIGHT + 80);
      c2d.fillRect(-40, HEIGHT - WALL, WIDTH + 80, WALL + 40);

      // デンジャーライン
      c2d.save();
      c2d.setLineDash([10, 8]);
      c2d.strokeStyle = "rgba(230, 57, 70, 0.55)";
      c2d.lineWidth = 2;
      c2d.beginPath();
      c2d.moveTo(WALL, DANGER_Y);
      c2d.lineTo(WIDTH - WALL, DANGER_Y);
      c2d.stroke();
      c2d.restore();

      // 落下ガイド & 次に落とすフルーツ
      if (!gameOverRef.current) {
        const f = FRUITS[currentRef.current];
        const x = clampX(pointerXRef.current, f.radius);
        const since = now - lastDropRef.current;
        c2d.strokeStyle = "rgba(0,0,0,0.12)";
        c2d.lineWidth = 2;
        c2d.beginPath();
        c2d.moveTo(x, DROP_Y);
        c2d.lineTo(x, HEIGHT - WALL);
        c2d.stroke();
        if (since > DROP_COOLDOWN_MS) {
          // 補充されたときにポンと出てきて、待機中はゆらゆら
          const s = popScale((since - DROP_COOLDOWN_MS) / 250);
          const bob = Math.sin(now / 300) * 3;
          drawFruit(c2d, currentRef.current, x, DROP_Y + bob, Math.sin(now / 500) * 0.1, s, s);
        }
      }

      // フルーツ & ゲームオーバー判定
      let danger = false;
      for (const body of Matter.Composite.allBodies(engine.world) as FruitBody[]) {
        if (body.fruitLevel === undefined) continue;

        // ぷるぷるバネ
        body.wobV = ((body.wobV ?? 0) - (body.wob ?? 0) * 0.3) * 0.82;
        body.wob = Math.max(-0.3, Math.min(0.3, (body.wob ?? 0) + body.wobV));
        const pop = body.popAt ? popScale((now - body.popAt) / SPAWN_ANIM_MS) : 1;
        const w = body.wob;

        const top = body.position.y - FRUITS[body.fruitLevel].radius;
        const settled = now - (body.bornAt ?? now) > 1000;
        let jitter = 0;
        if (settled && top < DANGER_Y && !gameOverRef.current) {
          body.overSince ??= now;
          danger = true;
          // 危ないフルーツは焦ってガタガタ震える
          const t = (now - body.overSince) / GAME_OVER_MS;
          jitter = (Math.random() - 0.5) * 4 * t;
          if (now - body.overSince > GAME_OVER_MS) {
            gameOverRef.current = true;
            setGameOver(true);
            fx.shake += 15;
            fx.flash = 0.5;
            playBoom(1);
            Matter.Runner.stop(runner);
            if (scoreRef.current > readBest()) {
              writeBest(scoreRef.current);
              setBest(scoreRef.current);
            }
          }
        } else if (!gameOverRef.current) {
          body.overSince = null;
        }

        drawFruit(
          c2d,
          body.fruitLevel,
          body.position.x + jitter,
          body.position.y,
          body.angle,
          pop * (1 + w),
          pop * (1 - w),
          body.overSince ? 1 : 0,
        );
      }
      if (danger && !gameOverRef.current) {
        c2d.fillStyle = `rgba(230, 57, 70, ${0.08 + 0.06 * Math.sin(now / 100)})`;
        c2d.fillRect(WALL, 0, WIDTH - WALL * 2, DANGER_Y);
      }

      // 衝撃波リング
      fx.rings = fx.rings.filter((r) => r.life > 0);
      for (const r of fx.rings) {
        r.r += (r.maxR - r.r) * 0.15;
        r.life -= 0.04;
        c2d.globalAlpha = Math.max(r.life, 0);
        c2d.strokeStyle = r.color;
        c2d.lineWidth = 6 * r.life + 1;
        c2d.beginPath();
        c2d.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        c2d.stroke();
      }
      c2d.globalAlpha = 1;

      // パーティクル
      particlesRef.current = particlesRef.current.filter((p) => p.life > 0);
      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy += 0.15;
        p.life -= 0.022;
        p.spin += 0.2;
        c2d.globalAlpha = Math.max(p.life, 0);
        c2d.fillStyle = p.star ? "#ffd60a" : p.color;
        if (p.star) {
          drawStar(c2d, p.x, p.y, 4 + p.life * 5, p.spin);
        } else {
          c2d.beginPath();
          c2d.arc(p.x, p.y, 3 + p.life * 3, 0, Math.PI * 2);
          c2d.fill();
        }
      }
      c2d.globalAlpha = 1;

      // スコア・コンボのポップアップ
      popupsRef.current = popupsRef.current.filter((p) => p.life > 0);
      c2d.textAlign = "center";
      c2d.textBaseline = "middle";
      for (const p of popupsRef.current) {
        p.y -= 0.8;
        p.life -= 0.02;
        const grow = popScale((1.2 - p.life) * 6);
        c2d.globalAlpha = Math.min(Math.max(p.life, 0), 1);
        c2d.font = `900 ${p.size * grow}px system-ui, sans-serif`;
        c2d.lineWidth = 5;
        c2d.strokeStyle = "#fff";
        c2d.strokeText(p.text, p.x, p.y);
        c2d.fillStyle = p.color;
        c2d.fillText(p.text, p.x, p.y);
      }
      c2d.globalAlpha = 1;

      // 新フルーツ解放バナー
      if (fx.banner) {
        const t = (now - fx.banner.start) / 1800;
        if (t >= 1) {
          fx.banner = null;
        } else {
          const s = t < 0.2 ? popScale(t / 0.2) : 1;
          const alpha = t > 0.8 ? (1 - t) / 0.2 : 1;
          c2d.save();
          c2d.globalAlpha = alpha;
          c2d.fillStyle = "rgba(255,255,255,0.75)";
          c2d.fillRect(WALL, HEIGHT / 2 - 70, WIDTH - WALL * 2, 140);
          c2d.translate(WIDTH / 2, HEIGHT / 2);
          c2d.scale(s, s);
          c2d.font = `72px ${EMOJI_FONT}`;
          c2d.fillText(fx.banner.emoji, 0, -18);
          c2d.font = "900 26px system-ui, sans-serif";
          c2d.lineWidth = 5;
          c2d.strokeStyle = "#fff";
          const label = `NEW! ${fx.banner.name}`;
          c2d.strokeText(label, 0, 44);
          c2d.fillStyle = "#e85d04";
          c2d.fillText(label, 0, 44);
          c2d.restore();
        }
      }

      // フラッシュ
      if (fx.flash > 0.01) {
        c2d.fillStyle = `rgba(255,255,255,${fx.flash})`;
        c2d.fillRect(-40, -40, WIDTH + 80, HEIGHT + 80);
        fx.flash *= 0.85;
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      Matter.Runner.stop(runner);
      Matter.Events.off(engine, "collisionStart");
      Matter.Engine.clear(engine);
      engineRef.current = null;
    };
  }, [runId, addScore, burst, createFruit]);

  const toCanvasX = (clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return WIDTH / 2;
    return ((clientX - rect.left) / rect.width) * WIDTH;
  };

  const drop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || gameOverRef.current) return;
    const now = performance.now();
    if (now - lastDropRef.current < DROP_COOLDOWN_MS) return;
    lastDropRef.current = now;
    const level = currentRef.current;
    const x = clampX(pointerXRef.current, FRUITS[level].radius);
    const body = createFruit(level, x, DROP_Y);
    body.wob = -0.15;
    Matter.Composite.add(engine.world, body);
    playDrop();
    currentRef.current = nextRef.current;
    nextRef.current = randomDroppable();
    setCurrent(currentRef.current);
    setNext(nextRef.current);
  }, [createFruit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") pointerXRef.current -= 20;
      else if (e.key === "ArrowRight") pointerXRef.current += 20;
      else if (e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        drop();
        return;
      } else return;
      pointerXRef.current = Math.min(Math.max(pointerXRef.current, WALL), WIDTH - WALL);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drop]);

  const restart = () => {
    gameOverRef.current = false;
    scoreRef.current = 0;
    particlesRef.current = [];
    popupsRef.current = [];
    lastDropRef.current = 0;
    maxLevelRef.current = 0;
    fxRef.current = newFx();
    currentRef.current = randomDroppable();
    nextRef.current = randomDroppable();
    setCurrent(currentRef.current);
    setNext(nextRef.current);
    setScore(0);
    setMaxLevel(0);
    setGameOver(false);
    setRunId((r) => r + 1);
  };

  return (
    <div className="flex w-full max-w-[860px] flex-col items-center gap-6 md:flex-row md:items-start md:justify-center">
      <div className="relative w-full max-w-[420px] select-none">
        <canvas
          ref={canvasRef}
          className="block aspect-[420/640] w-full touch-none rounded-3xl shadow-[0_12px_0_#a8693a,0_20px_40px_rgba(0,0,0,0.25)]"
          onPointerMove={(e) => {
            pointerXRef.current = toCanvasX(e.clientX);
          }}
          onPointerDown={(e) => {
            pointerXRef.current = toCanvasX(e.clientX);
          }}
          onPointerUp={drop}
        />
        {gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-3xl bg-black/55 text-white backdrop-blur-sm">
            <p className="text-5xl font-black tracking-wider">GAME OVER</p>
            <p className="text-2xl">
              スコア <span className="font-black text-yellow-300">{score}</span>
            </p>
            <p className="text-lg">
              最高到達: {FRUITS[maxLevel].emoji} {FRUITS[maxLevel].name}
            </p>
            {score >= best && score > 0 && <p className="animate-bounce text-xl">🏆 ベスト更新！</p>}
            <button
              onClick={restart}
              className="mt-2 rounded-full bg-yellow-400 px-8 py-3 text-xl font-bold text-amber-900 shadow-[0_5px_0_#b7791f] transition active:translate-y-1 active:shadow-none"
            >
              もう一回！
            </button>
          </div>
        )}
      </div>

      <aside className="flex w-full max-w-[420px] flex-col gap-4 md:w-64">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          <Panel label="SCORE" value={score} />
          <Panel label="BEST" value={Math.max(best, score)} />
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-white/80 p-4 shadow-md">
          <div className="text-center">
            <p className="text-xs font-bold text-amber-700">いま</p>
            <p className="text-4xl">{FRUITS[current].emoji}</p>
          </div>
          <span className="text-2xl text-amber-400">←</span>
          <div className="text-center">
            <p className="text-xs font-bold text-amber-700">つぎ</p>
            <p className="text-4xl">{FRUITS[next].emoji}</p>
          </div>
        </div>
        <div className="rounded-2xl bg-white/80 p-4 shadow-md">
          <p className="mb-2 text-xs font-bold text-amber-700">しんかの輪</p>
          <div className="flex flex-wrap gap-1 text-2xl">
            {FRUITS.map((f, i) => (
              <span
                key={f.name}
                title={f.name}
                className={i <= maxLevel ? "" : "opacity-25 grayscale"}
              >
                {f.emoji}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-white/60 p-4 text-sm leading-relaxed text-amber-900">
          <p>🖱️ クリック / タップで落とす</p>
          <p>⌨️ ← → で移動、スペースで落とす</p>
          <p>同じフルーツをくっつけると進化！🍉同士で大ボーナス</p>
        </div>
        <button
          onClick={restart}
          className="rounded-full border-2 border-amber-600 px-4 py-2 font-bold text-amber-700 transition hover:bg-amber-100"
        >
          リセット
        </button>
      </aside>
    </div>
  );
}

function Panel({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/80 p-4 shadow-md">
      <p className="text-xs font-bold text-amber-700">{label}</p>
      <p className="text-3xl font-black tabular-nums text-amber-900">{value}</p>
    </div>
  );
}

function clampX(x: number, r: number) {
  return Math.min(Math.max(x, WALL + r), WIDTH - WALL - r);
}

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

// 0→1 で少し行き過ぎてから戻る（easeOutBack）
function popScale(t: number) {
  if (t >= 1) return 1;
  if (t <= 0) return 0.3;
  const c = 2.2;
  const e = 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  return 0.3 + 0.7 * e;
}

function drawStar(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}

function drawFruit(
  c: CanvasRenderingContext2D,
  level: number,
  x: number,
  y: number,
  angle: number,
  sx: number,
  sy: number,
  panic = 0,
) {
  const f = FRUITS[level];
  c.save();
  c.translate(x, y);
  // 潰れ・伸びは画面基準でかけてから回転させる
  c.scale(sx, sy);
  c.rotate(angle);
  c.fillStyle = f.color;
  c.beginPath();
  c.arc(0, 0, f.radius, 0, Math.PI * 2);
  c.fill();
  if (panic) {
    c.strokeStyle = "rgba(230,57,70,0.8)";
    c.lineWidth = 4;
    c.stroke();
  }
  // ハイライト
  c.fillStyle = "rgba(255,255,255,0.35)";
  c.beginPath();
  c.arc(-f.radius * 0.35, -f.radius * 0.35, f.radius * 0.3, 0, Math.PI * 2);
  c.fill();
  c.font = `${f.radius * 1.3}px ${EMOJI_FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(f.emoji, 0, f.radius * 0.08);
  c.restore();
}
