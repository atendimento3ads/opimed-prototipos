/* =========================================================
   Motor de áudio do protótipo "Qual som combina com você?"

   Cada cena é montada em Web Audio a partir de falas gravadas
   (audio/*.m4a) + sons de ambiente sintetizados, e renderizada
   DUAS vezes (OfflineAudioContext), uma por perfil:
     natural    → ambiente preservado, timbre cheio, compressão leve
     aprimorado → fala em destaque, ruído de fundo reduzido, mais compressão
   As duas versões têm o mesmo volume médio (RMS igualado) e tocam
   em sincronia; o botão A/B só troca qual delas se ouve (crossfade).

   Na versão final, as cenas/perfis viram gravações reais feitas
   através dos aparelhos (fornecidas pelos fabricantes ou gravadas
   em estúdio); o player e a lógica continuam os mesmos.
   ========================================================= */
(function () {
  "use strict";

  const SR = 44100;

  // PRNG com semente: as duas versões de uma cena saem idênticas, só muda o perfil
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const PROFILES = {
    natural: {
      speech: 1, amb: 1, music: 1,
      warmth: 3, presence: 1.5, presenceF: 2800, air: 3.5,
      ambHP: 20, width: 1, reverb: 1,
      comp: { threshold: -16, ratio: 1.8, knee: 14, attack: 0.02, release: 0.3 }
    },
    aprimorado: {
      speech: 1.25, amb: 0.34, music: 1,
      warmth: -3.5, presence: 8, presenceF: 2300, air: -1.5,
      ambHP: 380, width: 0.55, reverb: 0.45,
      comp: { threshold: -30, ratio: 4.5, knee: 6, attack: 0.004, release: 0.18 }
    }
  };

  /* ---------- Ruídos-base (gerados uma vez, reaproveitados) ---------- */
  let NOISE = null;
  function noiseBuffers() {
    if (NOISE) return NOISE;
    const len = SR * 3;
    const r = rng(7);
    const white = new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate: SR });
    const pink = new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate: SR });
    const brown = new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate: SR });
    const w = white.getChannelData(0), p = pink.getChannelData(0), b = brown.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const x = r() * 2 - 1;
      w[i] = x;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759;
      b2 = 0.969 * b2 + x * 0.153852; b3 = 0.8665 * b3 + x * 0.3104856;
      b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
      last = (last + 0.02 * x) / 1.02; b[i] = last * 3.5;
    }
    NOISE = { white, pink, brown };
    return NOISE;
  }

  function impulse(seconds, decay) {
    const len = Math.floor(SR * seconds);
    const r = rng(99);
    const buf = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: SR });
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /* ---------- Kit de montagem dentro de um OfflineAudioContext ---------- */
  function makeKit(oc, prof, seed) {
    const r = rng(seed);
    const N = noiseBuffers();

    const comp = oc.createDynamicsCompressor();
    Object.entries(prof.comp).forEach(([k, v]) => { comp[k].value = v; });
    const makeup = oc.createGain();
    makeup.gain.value = 1;
    comp.connect(makeup).connect(oc.destination);

    const low = new BiquadFilterNode(oc, { type: "lowshelf", frequency: 220, gain: prof.warmth });
    const pres = new BiquadFilterNode(oc, { type: "peaking", frequency: prof.presenceF, Q: 0.85, gain: prof.presence });
    const air = new BiquadFilterNode(oc, { type: "highshelf", frequency: 6500, gain: prof.air });
    low.connect(pres).connect(air).connect(comp);
    const mix = new GainNode(oc, { gain: 1 });
    mix.connect(low);

    const rev = new ConvolverNode(oc, { buffer: impulse(1.9, 2.6) });
    const revOut = new GainNode(oc, { gain: 0.32 * prof.reverb });
    rev.connect(revOut).connect(mix);

    const bus = {
      speech: new GainNode(oc, { gain: prof.speech }),
      amb: new GainNode(oc, { gain: prof.amb }),
      music: new GainNode(oc, { gain: prof.music })
    };
    const ambHP = new BiquadFilterNode(oc, { type: "highpass", frequency: prof.ambHP, Q: 0.6 });
    bus.speech.connect(mix);
    bus.amb.connect(ambHP).connect(mix);
    bus.music.connect(mix);

    // monta: fonte → [filtros] → ganho → pan → bus (+ envio de reverb)
    function route(src, o, t) {
      let node = src;
      (o.filters || []).forEach((f) => {
        const bf = new BiquadFilterNode(oc, { type: f.type, frequency: f.f, Q: f.Q ?? 0.707, gain: f.gain ?? 0 });
        node.connect(bf); node = bf;
      });
      const g = new GainNode(oc, { gain: o.gain ?? 1 });
      const p = new StereoPannerNode(oc, { pan: Math.max(-1, Math.min(1, (o.pan || 0) * prof.width)) });
      node.connect(g).connect(p).connect(bus[o.bus || "amb"]);
      if (o.rev) {
        const s = new GainNode(oc, { gain: o.rev });
        p.connect(s).connect(rev);
      }
      return g;
    }

    return {
      r,
      clip(buf, t, o = {}) {
        const s = new AudioBufferSourceNode(oc, { buffer: buf, playbackRate: o.rate || 1 });
        route(s, o, t);
        s.start(t);
        return buf.duration / (o.rate || 1);
      },
      noise(t, dur, o = {}) {
        const s = new AudioBufferSourceNode(oc, { buffer: N[o.color || "white"], loop: true, loopStart: 0, loopEnd: 3 });
        const g = route(s, o, t);
        const lvl = o.gain ?? 1;
        const a = o.attack ?? 0.4, rl = o.release ?? 0.6;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(lvl, t + a);
        if (o.wobble) {
          // variação lenta de nível (vento, tráfego)
          const steps = Math.max(2, Math.floor(dur / o.wobble));
          for (let i = 1; i < steps; i++) {
            g.gain.linearRampToValueAtTime(lvl * (0.45 + r() * 0.9), t + a + (dur - a - rl) * (i / steps));
          }
        }
        g.gain.linearRampToValueAtTime(lvl * 0.85, Math.max(t + a, t + dur - rl));
        g.gain.linearRampToValueAtTime(0, t + dur);
        s.start(t, r() * 2);
        s.stop(t + dur + 0.05);
      },
      // grupo já roteado (pan/bus/reverb): várias notas dividem os mesmos nós
      group(o = {}) {
        const input = new GainNode(oc, { gain: 1 });
        route(input, o);
        return input;
      },
      tone(t, freq, dur, o = {}) {
        const osc = new OscillatorNode(oc, { type: o.type || "sine", frequency: freq });
        if (o.sweepTo) {
          osc.frequency.setValueAtTime(freq, t);
          osc.frequency.exponentialRampToValueAtTime(o.sweepTo, t + dur);
        }
        let g;
        if (o.dest) { g = new GainNode(oc, { gain: 0 }); osc.connect(g).connect(o.dest); }
        else g = route(osc, o, t);
        const lvl = o.gain ?? 0.2;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(lvl, t + (o.attack ?? 0.005));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
    };
  }

  /* ---------- Piano sintetizado (aditivo, com decaimento por harmônico) ---------- */
  function pianoNote(k, t, midi, dur, vel, dest) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    for (let n = 1; n <= 6; n++) {
      const fn = f * n * (1 + 0.00035 * n * n);
      if (fn > 11000) break;
      const amp = (vel * 0.16) / Math.pow(n, 1.35);
      const decay = Math.min(dur + 0.9, 3.2 / Math.sqrt(n));
      k.tone(t, fn, decay, { dest, gain: amp, attack: 0.004 });
    }
  }

  /* ---------- Cenas ---------- */
  const SCENES = [
    {
      id: "restaurante",
      title: "Jantar em um restaurante",
      intro: "Você está à mesa em um restaurante movimentado quando o garçom chega para apresentar o prato do dia.",
      tip: "Compare como a voz do garçom se destaca das conversas das outras mesas e do barulho de talheres. Repare no que fica mais fácil de entender e no que parece mais confortável.",
      duration: 19,
      clips: ["garcom", "babble1", "babble2", "babble3", "babble4"],
      build(k, C) {
        const r = k.r;
        k.noise(0, 19, { color: "pink", gain: 0.06, filters: [{ type: "lowpass", f: 1100 }], wobble: 3 });
        const pans = [-0.85, -0.45, 0.55, 0.9];
        ["babble1", "babble2", "babble3", "babble4"].forEach((name, i) => {
          let t = r() * 1.5;
          while (t < 18) {
            const d = k.clip(C[name], t, {
              gain: 0.16, pan: pans[i] + (r() - 0.5) * 0.2, rate: 0.94 + r() * 0.12, rev: 0.5,
              filters: [{ type: "lowpass", f: 2600 }, { type: "highpass", f: 180 }]
            });
            t += d + 0.3 + r() * 1.2;
          }
        });
        for (let i = 0; i < 18; i++) {
          const t = r() * 18.4, f = 2400 + r() * 2800, p = (r() - 0.5) * 1.6;
          k.tone(t, f, 0.32, { gain: 0.035 + r() * 0.04, pan: p, rev: 0.4 });
          k.tone(t, f * 2.76, 0.18, { gain: 0.015, pan: p });
        }
        k.clip(C.garcom, 2.0, { bus: "speech", gain: 0.95, pan: 0.08, rev: 0.12 });
      }
    },
    {
      id: "parque",
      title: "Conversa no parque",
      intro: "Você caminha com uma amiga em um parque. Há vento nas árvores, pássaros e o trânsito ao longe.",
      tip: "Compare quão naturais parecem os pássaros e o vento, e quão clara fica a conversa entre as duas amigas.",
      duration: 21,
      clips: ["parque1", "parque2", "parque3"],
      build(k, C) {
        const r = k.r;
        k.noise(0, 21, { color: "brown", gain: 0.11, filters: [{ type: "lowpass", f: 320 }], wobble: 2.5 });
        k.noise(0, 21, { color: "pink", gain: 0.07, filters: [{ type: "bandpass", f: 700, Q: 0.5 }], wobble: 1.6, pan: -0.3 });
        k.noise(0, 21, { color: "white", gain: 0.012, filters: [{ type: "highpass", f: 4200 }], wobble: 0.9, pan: 0.4 });
        for (let b = 0; b < 11; b++) {
          let t = r() * 19.5;
          const base = 3200 + r() * 2600, p = (r() - 0.5) * 1.8, n = 2 + Math.floor(r() * 5);
          for (let i = 0; i < n; i++) {
            const up = r() > 0.4;
            const d = 0.06 + r() * 0.08;
            k.tone(t, base * (up ? 0.85 : 1.15), d, { sweepTo: base * (up ? 1.25 : 0.8), gain: 0.05 + r() * 0.04, pan: p, rev: 0.3 });
            t += d + 0.04 + r() * 0.1;
          }
        }
        const t1 = 1.2;
        const d1 = k.clip(C.parque1, t1, { bus: "speech", gain: 0.85, pan: -0.35, rev: 0.06 });
        const t2 = t1 + d1 + 0.35;
        const d2 = k.clip(C.parque2, t2, { bus: "speech", gain: 0.82, pan: 0.4, rev: 0.06 });
        k.clip(C.parque3, t2 + d2 + 0.4, { bus: "speech", gain: 0.85, pan: -0.35, rev: 0.06 });
      }
    },
    {
      id: "cozinha",
      title: "Cozinhando com o rádio ligado",
      intro: "Você prepara o almoço com o rádio ligado na bancada. A panela chia, a torneira abre e alguém chama da sala.",
      tip: "Repare em como os sons da cozinha aparecem e em quão fácil é acompanhar o locutor do rádio e entender quem chama da sala.",
      duration: 21,
      clips: ["radio", "neto"],
      build(k, C) {
        const r = k.r;
        k.noise(0, 21, { color: "white", gain: 0.01, filters: [{ type: "highpass", f: 2600 }, { type: "lowpass", f: 9000 }], pan: -0.45 });
        for (let i = 0; i < 220; i++) {
          k.noise(r() * 20.5, 0.02 + r() * 0.03, { color: "white", gain: 0.025 + r() * 0.05, attack: 0.002, release: 0.012, filters: [{ type: "highpass", f: 1800 + r() * 2500 }], pan: -0.45 + (r() - 0.5) * 0.3 });
        }
        k.noise(5.2, 4.3, { color: "pink", gain: 0.13, filters: [{ type: "bandpass", f: 1500, Q: 0.6 }], attack: 0.15, release: 0.25, pan: -0.15, rev: 0.2 });
        [3.1, 10.6, 12.4, 18.2].forEach((t) => {
          const f = 1700 + r() * 1500;
          k.tone(t, f, 0.4, { gain: 0.07, pan: 0.2, rev: 0.4 });
          k.tone(t + 0.07, f * 1.48, 0.3, { gain: 0.04, pan: 0.2 });
          k.noise(t, 0.08, { color: "white", gain: 0.12, attack: 0.002, release: 0.05, filters: [{ type: "bandpass", f: 3000, Q: 1.2 }], pan: 0.2 });
        });
        k.clip(C.radio, 0.7, { bus: "speech", gain: 0.62, pan: 0.5, filters: [{ type: "highpass", f: 260 }, { type: "lowpass", f: 4200 }, { type: "peaking", f: 1200, Q: 1, gain: 3 }] });
        k.clip(C.neto, 16.1, { bus: "speech", gain: 0.55, pan: -0.7, rev: 0.6, filters: [{ type: "lowpass", f: 3800 }] });
      }
    },
    {
      id: "musica",
      title: "Música na sala",
      intro: "Você relaxa no sofá ouvindo uma melodia ao piano.",
      tip: "Compare a riqueza do som, o equilíbrio entre graves e agudos e o quanto a música parece natural e agradável para você.",
      duration: 20,
      clips: [],
      build(k) {
        const e = 0.27; // colcheia (s), compasso 12/8
        const chords = {
          Eb: [39, [55, 58, 63]], Ab: [44, [56, 60, 63]], Bb7: [46, [53, 56, 62]], Cm: [48, [55, 60, 63]]
        };
        const bars = [
          ["Eb", [[79, 3], [77, 1], [79, 1], [77, 1], [75, 4], [70, 2]]],
          ["Ab", [[84, 3], [82, 1], [80, 1], [79, 1], [80, 4], [75, 2]]],
          ["Bb7", [[74, 2], [77, 2], [82, 2], [80, 3], [79, 1], [77, 2]]],
          ["Eb", [[79, 6], [75, 3], [70, 3]]],
          ["Cm", [[75, 2], [79, 2], [84, 2], [82, 3], [80, 1], [79, 2]]],
          ["Ab|Bb7", [[77, 3], [80, 1], [79, 1], [77, 1], [74, 3], [77, 3]]],
          ["Eb", [[75, 12]]]
        ];
        const lh = k.group({ bus: "music", pan: -0.25, rev: 0.55 });
        const mid = k.group({ bus: "music", pan: 0, rev: 0.55 });
        const rh = k.group({ bus: "music", pan: 0.2, rev: 0.55 });
        let t = 0.4;
        bars.forEach(([ch, mel], bi) => {
          const parts = ch.split("|");
          for (let g = 0; g < 4; g++) {
            const c = chords[parts[parts.length > 1 && g >= 2 ? 1 : 0]];
            const gt = t + g * 3 * e;
            if (bi === bars.length - 1 && g > 0) break;
            pianoNote(k, gt, c[0], 3 * e, 0.42, lh);
            pianoNote(k, gt + e, c[1][0], e, 0.2, mid);
            pianoNote(k, gt + e, c[1][1], e, 0.18, mid);
            pianoNote(k, gt + 2 * e, c[1][2], e, 0.18, mid);
          }
          let mt = t;
          mel.forEach(([m, d]) => { pianoNote(k, mt, m, d * e, 0.62, rh); mt += d * e; });
          t += 12 * e;
        });
      }
    }
  ];

  /* ---------- Carregamento e renderização ---------- */
  const clipCache = {};
  async function loadClip(ctx, name, base) {
    if (!clipCache[name]) {
      clipCache[name] = fetch(`${base}${name}.m4a`)
        .then((r) => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); })
        .then((ab) => ctx.decodeAudioData(ab));
    }
    return clipCache[name];
  }

  function rms(buf) {
    let s = 0, n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i += 4) { s += d[i] * d[i]; n++; }
    }
    return Math.sqrt(s / n);
  }
  function peak(buf) {
    let p = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > p) p = a; }
    }
    return p;
  }
  function scale(buf, k) {
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
  }

  async function renderScene(ctx, scene, base) {
    const C = {};
    await Promise.all(scene.clips.map(async (n) => { C[n] = await loadClip(ctx, n, base); }));
    const out = {};
    for (const key of ["natural", "aprimorado"]) {
      const oc = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(SR * scene.duration), sampleRate: SR });
      const kit = makeKit(oc, PROFILES[key], 1234 + scene.id.length * 17);
      scene.build(kit, C);
      out[key] = await oc.startRendering();
    }
    // mesmo volume médio nas duas versões e um teto de pico comum
    const target = 0.085;
    const kn = target / (rms(out.natural) || 1), ka = target / (rms(out.aprimorado) || 1);
    const pk = Math.max(peak(out.natural) * kn, peak(out.aprimorado) * ka, 1e-6);
    const lim = pk > 0.95 ? 0.95 / pk : 1;
    scale(out.natural, kn * lim);
    scale(out.aprimorado, ka * lim);
    return out;
  }

  function peaks(buf, bars) {
    const d0 = buf.getChannelData(0), d1 = buf.getChannelData(1);
    const step = Math.floor(d0.length / bars);
    const out = [];
    let max = 0;
    for (let b = 0; b < bars; b++) {
      let s = 0;
      for (let i = b * step; i < (b + 1) * step; i += 8) { const v = (d0[i] + d1[i]) * 0.5; s += v * v; }
      const v = Math.sqrt(s / (step / 8));
      out.push(v); if (v > max) max = v;
    }
    return out.map((v) => Math.pow(v / (max || 1), 0.75));
  }

  /* ---------- Player A/B sincronizado ---------- */
  class ABPlayer {
    constructor(ctx) {
      this.ctx = ctx;
      this.master = new GainNode(ctx, { gain: 0.8 });
      this.master.connect(ctx.destination);
      this.side = "A";
      this.playing = false;
      this.offset = 0;
      this.onTick = null;
      this.onEnd = null;
    }
    load(bufA, bufB) {
      this.stop(true);
      this.buf = { A: bufA, B: bufB };
      this.duration = bufA.duration;
      this.offset = 0;
    }
    setVolume(v) { this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03); }
    play(from) {
      if (!this.buf) return;
      this.stop(true);
      if (typeof from === "number") this.offset = from;
      if (this.offset >= this.duration - 0.05) this.offset = 0;
      const t0 = this.ctx.currentTime + 0.03;
      this.nodes = {};
      ["A", "B"].forEach((s) => {
        const src = new AudioBufferSourceNode(this.ctx, { buffer: this.buf[s] });
        const g = new GainNode(this.ctx, { gain: s === this.side ? 1 : 0 });
        src.connect(g).connect(this.master);
        src.start(t0, this.offset);
        this.nodes[s] = { src, g };
      });
      this.nodes.A.src.onended = () => {
        if (!this.playing || this._stopping) return;
        this.playing = false;
        this.offset = this.duration;
        this.onEnd && this.onEnd();
      };
      this.startedAt = t0 - this.offset;
      this.playing = true;
      const loop = () => {
        if (!this.playing) return;
        this.onTick && this.onTick(this.time());
        this.raf = requestAnimationFrame(loop);
      };
      loop();
    }
    time() { return this.playing ? Math.min(this.duration, Math.max(0, this.ctx.currentTime - this.startedAt)) : this.offset; }
    pause() { if (!this.playing) return; this.offset = this.time(); this.stop(true); }
    stop(keepOffset) {
      this._stopping = true;
      if (this.nodes) Object.values(this.nodes).forEach(({ src }) => { try { src.stop(); } catch (e) {} });
      this.nodes = null;
      this._stopping = false;
      this.playing = false;
      cancelAnimationFrame(this.raf);
      if (!keepOffset) this.offset = 0;
    }
    seek(t) { const was = this.playing; this.offset = Math.max(0, Math.min(this.duration, t)); if (was) this.play(); else this.onTick && this.onTick(this.offset); }
    setSide(s) {
      this.side = s;
      if (!this.nodes) return;
      const now = this.ctx.currentTime;
      ["A", "B"].forEach((k) => {
        const g = this.nodes[k].g.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(k === s ? 1 : 0, now + 0.08);
      });
    }
  }

  window.SoundEngine = { SCENES, renderScene, peaks, ABPlayer, loadClip };
})();
