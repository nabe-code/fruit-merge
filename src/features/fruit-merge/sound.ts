let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  return ctx;
}

// レベルが上がるほど高い音でポンッと鳴らす
export function playPop(level: number) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const base = 220 * Math.pow(2, level / 4);
  osc.type = "triangle";
  osc.frequency.setValueAtTime(base, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(base * 2, ac.currentTime + 0.08);
  gain.gain.setValueAtTime(0.18, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.25);
}

export function playDrop() {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(500, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(180, ac.currentTime + 0.12);
  gain.gain.setValueAtTime(0.1, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.15);
}

// 大きい合体用のドーン音（ノイズ + 低音）
export function playBoom(power: number) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const len = 0.5;
  const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 600;
  const nGain = ac.createGain();
  nGain.gain.value = 0.15 * power;
  noise.connect(filter).connect(nGain).connect(ac.destination);
  noise.start(t);

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + len);
  gain.gain.setValueAtTime(0.3 * power, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + len);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + len);
}

// 新しいフルーツ解放のファンファーレ
export function playFanfare() {
  const ac = audio();
  if (!ac) return;
  [523, 659, 784, 1047].forEach((freq, i) => {
    const t = ac.currentTime + i * 0.09;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}
