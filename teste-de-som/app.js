/* =========================================================
   Fluxo do teste: boas-vindas → fones → volume → 4 cenas →
   preferência geral → resultado + captação → confirmação.
   A/B é sorteado a cada cena (teste às cegas); a pontuação
   converte cada escolha para Natural (+) ou Aprimorado (−).
   ========================================================= */
(function () {
  "use strict";

  const { SCENES, renderScene, peaks, ABPlayer } = window.SoundEngine;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const app = $("#teste");

  const UNITS = [
    "Amapá - Macapá", "Amazonas - Manaus", "Ceará - Fortaleza",
    "Distrito Federal - Águas Claras", "Distrito Federal - Brasília (Asa Norte)", "Distrito Federal - Brasília (Asa Sul)",
    "Goiás - Goiânia (Setor Marista)", "Goiás - Goiânia (Setor Oeste)", "Goiás - Anápolis", "Goiás - Catalão",
    "Goiás - Itumbiara", "Goiás - Rio Verde", "Pará - Belém", "Pernambuco - Recife",
    "Rondônia - Porto Velho", "Tocantins - Palmas", "Tocantins - Araguaína"
  ];
  $("[data-units]").insertAdjacentHTML("beforeend", UNITS.map((u) => `<option>${u}</option>`).join(""));

  /* ---------- Estado ---------- */
  let ctx, player, renders = [], ready = null;
  const state = { i: 0, map: [], answers: [], heard: { A: 0, B: 0 }, overall: null };

  function show(name) {
    if (player) player.stop();
    $$(".screen", app).forEach((s) => s.classList.toggle("is-active", s.dataset.screen === name));
    if (name !== "welcome" && app.getBoundingClientRect().top < 0) app.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // O áudio só pode começar depois de um toque do usuário
  function boot() {
    if (ctx) return ready;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    player = new ABPlayer(ctx);
    player.setVolume(+$("[data-volume]").value);
    state.map = SCENES.map(() => (Math.random() < 0.5 ? { A: "natural", B: "aprimorado" } : { A: "aprimorado", B: "natural" }));
    ready = (async () => {
      for (let i = 0; i < SCENES.length; i++) {
        renders[i] = await renderScene(ctx, SCENES[i], "audio/");
        if (i === 0) $("[data-loading]").textContent = "Pronto para ouvir";
      }
    })().catch((e) => {
      console.error(e);
      $("[data-loading]").textContent = "Não foi possível carregar os sons.";
    });
    return ready;
  }

  app.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (!go) return;
    if (go.dataset.go === "fones") boot();
    show(go.dataset.go);
  });
  $$("[data-start-link]").forEach((a) => a.addEventListener("click", () => {
    if ($('[data-screen="welcome"]').classList.contains("is-active")) setTimeout(() => $('[data-go="fones"]').focus(), 500);
  }));

  /* ---------- Volume ---------- */
  const sampleBtn = $("[data-sample]");
  sampleBtn.addEventListener("click", async () => {
    boot();
    if (ctx.state === "suspended") await ctx.resume();
    if (player.playing) { player.stop(); sampleBtn.setAttribute("aria-pressed", "false"); return; }
    $("[data-sample-label]").textContent = "Carregando…";
    while (!renders[0]) await new Promise((r) => setTimeout(r, 120));
    player.onTick = null;
    player.onEnd = () => sampleBtn.setAttribute("aria-pressed", "false");
    player.setSide("A");
    player.load(renders[0].natural, renders[0].natural);
    player.play(1.5);
    sampleBtn.setAttribute("aria-pressed", "true");
    $("[data-sample-label]").textContent = "Tocando amostra";
    $("[data-confirm-volume]").disabled = false;
  });
  $("[data-volume]").addEventListener("input", (e) => player && player.setVolume(+e.target.value));
  $("[data-confirm-volume]").addEventListener("click", async () => {
    player.stop();
    sampleBtn.setAttribute("aria-pressed", "false");
    $("[data-sample-label]").textContent = "Tocar amostra";
    state.i = 0; state.answers = [];
    await openScene(0);
  });

  /* ---------- Cenas ---------- */
  const canvas = $("[data-wave]");
  const playBtn = $("[data-play]");
  const nextBtn = $("[data-next-scene]");
  let wave = { A: [], B: [] };

  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

  async function openScene(i) {
    show("scene");
    const sc = SCENES[i];
    state.i = i;
    state.heard = { A: 0, B: 0 };
    $("[data-scene-count]").textContent = `Cena ${i + 1} de ${SCENES.length}`;
    $("[data-scene-dots]").innerHTML = SCENES.map((_, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("");
    $("[data-scene-title]").textContent = sc.title;
    $("[data-scene-intro]").textContent = sc.intro;
    $("[data-scene-tip]").textContent = sc.tip;
    $("[data-scene-icon]").setAttribute("href", `#sc-${sc.id}`);
    $$('input[name="pref"], input[name="strength"]').forEach((r) => (r.checked = false));
    $("[data-q-pref]").disabled = true;
    $("[data-q-strength]").hidden = true;
    nextBtn.disabled = true;
    nextBtn.innerHTML = i === SCENES.length - 1 ? 'Concluir cenas <svg aria-hidden="true"><use href="#i-arrow"/></svg>' : 'Próxima cena <svg aria-hidden="true"><use href="#i-arrow"/></svg>';
    setSide("A");
    updateHeard();

    if (!renders[i]) { $("[data-heard]").textContent = "Preparando a cena…"; await ready; }
    while (!renders[i]) await new Promise((r) => setTimeout(r, 120));
    const map = state.map[i];
    player.load(renders[i][map.A], renders[i][map.B]);
    const bars = Math.max(48, Math.min(110, Math.floor(canvas.clientWidth / 4.5)));
    wave = { A: peaks(renders[i][map.A], bars), B: peaks(renders[i][map.B], bars) };
    $("[data-time-dur]").textContent = fmt(player.duration);
    player.onTick = (t) => { tickHeard(t); draw(t); $("[data-time-cur]").textContent = fmt(t); };
    player.onEnd = () => { playBtn.classList.remove("is-playing"); liveDot(); draw(player.duration); };
    draw(0);
    updateHeard();
  }

  let lastT = 0;
  function tickHeard(t) {
    const dt = t - lastT;
    if (dt > 0 && dt < 0.5) state.heard[player.side] += dt;
    lastT = t;
    updateHeard();
  }
  function updateHeard() {
    const ok = state.heard.A >= 2 && state.heard.B >= 2;
    const el = $("[data-heard]");
    el.classList.toggle("ok", ok);
    el.textContent = ok ? "Pronto, já pode responder" : state.heard.A >= 2 || state.heard.B >= 2 ? `Agora ouça o Som ${state.heard.A >= 2 ? "B" : "A"}` : "Ouça os dois sons para responder";
    if (ok) $("[data-q-pref]").disabled = false;
  }

  function draw(t) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const data = wave[player.side];
    if (!data.length) return;
    const bw = w / data.length, prog = player.duration ? t / player.duration : 0;
    data.forEach((v, k) => {
      const bh = Math.max(2, v * (h - 6));
      g.fillStyle = k / data.length < prog ? "#252021" : "#d6d0cb";
      g.beginPath();
      g.roundRect(k * bw + bw * 0.2, (h - bh) / 2, Math.max(1.5, bw * 0.6), bh, 2);
      g.fill();
    });
    g.fillStyle = "#84633f";
    g.fillRect(Math.min(w - 2, prog * w), 0, 2, h);
  }
  window.addEventListener("resize", () => player && player.buf && draw(player.time()));

  function liveDot() {
    $$(".ab__btn").forEach((b) => b.classList.toggle("is-live", player.playing && b.dataset.side === player.side));
  }
  function setSide(s) {
    if (player) { player.setSide(s); lastT = player.time(); }
    $$(".ab__btn").forEach((b) => {
      const on = b.dataset.side === s;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", on);
    });
    if (player && player.buf) { draw(player.time()); liveDot(); }
  }
  $$(".ab__btn").forEach((b) => b.addEventListener("click", async () => {
    setSide(b.dataset.side);
    if (!player.playing && player.buf) { await ctx.resume(); lastT = player.time(); player.play(); playBtn.classList.add("is-playing"); liveDot(); }
  }));
  playBtn.addEventListener("click", async () => {
    if (!player.buf) return;
    await ctx.resume();
    if (player.playing) { player.pause(); playBtn.classList.remove("is-playing"); }
    else { lastT = player.time() >= player.duration - 0.05 ? 0 : player.time(); player.play(); playBtn.classList.add("is-playing"); }
    playBtn.setAttribute("aria-label", player.playing ? "Pausar" : "Tocar");
    liveDot();
  });
  canvas.addEventListener("click", (e) => {
    if (!player.buf) return;
    const r = canvas.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * player.duration;
    lastT = t;
    player.seek(t);
    draw(t);
  });

  app.addEventListener("change", (e) => {
    const n = e.target.name;
    if (n === "pref") {
      const strength = $("[data-q-strength]");
      strength.hidden = e.target.value === "0";
      if (e.target.value === "0") $$('input[name="strength"]').forEach((r) => (r.checked = false));
    }
    if (n === "pref" || n === "strength") {
      const pref = $('input[name="pref"]:checked');
      const st = $('input[name="strength"]:checked');
      nextBtn.disabled = !(pref && (pref.value === "0" || st));
    }
    if (n === "overall") $("[data-finish]").disabled = false;
  });

  nextBtn.addEventListener("click", () => {
    const pref = $('input[name="pref"]:checked').value;
    const st = pref === "0" ? 0 : +$('input[name="strength"]:checked').value;
    const profile = pref === "0" ? null : state.map[state.i][pref];
    state.answers[state.i] = { profile, strength: st };
    playBtn.classList.remove("is-playing");
    if (state.i < SCENES.length - 1) openScene(state.i + 1);
    else show("overall");
  });

  /* ---------- Resultado ---------- */
  const STRENGTH = ["Sem preferência", "Leve", "Moderada", "Forte"];
  const COPY = {
    natural: {
      title: "Som Natural",
      text: "Você prefere ouvir o ambiente com riqueza e naturalidade, com a música e os pequenos detalhes preservados. Aparelhos com processamento mais natural tendem a ser mais confortáveis para você.",
      brands: ["Widex", "ReSound"]
    },
    aprimorado: {
      title: "Som Aprimorado",
      text: "Você valoriza entender a fala com clareza, mesmo com barulho em volta. Aparelhos que destacam a voz e reduzem o ruído de fundo tendem a combinar mais com a sua rotina.",
      brands: ["Signia"]
    },
    neutro: {
      title: "Som Equilibrado",
      text: "Os dois perfis funcionam bem para você. Na experiência gratuita, o fonoaudiólogo ajusta o aparelho entre naturalidade e foco na fala até chegar no seu ponto.",
      brands: ["Widex", "Signia", "ReSound"]
    }
  };

  $("[data-finish]").addEventListener("click", () => {
    state.overall = $('input[name="overall"]:checked').value;
    const sceneScore = state.answers.reduce((s, a) => s + (a.profile === "natural" ? a.strength : a.profile === "aprimorado" ? -a.strength : 0), 0);
    const overallScore = state.overall === "natural" ? 3 : state.overall === "aprimorado" ? -3 : 0;
    const score = sceneScore + overallScore; // −15 … +15
    let kind, badge = "Seu perfil sonoro";
    if (state.overall !== "0") kind = state.overall;
    else if (Math.abs(sceneScore) >= 2) { kind = sceneScore > 0 ? "natural" : "aprimorado"; badge = "Sua tendência nas cenas"; }
    else kind = "neutro";

    const c = COPY[kind];
    $("[data-result-badge]").textContent = badge;
    const title = $("[data-result-title]");
    title.textContent = c.title;
    title.className = "result__title" + (kind === "natural" ? " is-natural" : kind === "aprimorado" ? " is-enh" : "");
    $("[data-result-text]").textContent = c.text;
    $("[data-summary]").innerHTML = SCENES.map((sc, k) => {
      const a = state.answers[k];
      const label = a.profile ? `${a.profile === "natural" ? "Natural" : "Aprimorado"} · ${STRENGTH[a.strength]}` : "Sem preferência";
      return `<li><span>${sc.title}</span><span class="${a.profile === "natural" ? "n" : a.profile ? "e" : ""}">${label}</span></li>`;
    }).join("");
    $("[data-brands]").innerHTML = "Marcas indicadas na Opimed: " + c.brands.map((b) => `<strong>${b}</strong>`).join("");
    show("result");
    const marker = $("[data-marker]");
    marker.style.left = "50%";
    requestAnimationFrame(() => requestAnimationFrame(() => { marker.style.left = `${50 - (score / 15) * 46}%`; }));
    state.kind = kind;
  });

  $("[data-lead]").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const nome = (f.get("nome") || "").toString().trim().split(" ")[0];
    $("[data-done-title]").textContent = `Tudo certo, ${nome}!`;
    $("[data-done-text]").textContent = `Seu perfil (${COPY[state.kind].title}) foi enviado para a unidade ${f.get("unidade")}. Um especialista vai chamar você no WhatsApp para marcar a experiência gratuita.`;
    show("done");
  });

  $$("[data-restart]").forEach((b) => b.addEventListener("click", () => {
    $$('input[name="overall"]').forEach((r) => (r.checked = false));
    $("[data-finish]").disabled = true;
    state.map = SCENES.map(() => (Math.random() < 0.5 ? { A: "natural", B: "aprimorado" } : { A: "aprimorado", B: "natural" }));
    show("fones");
  }));

  /* ---------- Reveal ---------- */
  const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } }), { threshold: 0.15 });
  $$(".reveal").forEach((el) => io.observe(el));
})();
