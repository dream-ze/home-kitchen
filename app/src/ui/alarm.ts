// 计时到点的铃声。iPhone 上声音要在一次点击里"解锁"，所以点"开始计时"或任意位置时先调用 unlockAudio。
// 应用在后台时网页不能出声，切回来后由界面显示"时间到"。
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** 响三组"嘀嘀"，大约 3 秒 */
export function ring(): void {
  unlockAudio();
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + 0.05;
  for (let g = 0; g < 3; g++) {
    for (let b = 0; b < 2; b++) {
      const start = t0 + g * 1 + b * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.4, start + 0.02);
      gain.gain.linearRampToValueAtTime(0, start + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    }
  }
}
