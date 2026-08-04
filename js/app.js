const state = { content: null };

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }

function mostrarView(nome) {
  $all('.view').forEach((v) => v.classList.add('hidden'));
  $('#view-' + nome).classList.remove('hidden');
}

async function carregarConteudo() {
  const resp = await fetch('content/content.json', { cache: 'no-cache' });
  const dados = await resp.json();
  state.content = dados;
  localStorage.setItem('kiosk-content', JSON.stringify(dados));
  return dados;
}

async function obterConteudo() {
  try {
    return await carregarConteudo();
  } catch (e) {
    const salvo = localStorage.getItem('kiosk-content');
    if (salvo) return JSON.parse(salvo);
    throw e;
  }
}

function renderDesktop(dados) {
  const grade = $('#grade-apps');
  grade.innerHTML = '';
  dados.apps.forEach((app) => {
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.innerHTML = `<img src="${app.icone}" alt=""><span>${app.titulo}</span>`;
    tile.addEventListener('click', () => abrirApp(app.id));
    grade.appendChild(tile);
  });
}

function abrirApp(id) {
  if (id === 'historias') {
    renderHistorias(state.content);
    mostrarView('historias');
  } else if (id === 'jogos') {
    renderJogos(state.content);
    mostrarView('jogos');
  }
}

function renderJogos(dados) {
  const grade = $('#grade-jogos');
  grade.innerHTML = '';
  (dados.jogos || []).forEach((jogo) => {
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.innerHTML = `<img src="${jogo.icone}" alt=""><span>${jogo.titulo}</span>`;
    tile.addEventListener('click', () => abrirJogo(jogo.id));
    grade.appendChild(tile);
  });
}

function abrirJogo(id) {
  if (id === 'cobrinha') {
    mostrarView('cobrinha');
    iniciarCobrinha();
  }
}

function renderHistorias(dados) {
  const grade = $('#grade-historias');
  grade.innerHTML = '';
  dados.historias.forEach((h) => {
    const tile = document.createElement('button');
    tile.className = 'tile tile-historia';
    tile.innerHTML = `<img src="${h.capa}" alt=""><span>${h.titulo}</span>`;
    tile.addEventListener('click', () => abrirHistoria(h));
    grade.appendChild(tile);
  });
}

function formatarTempo(segundos) {
  if (!isFinite(segundos)) return '0:00';
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function abrirHistoria(h) {
  $('#player-titulo').textContent = h.titulo;
  $('#player-capa').src = h.capa;
  const audio = $('#player-audio');
  audio.src = h.audio;
  audio.currentTime = 0;
  $('#player-timeline').value = 0;
  $('#player-playpause').textContent = '▶';
  mostrarView('player');
}

function configurarPlayer() {
  const audio = $('#player-audio');
  const btn = $('#player-playpause');
  const timeline = $('#player-timeline');
  const tempo = $('#player-tempo');

  btn.addEventListener('click', () => {
    if (audio.paused) {
      audio.play();
      btn.textContent = '⏸';
    } else {
      audio.pause();
      btn.textContent = '▶';
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      timeline.value = (audio.currentTime / audio.duration) * 100;
    }
    tempo.textContent = `${formatarTempo(audio.currentTime)} / ${formatarTempo(audio.duration)}`;
  });

  audio.addEventListener('ended', () => {
    btn.textContent = '▶';
  });

  timeline.addEventListener('input', () => {
    if (audio.duration) {
      audio.currentTime = (timeline.value / 100) * audio.duration;
    }
  });
}

function configurarNavegacao() {
  $all('.botao-voltar').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('#player-audio').pause();
      pararCobrinha();
      mostrarView(btn.dataset.voltar);
    });
  });
}

// --- Jogo da Cobrinha ---

const cobrinha = {
  canvas: null,
  ctx: null,
  cell: 20,
  cols: 13,
  linhas: 13,
  cobra: [],
  direcao: 'direita',
  proximaDirecao: 'direita',
  comida: { x: 0, y: 0 },
  pontos: 0,
  intervalId: null,
};

function posicionarComidaCobrinha() {
  let pos;
  do {
    pos = {
      x: Math.floor(Math.random() * cobrinha.cols),
      y: Math.floor(Math.random() * cobrinha.linhas),
    };
  } while (cobrinha.cobra.some((s) => s.x === pos.x && s.y === pos.y));
  cobrinha.comida = pos;
}

function desenharCobrinha() {
  const { ctx, cell, cols, linhas } = cobrinha;
  ctx.fillStyle = '#fef6e4';
  ctx.fillRect(0, 0, cols * cell, linhas * cell);

  ctx.fillStyle = '#ff8fab';
  ctx.beginPath();
  ctx.arc(
    cobrinha.comida.x * cell + cell / 2,
    cobrinha.comida.y * cell + cell / 2,
    cell / 2.4,
    0,
    Math.PI * 2
  );
  ctx.fill();

  cobrinha.cobra.forEach((seg, i) => {
    ctx.fillStyle = i === 0 ? '#2b2d42' : '#588157';
    ctx.fillRect(seg.x * cell + 1, seg.y * cell + 1, cell - 2, cell - 2);
  });
}

function tickCobrinha() {
  cobrinha.direcao = cobrinha.proximaDirecao;
  const cabeca = { ...cobrinha.cobra[0] };

  if (cobrinha.direcao === 'cima') cabeca.y -= 1;
  if (cobrinha.direcao === 'baixo') cabeca.y += 1;
  if (cobrinha.direcao === 'esquerda') cabeca.x -= 1;
  if (cobrinha.direcao === 'direita') cabeca.x += 1;

  const bateuParede =
    cabeca.x < 0 || cabeca.y < 0 || cabeca.x >= cobrinha.cols || cabeca.y >= cobrinha.linhas;
  const bateuNoProprioCorpo = cobrinha.cobra.some((s) => s.x === cabeca.x && s.y === cabeca.y);

  if (bateuParede || bateuNoProprioCorpo) {
    fimDeJogoCobrinha();
    return;
  }

  cobrinha.cobra.unshift(cabeca);

  if (cabeca.x === cobrinha.comida.x && cabeca.y === cobrinha.comida.y) {
    cobrinha.pontos += 1;
    $('#cobrinha-pontos').textContent = `Pontos: ${cobrinha.pontos}`;
    posicionarComidaCobrinha();
  } else {
    cobrinha.cobra.pop();
  }

  desenharCobrinha();
}

function fimDeJogoCobrinha() {
  pararCobrinha();
  $('#cobrinha-fim').classList.remove('hidden');
}

function mudarDirecaoCobrinha(dir) {
  const opostas = { cima: 'baixo', baixo: 'cima', esquerda: 'direita', direita: 'esquerda' };
  if (opostas[dir] === cobrinha.direcao) return;
  cobrinha.proximaDirecao = dir;
}

function pararCobrinha() {
  if (cobrinha.intervalId) {
    clearInterval(cobrinha.intervalId);
    cobrinha.intervalId = null;
  }
}

function iniciarCobrinha() {
  pararCobrinha();
  if (!cobrinha.canvas) {
    cobrinha.canvas = $('#cobrinha-canvas');
    cobrinha.ctx = cobrinha.canvas.getContext('2d');
  }
  cobrinha.cobra = [
    { x: 6, y: 6 },
    { x: 5, y: 6 },
    { x: 4, y: 6 },
  ];
  cobrinha.direcao = 'direita';
  cobrinha.proximaDirecao = 'direita';
  cobrinha.pontos = 0;
  $('#cobrinha-pontos').textContent = 'Pontos: 0';
  $('#cobrinha-fim').classList.add('hidden');
  posicionarComidaCobrinha();
  desenharCobrinha();
  cobrinha.intervalId = setInterval(tickCobrinha, 180);
}

function configurarCobrinha() {
  $all('.dpad-btn').forEach((btn) => {
    btn.addEventListener('click', () => mudarDirecaoCobrinha(btn.dataset.dir));
  });
  $('#cobrinha-reiniciar').addEventListener('click', iniciarCobrinha);

  let toqueInicio = null;
  const canvas = $('#cobrinha-canvas');
  canvas.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    toqueInicio = { x: t.clientX, y: t.clientY };
  });
  canvas.addEventListener('touchend', (e) => {
    if (!toqueInicio) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - toqueInicio.x;
    const dy = t.clientY - toqueInicio.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      mudarDirecaoCobrinha(dx > 0 ? 'direita' : 'esquerda');
    } else {
      mudarDirecaoCobrinha(dy > 0 ? 'baixo' : 'cima');
    }
    toqueInicio = null;
  });
}

// --- Configurações (wifi protegido por PIN) ---

function configurarConfig() {
  const botao = $('#botao-config');
  const modal = $('#modal-pin');
  const input = $('#pin-input');
  const erro = $('#pin-erro');

  function abrirModal() {
    input.value = '';
    erro.classList.add('hidden');
    modal.classList.remove('hidden');
    input.focus();
  }

  function fecharModal() {
    modal.classList.add('hidden');
  }

  botao.addEventListener('click', abrirModal);
  $('#pin-cancelar').addEventListener('click', fecharModal);

  $('#pin-confirmar').addEventListener('click', () => {
    const pin = input.value;
    if (window.KioskNative && typeof window.KioskNative.abrirConfigWifi === 'function') {
      const ok = window.KioskNative.abrirConfigWifi(pin);
      if (ok) {
        fecharModal();
      } else {
        erro.classList.remove('hidden');
      }
    } else {
      erro.classList.remove('hidden');
    }
  });
}

async function iniciar() {
  configurarPlayer();
  configurarNavegacao();
  configurarCobrinha();
  configurarConfig();
  const dados = await obterConteudo();
  renderDesktop(dados);
  mostrarView('desktop');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

iniciar();
