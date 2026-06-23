export function playBeep(frequency = 880, durationMs = 150, type: OscillatorType = 'sine', volume = 0.15): void {
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
    gain.gain.setValueAtTime(volume, now);
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

/** Played when the local player confirms an action (ban/pick/side) — very quiet */
export function playActionSound(actionType: 'ban' | 'pick' | 'side'): void {
  switch (actionType) {
    case 'ban':
      playBeep(330, 200, 'sawtooth', 0.08); // low, punchy, quiet
      break;
    case 'pick':
      playBeep(550, 180, 'sine', 0.08);       // pleasant confirmation, quiet
      break;
    case 'side':
      playBeep(440, 160, 'triangle', 0.08);   // distinct from ban/pick, quiet
      break;
  }
}

/** Clear cue that it is now the local player's turn */
export function playTurnSound(): void {
  playBeep(784, 220, 'sine', 0.18); // G5, clean, slightly longer
}

/** Soft tick at 10s remaining */
export function playTickSound(): void {
  playBeep(880, 50, 'sine', 0.08); // soft, short
}

/** Urgent tick at 5s remaining — used as the base for the rising final-5s sequence */
export function playUrgentSound(pitch = 740): void {
  playBeep(pitch, 80, 'square', 0.12);
}