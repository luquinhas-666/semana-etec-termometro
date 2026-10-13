
(() => {
  "use strict";


  const API_URL = "https://bullet-kingston-justin-charms.trycloudflare.com";
  const INTERVALO_MS = 2000;
  const TIMEOUT_MS = 12000;

  function iniciarMonitor() {
    const fundo = document.getElementById("fundo");
    const elValor = document.getElementById("valor");
    const elStatus = document.getElementById("status");
    const elErro = document.getElementById("erro");
    const form = document.getElementById("form-limites");
    const inputFria = document.getElementById("fria");
    const inputMaxima = document.getElementById("maxima");
    const canvas = document.getElementById("particulas");
    const btnTema = document.getElementById("tema");

    if (![fundo, elValor, elStatus, elErro, form, inputFria, inputMaxima].every(Boolean)) {
      const mensagem = "Confira os IDs do HTML: fundo, valor, status, erro, form-limites, fria e maxima.";
      console.error(mensagem);
      if (elErro) elErro.textContent = mensagem;
      return;
    }
    const ctx = canvas ? canvas.getContext("2d") : null;

    // Avisos da conexão ficam separados das mensagens do formulário.
    let elAviso = document.getElementById("aviso");
    if (!elAviso) {
      elAviso = document.createElement("p");
      elAviso.id = "aviso";
      elStatus.insertAdjacentElement("afterend", elAviso);
    }
    elAviso.setAttribute("role", "status");
    elErro.setAttribute("role", "status");

    // Reaproveita <input id="chave"> ou cria o campo dentro do formulário.
    // A chave vai somente no cabeçalho do PUT; não usamos localStorage para ela.
    let campoChave = document.getElementById("chave");
    if (!campoChave) {
      const grupo = document.createElement("div");
      grupo.className = "campo-chave-api";
      grupo.style.gridColumn = "1 / -1";
      const label = document.createElement("label");
      label.htmlFor = "chave";
      label.textContent = "Chave da API";
      label.style.display = "block";
      campoChave = document.createElement("input");
      campoChave.id = "chave";
      campoChave.placeholder = "Apenas para Devs";
      campoChave.style.width = "100%";
      campoChave.style.boxSizing = "border-box";
      grupo.append(label, campoChave);
      const botao = form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]');
      if (botao) botao.insertAdjacentElement("beforebegin", grupo);
      else form.append(grupo);
    }
    campoChave.type = "password";
    campoChave.autocomplete = "off";
    campoChave.spellcheck = false;

    for (const input of [inputFria, inputMaxima]) {
      input.required = true;
      input.min = "-999.99";
      input.max = "999.99";
      input.step = "0.01";
    }

    // null significa que ainda não recebemos uma medição verdadeira.
    let temperatura = null, temperaturaFria = null, temperaturaMaxima = null;
    let W = 0, H = 0, estado = "", particulas = [];
    let conexao = "aguardando", ultimaData = null, primeiraCarga = true;
    let buscando = false, salvando = false, formularioEditado = false;
    let revisaoConfig = 0, timerBusca = null, frame = null, frameContagem = null;
    let visivel = !document.hidden;
    const preferenciaMovimento = matchMedia("(prefers-reduced-motion: reduce)");
    let reduzMovimento = preferenciaMovimento.matches;
    const r = (a, b) => a + Math.random() * (b - a);
    const textos = { frio: "Está frio", ameno: "Clima ameno", quente: "Está quente" };

  const climas = {
    // Flocos de neve caindo, os maiores viram cristais de 6 pontas
    frio: {
      qtd: 130,
      nova: (ini) => ({ x: r(0, W), y: ini ? r(0, H) : -12, raio: r(1.5, 5.5), vy: r(0.5, 1.7), fase: r(0, 6.28), vf: r(0.008, 0.03), amp: r(0.2, 0.9), rot: 0, vr: r(-0.02, 0.02) }),
      mover(p) { p.fase += p.vf; p.x += Math.sin(p.fase) * p.amp; p.y += p.vy; p.rot += p.vr; return p.y < H + 12; },
      desenhar(p) {
        ctx.shadowColor = "#6fb8ee";
        ctx.shadowBlur = 8;
        ctx.fillStyle = ctx.strokeStyle = "rgba(255,255,255,0.95)";
        if (p.raio > 4) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.lineWidth = 1.4;
          for (let i = 0; i < 3; i++) {
            ctx.rotate(Math.PI / 3);
            ctx.beginPath();
            ctx.moveTo(-p.raio * 1.6, 0);
            ctx.lineTo(p.raio * 1.6, 0);
            ctx.stroke();
          }
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.raio, 0, 6.28);
          ctx.fill();
        }
      }
    },
    // Rajadas de vento: riscos curvos cruzando a tela
    ameno: {
      qtd: 55,
      nova: (ini) => { const c = r(60, 180); return { x: ini ? r(0, W) : -c, y: r(0, H), c, vx: r(2, 5.5), fase: r(0, 6.28), alpha: r(0.15, 0.45), larg: r(1, 2.2) }; },
      mover(p) { p.fase += 0.025; p.x += p.vx; p.y += Math.sin(p.fase) * 0.6; return p.x < W + 10; },
      desenhar(p) {
        const o = 10 * Math.sin(p.fase);
        ctx.shadowBlur = 0;
        ctx.lineCap = "round";
        ctx.lineWidth = p.larg;
        ctx.strokeStyle = `rgba(235,255,240,${p.alpha})`;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.bezierCurveTo(p.x + p.c * 0.3, p.y - o, p.x + p.c * 0.6, p.y + o, p.x + p.c, p.y);
        ctx.stroke();
      }
    },
    // Brasas subindo, piscando e esmaecendo
    quente: {
      qtd: 110,
      nova: (ini) => ({ x: r(0, W), y: ini ? r(0, H) : H + 12, raio: r(1, 3.6), vy: r(0.7, 2.4), fase: r(0, 6.28), vf: r(0.03, 0.12), amp: r(0.3, 1.1), cor: `${Math.round(r(8, 42))}, 100%, ${Math.round(r(50, 64))}%` }),
      mover(p) { p.fase += p.vf; p.x += Math.sin(p.fase * 0.5) * p.amp; p.y -= p.vy; return p.y > -12; },
      desenhar(p) {
        const brilho = (0.55 + 0.45 * Math.abs(Math.sin(p.fase))) * Math.max(0, Math.min(1, p.y / (H * 0.6)));
        ctx.shadowColor = `hsl(${p.cor})`;
        ctx.shadowBlur = 14;
        ctx.fillStyle = `hsla(${p.cor}, ${brilho})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.raio, 0, 6.28);
        ctx.fill();
      }
    }
  };
  const quantidade = (c) => Math.round(c.qtd * Math.min(1, W / 800 + 0.3));

    function redimensionar() {
      W = fundo.clientWidth;
      H = fundo.clientHeight;
      if (!ctx) return;
      const d = window.devicePixelRatio || 1;
      canvas.width = W * d;
      canvas.height = H * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      if (climas[estado]) {
        particulas = Array.from({ length: quantidade(climas[estado]) }, () => climas[estado].nova(true));
      }
      sincronizarAnimacao();
    }

    function podeAnimar() {
      return ctx && visivel && !reduzMovimento && conexao === "online" && climas[estado] && W > 0 && H > 0;
    }

    function quadro() {
      frame = null;
      if (!podeAnimar()) return;
      const clima = climas[estado];
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = estado === "quente" ? "lighter" : "source-over";
      particulas = particulas.filter(clima.mover);
      while (particulas.length < quantidade(clima)) particulas.push(clima.nova(false));
      particulas.forEach(clima.desenhar);
      frame = requestAnimationFrame(quadro);
    }

    function sincronizarAnimacao() {
      if (podeAnimar()) {
        if (frame === null) frame = requestAnimationFrame(quadro);
      } else {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        if (ctx) ctx.clearRect(0, 0, W, H);
      }
    }

    function classificar() {
      if (![temperatura, temperaturaFria, temperaturaMaxima].every(Number.isFinite)) return "";
      // Igual aos limites = Normal na API, representado por "ameno" no seu CSS.
      if (temperatura < temperaturaFria) return "frio";
      if (temperatura > temperaturaMaxima) return "quente";
      return "ameno";
    }

    function atualizar() {
      const novo = classificar();
      document.body.dataset.conexao = conexao;
      if (novo) document.body.dataset.estado = novo;
      else delete document.body.dataset.estado;
      elStatus.textContent = conexao === "online" ? textos[novo] || "Aguardando leitura"
        : conexao === "atrasada" ? "Sem novas leituras"
        : conexao === "offline" ? "API offline"
        : "Aguardando primeira leitura";
      if (novo !== estado) {
        estado = novo;
        particulas = novo ? Array.from({ length: quantidade(climas[novo]) }, () => climas[novo].nova(true)) : [];
      }
      sincronizarAnimacao();
    }

    function mostrarValor(valor) {
      elValor.textContent = Number.isFinite(valor)
        ? valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "--";
    }

    function pararContagem() {
      if (frameContagem !== null) cancelAnimationFrame(frameContagem);
      frameContagem = null;
    }

    function contar(valorFinal) {
      pararContagem();
      const inicio = performance.now();
      function passo(agora) {
        const k = Math.min((agora - inicio) / 1400, 1);
        mostrarValor(valorFinal * (1 - Math.pow(1 - k, 3)));
        frameContagem = k < 1 ? requestAnimationFrame(passo) : null;
      }
      frameContagem = requestAnimationFrame(passo);
    }

    // GET: lê dados. PUT: envia os limites em JSON para o banco.
    async function api(caminho, opcoes = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const resposta = await fetch(API_URL.replace(/\/+$/, "") + caminho, {
          ...opcoes,
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "Accept": "application/json",
            "ngrok-skip-browser-warning": "1",
            ...(opcoes.headers || {})
          }
        });
        let dados;
        try {
          dados = await resposta.json();
        } catch (erro) {
          if (controller.signal.aborted) throw erro;
          throw new Error("A resposta não é JSON. Confira a URL da API e o túnel.");
        }
        if (!resposta.ok) {
          let mensagem = `Erro HTTP ${resposta.status}.`;
          if (typeof dados?.detail === "string") mensagem = dados.detail;
          else if (Array.isArray(dados?.detail)) mensagem = dados.detail.map(item => item.msg).join(" ");
          const erro = new Error(mensagem);
          erro.status = resposta.status;
          throw erro;
        }
        return dados;
      } catch (erro) {
        if (controller.signal.aborted) throw new Error("A API demorou para responder. Verifique o Python e o túnel.");
        if (erro instanceof TypeError) throw new Error("Sem conexão com a API. Confira o endereço, o Python e o CORS.");
        throw erro;
      } finally {
        clearTimeout(timer);
      }
    }

    function validarConfig(config) {
      if (!config || !Number.isFinite(config.limite_frio) || !Number.isFinite(config.limite_quente)
          || config.limite_frio >= config.limite_quente) {
        throw new Error("A API retornou limites inválidos.");
      }
    }

    function aplicarConfig(config, forcarFormulario = false) {
      validarConfig(config);
      temperaturaFria = config.limite_frio;
      temperaturaMaxima = config.limite_quente;
      const digitando = [inputFria, inputMaxima].includes(document.activeElement);
      if (forcarFormulario || (!formularioEditado && !digitando)) {
        inputFria.value = temperaturaFria;
        inputMaxima.value = temperaturaMaxima;
      }
    }

    for (const input of [inputFria, inputMaxima]) {
      input.addEventListener("input", () => {
        formularioEditado = true;
        elErro.textContent = "";
      });
    }

    function horarioUltimaLeitura() {
      return ultimaData ? ` Última leitura recebida: ${ultimaData.toLocaleString("pt-BR")}.` : "";
    }

    async function buscarTemperatura() {
      if (buscando || salvando) return;
      buscando = true;
      const revisao = revisaoConfig;
      try {
        const dados = await api("/api/atual");
        // Uma resposta antiga não deve desfazer um PUT que acabou de acontecer.
        if (salvando || revisao !== revisaoConfig) return;
        if (!dados || !Number.isFinite(dados.valor) || typeof dados.atrasada !== "boolean"
            || !Number.isFinite(dados.idade_segundos)) {
          throw new Error("A API retornou uma leitura em formato inválido.");
        }
        validarConfig(dados.limites);
        const data = new Date(dados.data_hora);
        if (!dados.data_hora || !Number.isFinite(data.getTime())) throw new Error("Data da leitura inválida.");
        aplicarConfig(dados.limites);
        temperatura = dados.valor;
        ultimaData = data;
        conexao = dados.atrasada ? "atrasada" : "online";
        pararContagem();
        if (primeiraCarga && !reduzMovimento && visivel && !dados.atrasada) contar(temperatura);
        else mostrarValor(temperatura);
        primeiraCarga = false;
        elAviso.textContent = dados.atrasada
          ? `Sem leitura nova há ${Math.round(dados.idade_segundos)} s. Verifique o bridge e o Arduino.${horarioUltimaLeitura()}`
          : "";
      } catch (erro) {
        if (salvando || revisao !== revisaoConfig) return;
        pararContagem();
        if (erro.status === 404) {
          temperatura = null;
          ultimaData = null;
          conexao = "aguardando";
          elAviso.textContent = "Ainda não há temperaturas no banco. Inicie o bridge do Arduino.";
          // Permite consultar/salvar os limites mesmo antes da primeira medição.
          try {
            const config = await api("/api/config");
            if (salvando || revisao !== revisaoConfig) return;
            aplicarConfig(config);
          } catch (erroConfig) {
            if (salvando || revisao !== revisaoConfig) return;
            conexao = "offline";
            elAviso.textContent = erroConfig.message;
          }
        } else {
          conexao = "offline";
          elAviso.textContent = erro.message + horarioUltimaLeitura();
        }
        mostrarValor(temperatura);
      } finally {
        buscando = false;
        atualizar();
      }
    }

    // Agenda a próxima consulta depois da anterior: evita requisições acumuladas.
    async function cicloDeLeitura() {
      clearTimeout(timerBusca);
      await buscarTemperatura();
      timerBusca = setTimeout(cicloDeLeitura, INTERVALO_MS);
    }

    form.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      if (salvando) return;
      const textoFria = inputFria.value.trim();
      const textoMaxima = inputMaxima.value.trim();
      const fria = Number(textoFria.replace(",", "."));
      const maxima = Number(textoMaxima.replace(",", "."));
      if (!textoFria || !textoMaxima || ![fria, maxima].every(Number.isFinite)) {
        elErro.textContent = "Preencha os dois limites com números válidos.";
        return;
      }
      if (fria >= maxima) {
        elErro.textContent = "O limite frio precisa ser menor que o limite quente.";
        return;
      }
      if ([fria, maxima].some(v => Math.abs(v) > 999.99 || Math.abs(v * 100 - Math.round(v * 100)) > 0.000001)) {
        elErro.textContent = "Use valores entre -999,99 e 999,99, com até duas casas decimais.";
        return;
      }
      const chave = campoChave.value.trim();
      if (!chave) {
        elErro.textContent = "Digite a chave da API para salvar os limites.";
        campoChave.focus();
        return;
      }

      salvando = true;
      revisaoConfig++;
      const controles = [...new Set([
        inputFria, inputMaxima, campoChave,
        ...form.querySelectorAll('button[type="submit"], button:not([type]), input[type="submit"]')
      ])].map(elemento => [elemento, elemento.disabled]);
      controles.forEach(([elemento]) => { elemento.disabled = true; });
      form.setAttribute("aria-busy", "true");
      elErro.textContent = "Salvando limites...";
      try {
        const salvo = await api("/api/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-API-Key": chave },
          body: JSON.stringify({ limite_frio: fria, limite_quente: maxima })
        });
        aplicarConfig(salvo, true);
        formularioEditado = false;
        campoChave.value = "";
        elErro.textContent = "Limites salvos no banco.";
        atualizar();
      } catch (erro) {
        if (erro.status === 401) {
          campoChave.value = "";
          elErro.textContent = "Chave inválida. Digite a mesma API_KEY do .env da API.";
        } else {
          elErro.textContent = `Não foi possível confirmar a gravação: ${erro.message}`;
        }
      } finally {
        salvando = false;
        revisaoConfig++;
        controles.forEach(([elemento, desabilitado]) => { elemento.disabled = desabilitado; });
        form.removeAttribute("aria-busy");
      }
    });

    // Tema: só esta preferência é gravada no localStorage.
    const raiz = document.documentElement;
    function aplicarTema(tema) {
      raiz.dataset.tema = tema === "escuro" ? "escuro" : "claro";
      if (btnTema) btnTema.setAttribute("aria-label", raiz.dataset.tema === "escuro" ? "Ativar modo claro" : "Ativar modo escuro");
    }
    if (btnTema) btnTema.addEventListener("click", () => {
      const novo = raiz.dataset.tema === "escuro" ? "claro" : "escuro";
      aplicarTema(novo);
      try { localStorage.setItem("tema", novo); } catch (_) {}
    });
    aplicarTema(raiz.dataset.tema);

    window.addEventListener("resize", redimensionar);
    document.addEventListener("visibilitychange", () => {
      visivel = !document.hidden;
      if (!visivel) { pararContagem(); mostrarValor(temperatura); }
      sincronizarAnimacao();
    });
    preferenciaMovimento.addEventListener("change", (evento) => {
      reduzMovimento = evento.matches;
      if (reduzMovimento) { pararContagem(); mostrarValor(temperatura); }
      sincronizarAnimacao();
    });

    mostrarValor(null);
    elAviso.textContent = "Conectando à API...";
    atualizar();
    redimensionar();
    cicloDeLeitura();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarMonitor, { once: true });
  } else {
    iniciarMonitor();
  }
})();
