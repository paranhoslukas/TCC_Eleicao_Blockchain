/**
 * app.js — Frontend público VoteChain
 * Conecta nas rotas públicas do server.js
 */

// ─── Estado ───────────────────────────────────────────────────────────────────
const estado = {
  eleicaoAtual: null,
  identificadorAtual: null,
  hashAtual: null,
};

// ─── Utilitários ──────────────────────────────────────────────────────────────

async function api(path, opcoes = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  });
  return res.json();
}

function mostrarMensagem(id, texto, tipo = 'info') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = texto;
  el.className = `mensagem ${tipo}`;
}

function limparMensagem(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'mensagem';
  el.textContent = '';
}

// ─── Rede ─────────────────────────────────────────────────────────────────────

async function carregarRede() {
  try {
    const dados = await api('/api/rede');
    const el = document.getElementById('textoStatusRede');
    if (el) el.textContent = `Rede ativa · Bloco #${dados.alturaBlockchain} · ${dados.validadores} validadores IBFT`;

    const s = document.getElementById('alturaBloco');
    if (s) s.textContent = dados.alturaBlockchain.toLocaleString();
    const n = document.getElementById('nosConectados');
    if (n) n.textContent = dados.nosConhecidos;
    const v = document.getElementById('numValidadores');
    if (v) v.textContent = dados.validadores;
  } catch {
    const el = document.getElementById('textoStatusRede');
    if (el) el.textContent = 'Aguardando conexão com a rede...';
  }
}

// ─── Eleição atual ────────────────────────────────────────────────────────────

async function carregarEleicaoAtual() {
  const cardEl = document.getElementById('cardEleicao');
  const nomeResultEl = document.getElementById('nomeEleicaoResultados');

  try {
    const dados = await api('/api/eleicao/atual');

    if (dados.erro) {
      if (cardEl) cardEl.innerHTML = `<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.88rem;">Nenhuma eleição ativa no momento.</p>`;
      if (nomeResultEl) nomeResultEl.textContent = 'Nenhuma eleição ativa.';
      return;
    }

    estado.eleicaoAtual = dados;

    // Card no hero
    if (cardEl) {
      cardEl.innerHTML = `
        <div class="card-eleicao__nome">${dados.nome}</div>
        <span class="card-eleicao__estado estado--${dados.estado}">${traduzirEstado(dados.estado)}</span>
        <p style="font-family:var(--fonte-mono);font-size:0.82rem;color:var(--cinza-400);margin-bottom:8px;">
          ${dados.totalVotos} voto(s) registrado(s)
        </p>
        ${dados.estado === 'EmVotacao' ? '<a href="#votar" class="btn btn--primario" style="text-decoration:none;display:inline-flex;margin-top:8px;">Votar agora →</a>' : ''}
        <div class="card-eleicao__endereco">Contrato: ${dados.endereco}</div>
      `;
    }

    // Seção resultados
    if (nomeResultEl) nomeResultEl.textContent = dados.nome;
    renderizarResultados(dados);

    // Atualiza telemetria
    const totalEl = document.getElementById('totalVotos');
    if (totalEl) totalEl.textContent = dados.totalVotos;
    const estadoEl = document.getElementById('estadoEleicao');
    if (estadoEl) estadoEl.textContent = traduzirEstado(dados.estado);

    // Candidatos para votação
    if (dados.estado === 'EmVotacao') {
      renderizarCandidatosVotacao(dados.candidatos);
      const nomeEl = document.getElementById('nomeEleicaoVotacao');
      if (nomeEl) nomeEl.textContent = dados.nome;
    }

  } catch {
    if (cardEl) cardEl.innerHTML = `<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.88rem;">Erro ao conectar com o servidor.</p>`;
  }
}

function traduzirEstado(estado) {
  const map = { Aberta: 'Aberta', EmVotacao: 'Em Votação', Encerrada: 'Encerrada' };
  return map[estado] || estado;
}

function renderizarResultados(dados) {
  const container = document.getElementById('resultadosCandidatos');
  if (!container) return;

  if (!dados.candidatos || dados.candidatos.length === 0) {
    container.innerHTML = '<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.88rem;">Nenhum candidato registrado.</p>';
    return;
  }

  const total = dados.totalVotos || 0;

  container.innerHTML = dados.candidatos.map(c => {
    const pct = total === 0 ? 0 : ((c.votos / total) * 100).toFixed(1);
    return `
      <div class="resultado-item">
        <div class="resultado-item__cabecalho">
          <span class="resultado-item__nome">${c.nome}</span>
          <span class="resultado-item__votos">${c.votos} voto(s) · ${pct}%</span>
        </div>
        <div class="barra-resultado">
          <div class="barra-resultado__fill" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderizarCandidatosVotacao(candidatos) {
  const container = document.getElementById('listaCandidatos');
  if (!container) return;

  container.innerHTML = candidatos.map(c => `
    <button class="candidato-btn" onclick="votar(${c.id}, '${c.nome}')">
      <span>${c.nome}</span>
      <span class="candidato-btn__seta">→</span>
    </button>
  `).join('');
}

// ─── Verificar eleitor ────────────────────────────────────────────────────────

async function verificarEleitor() {
  const input = document.getElementById('inputIdentificador');
  const identificador = input?.value?.trim();

  if (!identificador) {
    mostrarMensagem('msgIdentificador', 'Digite seu identificador.', 'erro');
    return;
  }

  mostrarMensagem('msgIdentificador', 'Verificando...', 'info');

  try {
    const dados = await api(`/api/votar/status/${encodeURIComponent(identificador)}`);

    if (dados.jaVotou) {
      mostrarMensagem('msgIdentificador', 'Você já votou nesta eleição.', 'erro');
      return;
    }

    if (dados.erro) {
      mostrarMensagem('msgIdentificador', dados.erro, 'erro');
      return;
    }

    estado.identificadorAtual = identificador;
    mostrarMensagem('msgIdentificador', '✓ Identificador válido. Escolha seu candidato.', 'sucesso');

    // Mostra candidatos
    const cardCandidatos = document.getElementById('cardCandidatos');
    if (cardCandidatos) cardCandidatos.classList.remove('card--oculto');

  } catch {
    mostrarMensagem('msgIdentificador', 'Erro ao verificar. Tente novamente.', 'erro');
  }
}

// ─── Votar ────────────────────────────────────────────────────────────────────

async function votar(candidatoId, nomeCandidato) {
  if (!estado.identificadorAtual) {
    mostrarMensagem('msgVoto', 'Verifique seu identificador primeiro.', 'erro');
    return;
  }

  mostrarMensagem('msgVoto', `Registrando voto em "${nomeCandidato}" na blockchain...`, 'info');

  // Desabilita botões durante o envio
  document.querySelectorAll('.candidato-btn').forEach(b => b.disabled = true);

  try {
    const dados = await api('/api/votar', {
      method: 'POST',
      body: JSON.stringify({ cpf: estado.identificadorAtual, candidatoId }),
    });

    if (dados.erro) {
      mostrarMensagem('msgVoto', dados.erro, 'erro');
      document.querySelectorAll('.candidato-btn').forEach(b => b.disabled = false);
      return;
    }

    // Sucesso
    const cardCandidatos = document.getElementById('cardCandidatos');
    if (cardCandidatos) {
      cardCandidatos.innerHTML = `
        <div style="text-align:center;padding:24px 0;">
          <div style="font-size:2.4rem;margin-bottom:16px;">✓</div>
          <h3 style="color:var(--verde);margin-bottom:8px;">Voto registrado!</h3>
          <p style="font-family:var(--fonte-mono);font-size:0.78rem;color:var(--cinza-400);">
            Candidato: ${nomeCandidato}<br>
            TX: ${dados.txHash?.slice(0, 20)}...<br>
            ID anônimo: ${dados.eleitorId}
          </p>
        </div>
      `;
    }

    estado.identificadorAtual = null;

    // Atualiza resultados
    setTimeout(carregarEleicaoAtual, 2000);

  } catch {
    mostrarMensagem('msgVoto', 'Erro ao registrar voto. Tente novamente.', 'erro');
    document.querySelectorAll('.candidato-btn').forEach(b => b.disabled = false);
  }
}

// ─── Histórico ────────────────────────────────────────────────────────────────

async function carregarHistorico() {
  const container = document.getElementById('historicoLista');
  if (!container) return;

  try {
    const dados = await api('/api/eleicoes');
    const lista = dados.eleicoes || [];

    if (lista.length === 0) {
      container.innerHTML = '<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.88rem;">Nenhuma eleição registrada ainda.</p>';
      return;
    }

    container.innerHTML = [...lista].reverse().map(e => `
      <div class="historico-item">
        <div>
          <div class="historico-item__nome">${e.nomeEleicao}</div>
          <div class="historico-item__meta">Criada em ${new Date(e.deployedAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
          <div class="historico-item__endereco">Contrato: ${e.endereco}</div>
        </div>
        <button class="btn btn--secundario" onclick="verEleicao('${e.endereco}')" style="white-space:nowrap;font-size:0.82rem;padding:10px 18px;">
          Ver detalhes
        </button>
      </div>
    `).join('');

  } catch {
    container.innerHTML = '<p style="color:var(--cinza-400);">Erro ao carregar histórico.</p>';
  }
}

async function verEleicao(endereco) {
  try {
    const dados = await api(`/api/eleicao/${endereco}`);
    alert(`Eleição: ${dados.nome}\nEstado: ${traduzirEstado(dados.estado)}\nTotal de votos: ${dados.totalVotos}\nContrato: ${endereco}`);
  } catch {
    alert('Erro ao carregar eleição.');
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function inicializar() {
  await Promise.all([
    carregarRede(),
    carregarEleicaoAtual(),
    carregarHistorico(),
  ]);

  // Atualiza a cada 10s
  setInterval(async () => {
    await carregarRede();
    await carregarEleicaoAtual();
  }, 10000);
}

document.addEventListener('DOMContentLoaded', inicializar);
