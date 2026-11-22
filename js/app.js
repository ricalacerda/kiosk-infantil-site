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
  } else if (id === 'tetris') {
    mostrarView('tetris');
    iniciarTetris();
  } else if (id === 'damas') {
    mostrarView('damas');
    iniciarDamas();
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

const EMBUTIDO = window.parent !== window && /[?&]embutido=1/.test(location.search);

function configurarNavegacao() {
  $all('.botao-voltar').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('#player-audio').pause();
      pararCobrinha();
      pararTetris();
      pararDamas();
      if (EMBUTIDO && btn.dataset.voltar === 'desktop') {
        window.parent.postMessage({ lumi: 'sair-jogos' }, location.origin);
        return;
      }
      if (btn.dataset.voltar) mostrarView(btn.dataset.voltar);
    });
  });
}

// --- Jogos estilo Nokia: tela de cristal líquido ocupando o aparelho inteiro ---

const LCD = { fundo: '#c7f0d8', tinta: '#43523d', apagado: 'rgba(67, 82, 61, 0.09)' };

function ajustarCanvas(canvas, largura, altura) {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = largura + 'px';
  canvas.style.height = altura + 'px';
  canvas.width = Math.round(largura * dpr);
  canvas.height = Math.round(altura * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// Um "pixel" de minigame: moldura fina com miolo cheio.
function desenharBloco(ctx, px, py, cell, cor) {
  const folga = Math.max(1, Math.round(cell * 0.06));
  const borda = Math.max(1, Math.round(cell * 0.1));
  const miolo = Math.round(cell * 0.24);
  ctx.strokeStyle = cor;
  ctx.lineWidth = borda;
  ctx.strokeRect(px + folga + borda / 2, py + folga + borda / 2, cell - 2 * folga - borda, cell - 2 * folga - borda);
  ctx.fillStyle = cor;
  ctx.fillRect(px + miolo, py + miolo, cell - 2 * miolo, cell - 2 * miolo);
}

function formatarPontos(n) {
  return String(n).padStart(4, '0');
}

// Tecla de toque: responde no encostar (não no soltar) e repete se ficar apertada.
function ligarTecla(btn, acao, repetir) {
  let espera = null;
  let repeticao = null;
  function soltar() {
    clearTimeout(espera);
    clearInterval(repeticao);
    espera = null;
    repeticao = null;
    btn.classList.remove('apertada');
  }
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    soltar();
    btn.classList.add('apertada');
    acao();
    if (repetir) {
      espera = setTimeout(() => { repeticao = setInterval(acao, 90); }, 260);
    }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, soltar));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Deslizar o dedo na tela do jogo também vale como seta; toque curto vira "toque".
function ligarDeslize(area, aoDeslizar, aoTocar) {
  let inicio = null;
  area.addEventListener('pointerdown', (e) => { inicio = { x: e.clientX, y: e.clientY }; });
  area.addEventListener('pointerup', (e) => {
    if (!inicio) return;
    const dx = e.clientX - inicio.x;
    const dy = e.clientY - inicio.y;
    inicio = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) {
      if (aoTocar) aoTocar();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) aoDeslizar(dx > 0 ? 'direita' : 'esquerda');
    else aoDeslizar(dy > 0 ? 'baixo' : 'cima');
  });
  area.addEventListener('pointercancel', () => { inicio = null; });
}

function viewVisivel(nome) {
  return !$('#view-' + nome).classList.contains('hidden');
}

// --- Jogo da Cobrinha ---

const cobrinha = {
  canvas: null,
  ctx: null,
  cell: 20,
  cols: 15,
  linhas: 15,
  cobra: [],
  direcao: 'direita',
  proximaDirecao: 'direita',
  comida: { x: 0, y: 0 },
  pontos: 0,
  intervalId: null,
};

function medirCobrinha() {
  const tela = $('#cobrinha-tela');
  const largura = tela.clientWidth;
  const altura = tela.clientHeight;
  cobrinha.cols = 15;
  cobrinha.cell = Math.max(8, Math.floor(largura / cobrinha.cols));
  cobrinha.linhas = Math.max(10, Math.floor(altura / cobrinha.cell));
  cobrinha.canvas = $('#cobrinha-canvas');
  cobrinha.ctx = ajustarCanvas(cobrinha.canvas, cobrinha.cols * cobrinha.cell, cobrinha.linhas * cobrinha.cell);
}

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
  ctx.fillStyle = LCD.fundo;
  ctx.fillRect(0, 0, cols * cell, linhas * cell);

  // Comida: quatro pontinhos em cruz, como no Snake do Nokia.
  const t = cell / 3;
  const cx = cobrinha.comida.x * cell;
  const cy = cobrinha.comida.y * cell;
  ctx.fillStyle = LCD.tinta;
  ctx.fillRect(cx + t, cy, t, t);
  ctx.fillRect(cx, cy + t, t, t);
  ctx.fillRect(cx + 2 * t, cy + t, t, t);
  ctx.fillRect(cx + t, cy + 2 * t, t, t);

  cobrinha.cobra.forEach((seg, i) => {
    if (i === 0) {
      ctx.fillStyle = LCD.tinta;
      ctx.fillRect(seg.x * cell + 1, seg.y * cell + 1, cell - 2, cell - 2);
    } else {
      desenharBloco(ctx, seg.x * cell, seg.y * cell, cell, LCD.tinta);
    }
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
    $('#cobrinha-pontos').textContent = formatarPontos(cobrinha.pontos);
    posicionarComidaCobrinha();
  } else {
    cobrinha.cobra.pop();
  }

  desenharCobrinha();
}

function fimDeJogoCobrinha() {
  pararCobrinha();
  $('#cobrinha-fim-pontos').textContent = `Pontos: ${cobrinha.pontos}`;
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
  $('#cobrinha-fim').classList.add('hidden');
  medirCobrinha();
  const meioX = Math.floor(cobrinha.cols / 2);
  const meioY = Math.floor(cobrinha.linhas / 2);
  cobrinha.cobra = [
    { x: meioX, y: meioY },
    { x: meioX - 1, y: meioY },
    { x: meioX - 2, y: meioY },
  ];
  cobrinha.direcao = 'direita';
  cobrinha.proximaDirecao = 'direita';
  cobrinha.pontos = 0;
  $('#cobrinha-pontos').textContent = formatarPontos(0);
  posicionarComidaCobrinha();
  desenharCobrinha();
  cobrinha.intervalId = setInterval(tickCobrinha, 190);
}

function configurarCobrinha() {
  $all('#view-cobrinha .tecla').forEach((btn) => {
    ligarTecla(btn, () => mudarDirecaoCobrinha(btn.dataset.dir), false);
  });
  $('#cobrinha-reiniciar').addEventListener('click', iniciarCobrinha);
  $('#cobrinha-fim-voltar').addEventListener('click', () => {
    pararCobrinha();
    mostrarView('jogos');
  });
  ligarDeslize($('#cobrinha-tela'), mudarDirecaoCobrinha);
}

// --- Jogo de Tetris ---

const TETROMINOS = [
  [[1, 1, 1, 1]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1]],
  [[0, 1, 1], [1, 1, 0]],
  [[1, 1, 0], [0, 1, 1]],
  [[1, 0, 0], [1, 1, 1]],
  [[0, 0, 1], [1, 1, 1]],
];

const TETRIS_LADO = 4.6; // largura do painel lateral, em blocos

const tetris = {
  canvas: null,
  ctx: null,
  cell: 18,
  cols: 10,
  linhas: 20,
  larguraTotal: 0,
  tabuleiro: [],
  peca: null,
  proxima: null,
  pontos: 0,
  linhasFeitas: 0,
  velocidade: 600,
  intervalId: null,
};

function medirTetris() {
  const tela = $('#tetris-tela');
  const largura = tela.clientWidth;
  const altura = tela.clientHeight;
  tetris.cols = 10;
  tetris.cell = Math.max(8, Math.floor(Math.min(altura / 20, largura / (tetris.cols + TETRIS_LADO))));
  tetris.linhas = Math.max(16, Math.min(24, Math.floor(altura / tetris.cell)));
  tetris.larguraTotal = Math.max(largura, Math.ceil(tetris.cell * (tetris.cols + 3)));
  tetris.canvas = $('#tetris-canvas');
  tetris.ctx = ajustarCanvas(tetris.canvas, tetris.larguraTotal, tetris.linhas * tetris.cell);
}

function tabuleiroVazioTetris() {
  return Array.from({ length: tetris.linhas }, () => Array(tetris.cols).fill(null));
}

function rotarMatriz(matriz) {
  const linhas = matriz.length;
  const colunas = matriz[0].length;
  const resultado = [];
  for (let c = 0; c < colunas; c++) {
    const novaLinha = [];
    for (let l = linhas - 1; l >= 0; l--) {
      novaLinha.push(matriz[l][c]);
    }
    resultado.push(novaLinha);
  }
  return resultado;
}

function sortearMatrizTetris() {
  const modelo = TETROMINOS[Math.floor(Math.random() * TETROMINOS.length)];
  return modelo.map((linha) => linha.slice());
}

function novaPecaTetris() {
  const matriz = tetris.proxima || sortearMatrizTetris();
  tetris.proxima = sortearMatrizTetris();
  return {
    matriz,
    x: Math.floor((tetris.cols - matriz[0].length) / 2),
    y: 0,
  };
}

function colisaoTetris(matriz, x, y) {
  for (let r = 0; r < matriz.length; r++) {
    for (let c = 0; c < matriz[r].length; c++) {
      if (!matriz[r][c]) continue;
      const nx = x + c;
      const ny = y + r;
      if (nx < 0 || nx >= tetris.cols || ny >= tetris.linhas) return true;
      if (ny >= 0 && tetris.tabuleiro[ny][nx]) return true;
    }
  }
  return false;
}

function nivelTetris() {
  return 1 + Math.floor(tetris.pontos / 300);
}

function desenharTetris() {
  const { ctx, cell, cols, linhas } = tetris;
  const larguraCampo = cols * cell;
  const altura = linhas * cell;
  ctx.fillStyle = LCD.fundo;
  ctx.fillRect(0, 0, tetris.larguraTotal, altura);

  for (let y = 0; y < linhas; y++) {
    for (let x = 0; x < cols; x++) {
      desenharBloco(ctx, x * cell, y * cell, cell, tetris.tabuleiro[y][x] ? LCD.tinta : LCD.apagado);
    }
  }

  if (tetris.peca) {
    tetris.peca.matriz.forEach((linha, r) => {
      linha.forEach((val, c) => {
        if (!val) return;
        const px = tetris.peca.x + c;
        const py = tetris.peca.y + r;
        if (py < 0) return;
        desenharBloco(ctx, px * cell, py * cell, cell, LCD.tinta);
      });
    });
  }

  // Painel lateral: divisória, próxima peça, nível e linhas.
  ctx.fillStyle = LCD.tinta;
  ctx.fillRect(larguraCampo + 2, 0, 2, altura);

  const ladoX = larguraCampo + 4;
  const ladoLargura = tetris.larguraTotal - ladoX;
  const centro = ladoX + ladoLargura / 2;
  const fonte = Math.max(10, Math.round(cell * 0.62));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${fonte}px "Courier New", monospace`;
  ctx.fillText('PRÓXIMA', centro, cell * 0.5);

  const mini = Math.min(cell, Math.floor((ladoLargura - 8) / 4));
  if (tetris.proxima) {
    const m = tetris.proxima;
    const ox = centro - (m[0].length * mini) / 2;
    const oy = cell * 1.6 + ((2 - m.length) * mini) / 2;
    m.forEach((linha, r) => linha.forEach((val, c) => {
      if (val) desenharBloco(ctx, ox + c * mini, oy + r * mini, mini, LCD.tinta);
    }));
  }

  const fonteNumero = Math.round(fonte * 1.5);
  let y = cell * 1.6 + 2 * mini + cell * 0.9;
  [['NÍVEL', nivelTetris()], ['LINHAS', tetris.linhasFeitas]].forEach(([rotulo, valor]) => {
    ctx.font = `700 ${fonte}px "Courier New", monospace`;
    ctx.fillText(rotulo, centro, y);
    ctx.font = `700 ${fonteNumero}px "Courier New", monospace`;
    ctx.fillText(String(valor), centro, y + fonte * 1.2);
    y += fonte * 1.2 + fonteNumero + cell * 0.8;
  });
}

function fixarPecaTetris() {
  tetris.peca.matriz.forEach((linha, r) => {
    linha.forEach((val, c) => {
      if (!val) return;
      const py = tetris.peca.y + r;
      const px = tetris.peca.x + c;
      if (py >= 0) tetris.tabuleiro[py][px] = 1;
    });
  });
}

function limparLinhasTetris() {
  const pontosPorLinhas = [0, 100, 300, 500, 800];
  let linhasCompletas = 0;
  tetris.tabuleiro = tetris.tabuleiro.filter((linha) => {
    const completa = linha.every((celula) => celula);
    if (completa) linhasCompletas++;
    return !completa;
  });
  while (tetris.tabuleiro.length < tetris.linhas) {
    tetris.tabuleiro.unshift(Array(tetris.cols).fill(null));
  }
  if (linhasCompletas > 0) {
    tetris.linhasFeitas += linhasCompletas;
    tetris.pontos += pontosPorLinhas[linhasCompletas] || linhasCompletas * 200;
    $('#tetris-pontos').textContent = formatarPontos(tetris.pontos);
    tetris.velocidade = Math.max(180, 600 - Math.floor(tetris.pontos / 300) * 30);
    reiniciarIntervaloTetris();
  }
}

function reiniciarIntervaloTetris() {
  if (tetris.intervalId) clearInterval(tetris.intervalId);
  tetris.intervalId = setInterval(tickTetris, tetris.velocidade);
}

function tickTetris() {
  if (!colisaoTetris(tetris.peca.matriz, tetris.peca.x, tetris.peca.y + 1)) {
    tetris.peca.y += 1;
  } else {
    fixarPecaTetris();
    limparLinhasTetris();
    tetris.peca = novaPecaTetris();
    if (colisaoTetris(tetris.peca.matriz, tetris.peca.x, tetris.peca.y)) {
      desenharTetris();
      fimDeJogoTetris();
      return;
    }
  }
  desenharTetris();
}

function fimDeJogoTetris() {
  pararTetris();
  $('#tetris-fim-pontos').textContent = `Pontos: ${tetris.pontos}`;
  $('#tetris-fim').classList.remove('hidden');
}

function tetrisRodando() {
  return Boolean(tetris.intervalId && tetris.peca);
}

function moverTetris(dx) {
  if (!tetrisRodando()) return;
  if (!colisaoTetris(tetris.peca.matriz, tetris.peca.x + dx, tetris.peca.y)) {
    tetris.peca.x += dx;
    desenharTetris();
  }
}

function descerTetris() {
  if (!tetrisRodando()) return;
  if (!colisaoTetris(tetris.peca.matriz, tetris.peca.x, tetris.peca.y + 1)) {
    tetris.peca.y += 1;
    desenharTetris();
  }
}

function girarTetris() {
  if (!tetrisRodando()) return;
  const novaMatriz = rotarMatriz(tetris.peca.matriz);
  const tentativas = [0, -1, 1, -2, 2];
  for (let i = 0; i < tentativas.length; i++) {
    const novoX = tetris.peca.x + tentativas[i];
    if (!colisaoTetris(novaMatriz, novoX, tetris.peca.y)) {
      tetris.peca.matriz = novaMatriz;
      tetris.peca.x = novoX;
      desenharTetris();
      return;
    }
  }
}

function pararTetris() {
  if (tetris.intervalId) {
    clearInterval(tetris.intervalId);
    tetris.intervalId = null;
  }
}

function iniciarTetris() {
  pararTetris();
  $('#tetris-fim').classList.add('hidden');
  medirTetris();
  tetris.tabuleiro = tabuleiroVazioTetris();
  tetris.pontos = 0;
  tetris.linhasFeitas = 0;
  tetris.velocidade = 600;
  $('#tetris-pontos').textContent = formatarPontos(0);
  tetris.proxima = null;
  tetris.peca = novaPecaTetris();
  desenharTetris();
  reiniciarIntervaloTetris();
}

function acaoTetris(acao) {
  if (acao === 'esquerda') moverTetris(-1);
  if (acao === 'direita') moverTetris(1);
  if (acao === 'girar' || acao === 'cima') girarTetris();
  if (acao === 'baixo') descerTetris();
}

function configurarTetris() {
  $all('#view-tetris .tecla').forEach((btn) => {
    const acao = btn.dataset.tetris;
    ligarTecla(btn, () => acaoTetris(acao), acao !== 'girar');
  });
  $('#tetris-reiniciar').addEventListener('click', iniciarTetris);
  $('#tetris-fim-voltar').addEventListener('click', () => {
    pararTetris();
    mostrarView('jogos');
  });
  ligarDeslize($('#tetris-tela'), acaoTetris, girarTetris);
}

// Teclado (para testar no computador).
document.addEventListener('keydown', (e) => {
  const setas = { ArrowUp: 'cima', ArrowDown: 'baixo', ArrowLeft: 'esquerda', ArrowRight: 'direita' };
  const dir = setas[e.key];
  if (!dir) return;
  if (viewVisivel('cobrinha')) mudarDirecaoCobrinha(dir);
  else if (viewVisivel('tetris')) acaoTetris(dir);
});

// --- Jogo de Damas ---

const damas = {
  tabuleiro: [],
  selecionada: null,
  destinosValidos: [],
  vez: 'jogador',
  fim: false,
  timeoutBot: null,
};

function casaEscuraDamas(x, y) {
  return (x + y) % 2 === 1;
}

function tabuleiroInicialDamas() {
  const tabuleiro = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (!casaEscuraDamas(x, y)) continue;
      if (y < 3) tabuleiro[y][x] = { cor: 'bot', dama: false };
      if (y > 4) tabuleiro[y][x] = { cor: 'jogador', dama: false };
    }
  }
  return tabuleiro;
}

function direcoesDaPecaDamas(peca) {
  if (peca.dama) return [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  return peca.cor === 'jogador' ? [[-1, -1], [1, -1]] : [[-1, 1], [1, 1]];
}

function movimentosDaPecaDamas(tabuleiro, x, y) {
  const peca = tabuleiro[y][x];
  const simples = [];
  const capturas = [];
  direcoesDaPecaDamas(peca).forEach(([dx, dy]) => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= 8 || ny < 0 || ny >= 8) return;
    if (!tabuleiro[ny][nx]) {
      simples.push({ x: nx, y: ny, captura: null });
    } else if (tabuleiro[ny][nx].cor !== peca.cor) {
      const jx = x + dx * 2;
      const jy = y + dy * 2;
      if (jx >= 0 && jx < 8 && jy >= 0 && jy < 8 && !tabuleiro[jy][jx]) {
        capturas.push({ x: jx, y: jy, captura: { x: nx, y: ny } });
      }
    }
  });
  return { simples, capturas };
}

function todosMovimentosDamas(tabuleiro, cor) {
  const lista = [];
  let temCaptura = false;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const peca = tabuleiro[y][x];
      if (!peca || peca.cor !== cor) continue;
      const { simples, capturas } = movimentosDaPecaDamas(tabuleiro, x, y);
      if (capturas.length) temCaptura = true;
      capturas.forEach((destino) => lista.push({ origem: { x, y }, destino }));
      simples.forEach((destino) => lista.push({ origem: { x, y }, destino }));
    }
  }
  return temCaptura ? lista.filter((m) => m.destino.captura) : lista;
}

function executarMovimentoDamas(tabuleiro, mov) {
  const peca = tabuleiro[mov.origem.y][mov.origem.x];
  tabuleiro[mov.origem.y][mov.origem.x] = null;
  if (mov.destino.captura) {
    tabuleiro[mov.destino.captura.y][mov.destino.captura.x] = null;
  }
  const promovido = (peca.cor === 'jogador' && mov.destino.y === 0) || (peca.cor === 'bot' && mov.destino.y === 7);
  tabuleiro[mov.destino.y][mov.destino.x] = { cor: peca.cor, dama: peca.dama || promovido };
}

function contarPecasDamas(tabuleiro, cor) {
  let total = 0;
  tabuleiro.forEach((linha) => linha.forEach((peca) => {
    if (peca && peca.cor === cor) total += 1;
  }));
  return total;
}

function renderDamas() {
  const container = $('#damas-tabuleiro');
  container.innerHTML = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const casa = document.createElement('button');
      casa.className = `damas-casa ${casaEscuraDamas(x, y) ? 'escura' : 'clara'}`;
      casa.dataset.x = x;
      casa.dataset.y = y;

      if (damas.selecionada && damas.selecionada.x === x && damas.selecionada.y === y) {
        casa.classList.add('selecionada');
      }
      if (damas.destinosValidos.some((d) => d.x === x && d.y === y)) {
        casa.classList.add('movivel');
      }

      const peca = damas.tabuleiro[y][x];
      if (peca) {
        const pecaEl = document.createElement('div');
        pecaEl.className = `peca ${peca.cor}${peca.dama ? ' dama' : ''}`;
        casa.appendChild(pecaEl);
      }

      container.appendChild(casa);
    }
  }
}

function fimDeJogoDamas(vencedor) {
  damas.fim = true;
  const texto = vencedor === 'jogador' ? 'Você venceu! 🎉' : 'O computador venceu, jogue de novo!';
  $('#damas-fim-texto').textContent = texto;
  $('#damas-fim').classList.remove('hidden');
}

function verificarFimDamas() {
  if (contarPecasDamas(damas.tabuleiro, 'bot') === 0 || todosMovimentosDamas(damas.tabuleiro, 'bot').length === 0) {
    fimDeJogoDamas('jogador');
    return true;
  }
  if (contarPecasDamas(damas.tabuleiro, 'jogador') === 0 || todosMovimentosDamas(damas.tabuleiro, 'jogador').length === 0) {
    fimDeJogoDamas('bot');
    return true;
  }
  return false;
}

function jogarBotDamas() {
  if (damas.fim) return;
  const movimentos = todosMovimentosDamas(damas.tabuleiro, 'bot');
  if (movimentos.length === 0) {
    fimDeJogoDamas('jogador');
    return;
  }
  const escolhido = movimentos[Math.floor(Math.random() * movimentos.length)];
  executarMovimentoDamas(damas.tabuleiro, escolhido);
  renderDamas();
  if (verificarFimDamas()) return;
  damas.vez = 'jogador';
  $('#damas-status').textContent = 'Sua vez';
}

function selecionarCasaDamas(x, y) {
  if (damas.fim || damas.vez !== 'jogador') return;
  const peca = damas.tabuleiro[y][x];

  const destino = damas.destinosValidos.find((d) => d.x === x && d.y === y);
  if (damas.selecionada && destino) {
    executarMovimentoDamas(damas.tabuleiro, { origem: damas.selecionada, destino });
    damas.selecionada = null;
    damas.destinosValidos = [];
    renderDamas();
    if (verificarFimDamas()) return;
    damas.vez = 'bot';
    $('#damas-status').textContent = 'Vez do computador...';
    damas.timeoutBot = setTimeout(jogarBotDamas, 600);
    return;
  }

  if (peca && peca.cor === 'jogador') {
    const movimentosPossiveis = todosMovimentosDamas(damas.tabuleiro, 'jogador');
    const movimentosDaPeca = movimentosPossiveis.filter((m) => m.origem.x === x && m.origem.y === y);
    if (movimentosDaPeca.length === 0) {
      damas.selecionada = null;
      damas.destinosValidos = [];
    } else {
      damas.selecionada = { x, y };
      damas.destinosValidos = movimentosDaPeca.map((m) => m.destino);
    }
  } else {
    damas.selecionada = null;
    damas.destinosValidos = [];
  }
  renderDamas();
}

function pararDamas() {
  if (damas.timeoutBot) {
    clearTimeout(damas.timeoutBot);
    damas.timeoutBot = null;
  }
  damas.fim = true;
}

function iniciarDamas() {
  if (damas.timeoutBot) clearTimeout(damas.timeoutBot);
  damas.tabuleiro = tabuleiroInicialDamas();
  damas.selecionada = null;
  damas.destinosValidos = [];
  damas.vez = 'jogador';
  damas.fim = false;
  damas.timeoutBot = null;
  $('#damas-status').textContent = 'Sua vez';
  $('#damas-fim').classList.add('hidden');
  renderDamas();
}

function configurarDamas() {
  $('#damas-tabuleiro').addEventListener('click', (e) => {
    const casa = e.target.closest('.damas-casa');
    if (!casa) return;
    selecionarCasaDamas(Number(casa.dataset.x), Number(casa.dataset.y));
  });
  $('#damas-reiniciar').addEventListener('click', iniciarDamas);
  $('#damas-fim-voltar').addEventListener('click', () => {
    pararDamas();
    mostrarView('jogos');
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
  configurarTetris();
  configurarDamas();
  configurarConfig();
  const dados = await obterConteudo();
  renderDesktop(dados);

  // Dentro da Lumi (iframe) só os jogos aparecem, e o "Voltar" devolve para ela.
  if (EMBUTIDO) {
    renderJogos(dados);
    mostrarView('jogos');
    return;
  }
  mostrarView('desktop');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

iniciar();
