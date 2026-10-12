"use client";

import { useEffect, useRef } from "react";

// A synthesized mechanical click on every button press — not a reproduction
// of any copyrighted game audio (that would require ripping an actual asset
// file), just a short two-part "knock + thunk" built from oscillators run
// through a lowpass filter for warmth, aiming for the same deep, thick,
// satisfying old-client feel (think the old League client's button sound)
// rather than a thin digital beep. Delegated to a single document-level
// listener so no individual button needs wiring.
export default function ButtonSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const getContext = () => {
      if (!ctxRef.current) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctxRef.current = new Ctor();
      }
      return ctxRef.current;
    };

    const schedule = (ctx: AudioContext) => {
      const now = ctx.currentTime;

      // A soft lowpass on everything is what keeps this feeling "thick" and
      // wooden instead of thin/digital — it rounds off the harmonics that
      // would otherwise read as a beep.
      const warmth = ctx.createBiquadFilter();
      warmth.type = "lowpass";
      warmth.frequency.setValueAtTime(750, now);
      warmth.Q.value = 0.7;
      warmth.connect(ctx.destination);

      // Brief low "knock" transient — the attack, not a high-pitched tick
      const knock = ctx.createOscillator();
      const knockGain = ctx.createGain();
      knock.type = "triangle";
      knock.frequency.setValueAtTime(260, now);
      knock.frequency.exponentialRampToValueAtTime(95, now + 0.035);
      knockGain.gain.setValueAtTime(0.22, now);
      knockGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.045);
      knock.connect(knockGain).connect(warmth);
      knock.start(now);
      knock.stop(now + 0.05);

      // Deep, slightly delayed body — the "thunk" that gives it real weight
      const thunk = ctx.createOscillator();
      const thunkGain = ctx.createGain();
      thunk.type = "sine";
      thunk.detune.setValueAtTime(-5, now);
      thunk.frequency.setValueAtTime(130, now + 0.006);
      thunk.frequency.exponentialRampToValueAtTime(66, now + 0.15);
      thunkGain.gain.setValueAtTime(0.3, now + 0.008);
      thunkGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.19);
      thunk.connect(thunkGain).connect(warmth);
      thunk.start(now + 0.006);
      thunk.stop(now + 0.2);

      // A sub-octave layer underneath, decaying slower than the main thunk —
      // two flat sine tones decaying in lockstep read as "flat"; staggering
      // a deeper layer under it is what gives the click a sense of depth.
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = "sine";
      sub.detune.setValueAtTime(4, now);
      sub.frequency.setValueAtTime(62, now + 0.014);
      sub.frequency.exponentialRampToValueAtTime(36, now + 0.2);
      subGain.gain.setValueAtTime(0, now + 0.014);
      subGain.gain.linearRampToValueAtTime(0.2, now + 0.03);
      subGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.26);
      sub.connect(subGain).connect(warmth);
      sub.start(now + 0.014);
      sub.stop(now + 0.27);
    };

    const playClick = () => {
      const ctx = getContext();
      // ctx.resume() is async and ctx.currentTime stays frozen while
      // suspended (Chrome auto-suspends an idle AudioContext after ~30s, so
      // this isn't just a first-click thing) — scheduling the oscillators
      // immediately against that frozen time meant their start/stop window
      // had often already elapsed by the time resume() actually completed,
      // so nothing audible came out. Only schedule once truly running.
      if (ctx.state === "suspended") {
        ctx.resume().then(() => schedule(ctx));
      } else {
        schedule(ctx);
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // Several nav items (Study/Progress/Browse/Interview, course-bar
      // pills) are Next.js <Link>s styled as buttons, not <button>
      // elements — without including `a` here they silently stayed silent.
      const control = target?.closest("button, a");
      if (!control) return;
      if (control instanceof HTMLButtonElement && control.disabled) return;
      playClick();
    };

    document.addEventListener("click", onPointerDown, true);
    return () => document.removeEventListener("click", onPointerDown, true);
  }, []);

  return null;
}
