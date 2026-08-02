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
      mostrarView(btn.dataset.voltar);
    });
  });
}

async function iniciar() {
  configurarPlayer();
  configurarNavegacao();
  const dados = await obterConteudo();
  renderDesktop(dados);
  mostrarView('desktop');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

iniciar();
