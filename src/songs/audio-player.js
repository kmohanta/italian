/**
 * Optional audio: browser text-to-speech and local audio files.
 *
 * Everything here degrades gracefully. If speech synthesis is not
 * available, read-aloud buttons are hidden and every other feature keeps
 * working. Local audio files are played through an object URL created in
 * the browser; they are never uploaded, copied or stored.
 */

export function speechAvailable() {
  return typeof globalThis.speechSynthesis !== 'undefined' && typeof globalThis.SpeechSynthesisUtterance !== 'undefined';
}

let voicesCache = [];
export function italianVoices() {
  if (!speechAvailable()) return [];
  const all = globalThis.speechSynthesis.getVoices();
  if (all.length) voicesCache = all;
  return voicesCache.filter((v) => /^it([-_]|$)/i.test(v.lang));
}

/** Resolve when the browser has loaded its voice list (some load asynchronously). */
export function whenVoicesReady(timeout = 1500) {
  return new Promise((resolve) => {
    if (!speechAvailable()) return resolve([]);
    const now = italianVoices();
    if (now.length || globalThis.speechSynthesis.getVoices().length) return resolve(now);
    const done = () => resolve(italianVoices());
    globalThis.speechSynthesis.addEventListener?.('voiceschanged', done, { once: true });
    setTimeout(done, timeout);
  });
}

/**
 * Speak Italian text. Returns a promise that resolves when speech ends
 * (or immediately if speech is unavailable).
 */
export function speak(text, { rate = 0.9, voiceURI = '', onBoundary } = {}) {
  if (!speechAvailable() || !text) return Promise.resolve(false);
  const synth = globalThis.speechSynthesis;
  synth.cancel();
  const u = new globalThis.SpeechSynthesisUtterance(text);
  u.lang = 'it-IT';
  u.rate = rate;
  const voices = italianVoices();
  const voice = voices.find((v) => v.voiceURI === voiceURI) || voices[0];
  if (voice) u.voice = voice;
  if (onBoundary) u.onboundary = onBoundary;
  return new Promise((resolve) => {
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    synth.speak(u);
  });
}

export function stopSpeaking() {
  if (speechAvailable()) globalThis.speechSynthesis.cancel();
}

/**
 * A small controller around an <audio> element for a local file chosen by
 * the learner. The file stays on the device.
 */
export function createLocalAudio(audioEl) {
  let objectUrl = null;
  return {
    load(file) {
      if (!file) return false;
      if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i.test(file.name)) return false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      audioEl.src = objectUrl;
      audioEl.load();
      return true;
    },
    setRate(rate) {
      audioEl.playbackRate = rate;
    },
    /** Jump back a few seconds (useful for repeating a line). */
    rewind(seconds = 5) {
      audioEl.currentTime = Math.max(0, audioEl.currentTime - seconds);
    },
    unload() {
      audioEl.pause();
      audioEl.removeAttribute('src');
      audioEl.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };
}
