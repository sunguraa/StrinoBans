export function playBeep(frequency = 880, durationMs = 150, type: OscillatorType = 'sine'): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
    osc.start(now);
    osc.stop(now + durationMs / 1000);
    setTimeout(() => ctx.close().catch(() => undefined), durationMs + 50);
  } catch {
    // ignore audio errors
  }
}

export function playCoinFlipSound(): void {
  playBeep(660, 120, 'square');
  setTimeout(() => playBeep(880, 180, 'sine'), 140);
}

/** Played when any action is confirmed (ban/pick/side) — all peers hear it */
export function playActionSound(actionType: 'ban' | 'pick' | 'side'): void {
  switch (actionType) {
    case 'ban':
      playBeep(330, 200, 'sawtooth'); // low, punchy
      break;
    case 'pick':
      playBeep(550, 180, 'sine');       // pleasant confirmation
      break;
    case 'side':
      playBeep(440, 160, 'triangle');   // distinct from ban/pick
      break;
  }
}

/** Gentle tick at 10s remaining */
export function playTickSound(): void {
  playBeep(880, 50, 'sine'); // soft, short
}

/** Urgent tick at 5s remaining (slightly lower, more insistent) */
export function playUrgentSound(): void {
  playBeep(740, 80, 'square'); // more urgent tone
}