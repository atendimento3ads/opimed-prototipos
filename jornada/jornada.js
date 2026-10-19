(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const WA = "https://tintim.link/whatsapp/7c349cb9-c7e6-42a9-8469-b6271b6bdefa/78512ba2-2c3b-47da-89f4-48d40d353413";

  /* ================= Teste auditivo online ================= */
  const OPTS = [["Nunca", 0], ["Às vezes", 1], ["Com frequência", 2]];
  const QUESTIONS = [
    "Você costuma pedir para as pessoas repetirem o que disseram?",
    "Tem dificuldade para entender conversas em lugares barulhentos, como restaurantes?",
    "Aumenta o volume da TV mais do que as outras pessoas gostariam?",
    "Sente que as pessoas falam baixo ou \"enrolado\"?",
    "Tem dificuldade para entender o que dizem ao telefone?",
    "Ouve zumbido ou chiado nos ouvidos?",
    "Evita encontros ou conversas em grupo por causa da audição?",
    "Alguém próximo já comentou que você não está ouvindo bem?"
  ];
  const RESULTS = [
    { max: 3, level: 1, color: "#2f7a4f", title: "Poucos sinais de perda auditiva", text: "Suas respostas não indicam dificuldades importantes. Mesmo assim, uma avaliação a cada ano ou dois é o ideal a partir dos 50 anos." },
    { max: 8, level: 2, color: "#b7791f", title: "Alguns sinais de atenção", text: "Você já percebe dificuldades em algumas situações. Uma avaliação auditiva mostra se é perda auditiva e o que fazer agora, enquanto é mais fácil se adaptar." },
    { max: 99, level: 3, color: "#b23b2e", title: "Sinais importantes de perda auditiva", text: "Suas respostas indicam dificuldades frequentes no dia a dia. Recomendamos uma avaliação auditiva com fonoaudiólogo o quanto antes." }
  ];
  const quiz = { i: 0, answers: [] };
  const body = $("[data-quiz-body]");
  const bar = $("[data-quiz-bar]");

  function renderQuiz() {
    body.style.animation = "none"; body.offsetHeight; body.style.animation = "";
    if (quiz.i === -1) {
      bar.style.width = "0";
      body.innerHTML = `
        <span class="quiz__n">8 perguntas · 3 minutos</span>
        <p class="quiz__q">Responda pensando nas últimas semanas, no seu dia a dia.</p>
        <p class="small">O teste não substitui a avaliação com um fonoaudiólogo; ele indica se vale a pena fazer uma.</p>
        <button class="btn btn--lg btn--block" data-q-start>Começar o teste <svg aria-hidden="true"><use href="#i-arrow"/></svg></button>`;
      return;
    }
    if (quiz.i < QUESTIONS.length) {
      bar.style.width = `${(quiz.i / QUESTIONS.length) * 100}%`;
      body.innerHTML = `
        <span class="quiz__n">Pergunta ${quiz.i + 1} de ${QUESTIONS.length}</span>
        <p class="quiz__q">${QUESTIONS[quiz.i]}</p>
        <div class="quiz__opts">${OPTS.map(([l, v]) => `<button class="quiz__opt" data-v="${v}">${l}<svg aria-hidden="true"><use href="#i-arrow"/></svg></button>`).join("")}</div>
        ${quiz.i > 0 ? '<button class="quiz__back" data-q-back>← Voltar</button>' : ""}`;
      return;
    }
    bar.style.width = "100%";
    const score = quiz.answers.reduce((a, b) => a + b, 0);
    const r = RESULTS.find((x) => score <= x.max);
    body.innerHTML = `
      <span class="quiz__n">Seu resultado</span>
      <div style="--res:${r.color}" class="quiz__meter">${[1, 2, 3].map((k) => `<i class="${k <= r.level ? "on" : ""}"></i>`).join("")}</div>
      <p class="quiz__result-title" style="--res:${r.color}">${r.title}</p>
      <p class="body">${r.text}</p>
      <form class="cb-form" data-quiz-form>
        <div class="field"><label for="q-nome">Nome</label><input class="input" id="q-nome" required autocomplete="given-name"></div>
        <div class="field"><label for="q-tel">WhatsApp</label><input class="input" id="q-tel" type="tel" inputmode="tel" required autocomplete="tel" placeholder="(62) 90000-0000"></div>
        <button class="btn btn--lg btn--block" type="submit">Agendar avaliação auditiva</button>
      </form>
      <button class="quiz__back" data-q-restart>Refazer o teste</button>`;
  }
  body.addEventListener("click", (e) => {
    if (e.target.closest("[data-q-start]")) { quiz.i = 0; quiz.answers = []; renderQuiz(); }
    const opt = e.target.closest(".quiz__opt");
    if (opt) { quiz.answers[quiz.i] = +opt.dataset.v; quiz.i++; renderQuiz(); body.querySelector("button")?.focus({ preventScroll: true }); }
    if (e.target.closest("[data-q-back]")) { quiz.i--; renderQuiz(); }
    if (e.target.closest("[data-q-restart]")) { quiz.i = -1; renderQuiz(); }
  });
  body.addEventListener("submit", (e) => {
    e.preventDefault();
    const nome = $("#q-nome").value.trim().split(" ")[0];
    body.innerHTML = `
      <div class="cb-done"><span class="cb-done__ico"><svg><use href="#i-check"/></svg></span>
      <p class="quiz__q">Obrigado, ${nome}!</p>
      <p class="body">Um especialista da Opimed vai chamar você no WhatsApp para marcar a avaliação na unidade mais próxima.</p>
      <p class="small">Protótipo: nenhum dado é enviado.</p>
      <button class="quiz__back" data-q-restart>Refazer o teste</button></div>`;
  });
  quiz.i = -1;
  renderQuiz();

  /* ================= Unidades ================= */
  // Endereços e telefones do site atual (aparelhosauditivos.opimed.com.br); coordenadas aproximadas
  const UNITS = [
    ["AP", "Macapá", "Macapá", "Av. Fab, 1833 - Loja A, Setor Central (ao lado da Clínica Promed)", "(96) 3082-2110", 0.034, -51.066],
    ["AM", "Manaus", "Manaus", "Av. Djalma Batista, 1718, Atlantic Tower, Torre Medical, sala 802, Chapada", "(92) 3584-4099", -3.105, -60.023],
    ["CE", "Fortaleza", "Fortaleza", "Av. Senador Virgílio Távora, 1837 - Loja B, Aldeota (ao lado da Hapvida)", "(85) 4012-3305", -3.739, -38.497],
    ["DF", "Brasília · Águas Claras", "Brasília", "Ed. Pátio Capital, sala 24, térreo - QS 03, EPCT, Águas Claras", "(61) 3550-7326", -15.838, -48.027],
    ["DF", "Brasília · Asa Norte", "Brasília", "SMHN Qd. 2, Bl. C, Lj. 09/10, Ed. Dr. Crispim (em frente ao HRAN)", "(61) 3548-8006", -15.781, -47.889],
    ["DF", "Brasília · Asa Sul", "Brasília", "Ed. Via Brasil, SEPS 710/910, Asa Sul", "(61) 3028-7474", -15.826, -47.917],
    ["GO", "Goiânia · Setor Marista", "Goiânia", "Av. Mutirão, 2653, Órion Business & Health Complex, térreo", "(62) 3996-7789", -16.705, -49.262],
    ["GO", "Goiânia · Setor Oeste", "Goiânia", "Av. República do Líbano, 1775, St. Oeste (em frente ao INGOH)", "(62) 3996-7700", -16.683, -49.273],
    ["GO", "Anápolis", "Anápolis", "Av. Desembargador Jaime, 73, St. Central (em frente à Igreja Sant'Ana)", "(62) 3943-0110", -16.327, -48.953],
    ["GO", "Catalão", "Catalão", "Av. Farid Miguel Safatle, 18, sala 01, Centro", "(64) 3441-2105", -18.166, -47.946],
    ["GO", "Itumbiara", "Itumbiara", "Rua Rui de Almeida, 582, Centro (em frente ao Restaurante Sabor Goiano)", "(64) 3404-5976", -18.419, -49.215],
    ["GO", "Rio Verde", "Rio Verde", "Rua Pedro Rattes, 99, Centro (próximo à Praça dos Coqueiros)", "(64) 3621-7062", -17.792, -50.919],
    ["PA", "Belém", "Belém", "Tv. Dom Romualdo de Seixas, 1560, Ed. Connext, loja 10, Umarizal", "(91) 3249-7174", -1.42, -48.487],
    ["PE", "Recife · Boa Viagem", "Recife", "Galeria Centro Sul, Rua Jornalista Adeth Leite, 009, Boa Viagem", "0800 100 1989", -8.123, -34.901],
    ["PE", "Recife · Ilha do Leite", "Recife", "Rua Minas Gerais, 116, Ilha do Leite (ao lado do Otorrinos Recife)", "(81) 3771-0062", -8.064, -34.893],
    ["RO", "Porto Velho", "Porto Velho", "Rua Tenreiro Aranha, 3108, sala 01 B, Olaria (próx. ao Hospital 9 de Julho)", "(69) 3224-1386", -8.761, -63.9],
    ["TO", "Palmas", "Palmas", "Av. Teotônio Segurado, 501 Sul, Conj. 01, Lt. 22, Loja 03", "(63) 3215-4088", -10.197, -48.333],
    ["TO", "Araguaína", "Araguaína", "Av. Tocantins, 1650, Espaço Saúde, Ed. João Coragem, Centro", "(63) 3413-1130", -7.191, -48.207]
  ].map(([uf, nome, cidade, end, tel, lat, lng]) => ({ uf, nome, cidade, end, tel, lat, lng }));
  const STATES = { AP: "Amapá", AM: "Amazonas", CE: "Ceará", DF: "Distrito Federal", GO: "Goiás", PA: "Pará", PE: "Pernambuco", RO: "Rondônia", TO: "Tocantins" };

  const list = $("[data-units]");
  const sel = $("[data-state]");
  const status = $("[data-units-status]");
  sel.insertAdjacentHTML("beforeend", Object.entries(STATES).map(([k, v]) => `<option value="${k}">${v}</option>`).join(""));
  let origin = null;

  function km(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function renderUnits() {
    let items = UNITS.filter((u) => !sel.value || u.uf === sel.value);
    if (origin) items = items.map((u) => ({ ...u, d: km(origin, u) })).sort((a, b) => a.d - b.d);
    list.innerHTML = items.map((u, k) => {
      const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Opimed ${u.end}, ${u.cidade} - ${u.uf}`)}`;
      return `<article class="unit${origin && k === 0 ? " is-near" : ""}">
        <div class="unit__top"><h3>${u.nome} <small class="small">${u.uf}</small></h3>${u.d != null ? `<span class="unit__dist">${u.d < 10 ? u.d.toFixed(1) : Math.round(u.d)} km</span>` : ""}</div>
        <p>${u.end}</p>
        <div class="unit__actions">
          <a class="primary" href="${WA}" target="_blank" rel="noopener">Agendar aqui</a>
          <a href="tel:${u.tel.replace(/\D/g, "")}"><svg><use href="#i-phone"/></svg>${u.tel}</a>
          <a href="${maps}" target="_blank" rel="noopener"><svg><use href="#i-pin"/></svg>Rota</a>
        </div>
      </article>`;
    }).join("");
    if (!origin) status.textContent = `${items.length} ${items.length === 1 ? "unidade" : "unidades"}${sel.value ? ` em ${STATES[sel.value]}` : ""}`;
  }
  sel.addEventListener("change", renderUnits);
  $("[data-locate]").addEventListener("click", () => {
    if (!navigator.geolocation) { status.textContent = "Seu navegador não permite localização. Filtre pelo estado."; return; }
    status.textContent = "Buscando sua localização…";
    navigator.geolocation.getCurrentPosition(
      (p) => {
        origin = { lat: p.coords.latitude, lng: p.coords.longitude };
        sel.value = "";
        renderUnits();
        status.textContent = "Unidades ordenadas pela distância até você. A mais próxima está em destaque.";
      },
      () => { status.textContent = "Não conseguimos sua localização. Filtre pelo estado."; },
      { timeout: 8000 }
    );
  });
  renderUnits();

  /* ================= Nós ligamos para você ================= */
  const drawer = $("[data-drawer]");
  let lastFocus;
  function openCb() {
    lastFocus = document.activeElement;
    drawer.hidden = false;
    $("[data-cb-form-wrap]").hidden = false;
    $("[data-cb-done]").hidden = true;
    document.body.style.overflow = "hidden";
    setTimeout(() => $("#cb-nome").focus(), 50);
  }
  function closeCb() { drawer.hidden = true; document.body.style.overflow = ""; lastFocus && lastFocus.focus(); }
  $$("[data-open-callback]").forEach((b) => b.addEventListener("click", openCb));
  $$("[data-close-callback]").forEach((b) => b.addEventListener("click", closeCb));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) closeCb(); });
  $("[data-cb-form]").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    $("[data-cb-done-title]").textContent = `Combinado, ${$("#cb-nome").value.trim().split(" ")[0]}!`;
    $("[data-cb-done-text]").textContent = `Um especialista da Opimed vai ligar para você no período da ${f.get("turno")}, de segunda a sexta.`;
    $("[data-cb-form-wrap]").hidden = true;
    $("[data-cb-done]").hidden = false;
    e.target.reset();
  });

  /* ================= Reveal ================= */
  const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } }), { threshold: 0.12 });
  $$(".reveal").forEach((el) => io.observe(el));
})();
