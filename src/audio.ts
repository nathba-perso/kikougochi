// Petits sons synthétisés (Web Audio), sans fichier à charger.
let ac: AudioContext | null = null;
function ctx() {
  if (!ac) { const C = window.AudioContext || (window as any).webkitAudioContext; if (C) ac = new C(); }
  if (ac?.state === 'suspended') ac.resume();
  return ac;
}
/** À appeler lors d'un premier toucher pour débloquer le son sur iPhone. */
export function unlockAudio() { ctx(); }

export function kissSound() {
  const a = ctx(); if (!a) return;
  const t = a.currentTime;
  // « smack » : bruit très court filtré + petit glissando
  const len = Math.floor(a.sampleRate * 0.06);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const n = a.createBufferSource(); n.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.2;
  const g = a.createGain(); g.gain.value = 0.9;
  n.connect(f).connect(g).connect(a.destination); n.start(t + 0.02);
  const o = a.createOscillator(); const og = a.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(1400, t + 0.12);
  og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.25, t + 0.02); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(og).connect(a.destination); o.start(t); o.stop(t + 0.2);
}

export function blip(freq = 660, dur = 0.08, vol = 0.12) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = 'square'; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
export function jingle(notes: number[], step = 0.12) {
  notes.forEach((f, i) => setTimeout(() => blip(f, step * 0.9, 0.1), i * step * 1000));
}
