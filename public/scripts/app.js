const estado = {
  eleicaoAtual: null,
  identificadorAtual: null,
};

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

function traduzirEstado(e) {
  return { Aberta: 'Aberta', EmVotacao: 'Em Votação', Encerrada: 'Encerrada' }[e] || e;
}

// ─── Rede ─────────────────────────────────────────────────────────────────────

async function carregarRede() {
  try {
    const dados = await api('/api/rede');
    const el = document.getElementById('textoStatusRede');
    if (el) el.textContent = `Rede ativa · Bloco #${dados.alturaBlockchain} · ${dados.validadores} validadores IBFT`;
    const s = document.getElementById('alturaBloco');    if (s) s.textContent = dados.alturaBlockchain.toLocaleString();
    const n = document.getElementById('nosConectados'); if (n) n.textContent = dados.nosConhecidos;
    const v = document.getElementById('numValidadores'); if (v) v.textContent = dados.validadores;
  } catch {
    const el = document.getElementById('textoStatusRede');
    if (el) el.textContent = 'Aguardando conexão com a rede...';
  }
}

// ─── Eleição atual ────────────────────────────────────────────────────────────

async function carregarEleicaoAtual() {
  const cardEl       = document.getElementById('cardEleicao');
  const nomeResultEl = document.getElementById('nomeEleicaoResultados');

  try {
    const dados = await api('/api/eleicao/atual');

    if (dados.erro) {
      if (cardEl) cardEl.innerHTML = `<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.88rem;">Nenhuma eleição ativa no momento.</p>`;
      if (nomeResultEl) nomeResultEl.textContent = 'Nenhuma eleição ativa.';
      return;
    }

    estado.eleicaoAtual = dados;

    if (cardEl) {
      const modoBadge = dados.modoAberto
        ? '<span style="font-family:var(--fonte-mono);font-size:0.7rem;color:var(--cinza-400);">🌐 Votação aberta</span>'
        : '<span style="font-family:var(--fonte-mono);font-size:0.7rem;color:var(--cinza-400);">🔒 Votação restrita</span>';
      const sigiloBadge = dados.sigilosa
        ? '<span style="font-family:var(--fonte-mono);font-size:0.7rem;color:var(--accent-green);margin-left:8px;">🕶️ Sigilosa</span>'
        : '';

      cardEl.innerHTML = `
        <div class="card-eleicao__nome">${dados.nome}</div>
        <span class="card-eleicao__estado estado--${dados.estado}">${traduzirEstado(dados.estado)}</span>
        ${modoBadge}
        ${sigiloBadge}
        <p style="font-family:var(--fonte-mono);font-size:0.82rem;color:var(--cinza-400);margin:8px 0;">
          ${dados.totalVotos} voto(s) registrado(s)
        </p>
        ${dados.estado === 'EmVotacao' ? '<a href="#votar" class="btn btn--primario" style="text-decoration:none;display:inline-flex;margin-top:8px;">Votar agora →</a>' : ''}
        <div class="card-eleicao__endereco">Contrato: ${dados.endereco}</div>
      `;
    }

    if (nomeResultEl) nomeResultEl.textContent = dados.nome;
    renderizarResultados(dados);

    const totalEl  = document.getElementById('totalVotos');
    const estadoEl = document.getElementById('estadoEleicao');
    if (totalEl)  totalEl.textContent  = dados.totalVotos;
    if (estadoEl) estadoEl.textContent = traduzirEstado(dados.estado);

    if (dados.estado === 'EmVotacao') {
      renderizarCandidatosVotacao(dados.candidatos);
      const nomeEl = document.getElementById('nomeEleicaoVotacao');
      if (nomeEl) nomeEl.textContent = dados.nome;
    }

  } catch {
    if (cardEl) cardEl.innerHTML = `<p style="color:var(--cinza-400);">Erro ao conectar com o servidor.</p>`;
  }
}

function renderizarResultados(dados) {
  const container = document.getElementById('resultadosCandidatos');
  if (!container) return;

  if (!dados.candidatos || dados.candidatos.length === 0) {
    container.innerHTML = '<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.88rem;">Nenhum candidato registrado.</p>';
    return;
  }

  if (dados.sigilosa && dados.estado !== 'Encerrada') {
    container.innerHTML = '<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.88rem;">Votação sigilosa. Resultados parciais ocultos até o encerramento.</p>';
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

// ─── Reset da interface de votação ────────────────────────────────────────────

function resetarInterfaceVotacao() {
  estado.identificadorAtual = null;

  const input = document.getElementById('inputIdentificador');
  if (input) input.value = '';

  const msgId = document.getElementById('msgIdentificador');
  if (msgId) { msgId.textContent = ''; msgId.className = 'mensagem'; }

  const cardCandidatos = document.getElementById('cardCandidatos');
  if (cardCandidatos) {
    cardCandidatos.classList.add('card--oculto');
    // Restaura conteúdo original dos candidatos
    const listaCandidatos = document.getElementById('listaCandidatos');
    const msgVoto = document.getElementById('msgVoto');
    if (msgVoto) { msgVoto.textContent = ''; msgVoto.className = 'mensagem'; }
    if (estado.eleicaoAtual) {
      renderizarCandidatosVotacao(estado.eleicaoAtual.candidatos);
    }
  }
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
    const dados = await api(`/api/votar/elegivel/${encodeURIComponent(identificador)}`);

    if (dados.erro) {
      mostrarMensagem('msgIdentificador', dados.erro, 'erro');
      return;
    }

    if (!dados.elegivel) {
      mostrarMensagem('msgIdentificador', dados.motivo, 'erro');
      return;
    }

    estado.identificadorAtual = identificador;
    mostrarMensagem('msgIdentificador', '✓ Identificador válido. Escolha seu candidato.', 'sucesso');

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

  mostrarMensagem('msgVoto', `Registrando voto em "${nomeCandidato}"...`, 'info');
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

    // Mostra confirmação
    const cardCandidatos = document.getElementById('cardCandidatos');
    if (cardCandidatos) {
      cardCandidatos.innerHTML = `
        <div style="text-align:center;padding:24px 0;">
          <div style="font-size:2.4rem;margin-bottom:16px;">✓</div>
          <h3 style="color:var(--verde);margin-bottom:8px;">Voto registrado!</h3>
          <p style="font-family:var(--fonte-mono);font-size:0.78rem;color:var(--cinza-400);line-height:1.8;">
            Candidato: <strong style="color:var(--branco);">${nomeCandidato}</strong><br>
            TX: ${dados.txHash?.slice(0, 20)}...<br>
            ID anônimo: ${dados.eleitorId}
          </p>
          <button class="btn btn--secundario" style="margin-top:20px;" onclick="proximoEleitor()">
            Próximo eleitor →
          </button>
        </div>
      `;
    }

    // Atualiza resultados após 2s
    setTimeout(async () => {
      await carregarEleicaoAtual();
    }, 2000);

  } catch {
    mostrarMensagem('msgVoto', 'Erro ao registrar voto. Tente novamente.', 'erro');
    document.querySelectorAll('.candidato-btn').forEach(b => b.disabled = false);
  }
}

// ─── Próximo eleitor ──────────────────────────────────────────────────────────

function proximoEleitor() {
  resetarInterfaceVotacao();
  // Restaura o card de candidatos original
  const cardCandidatos = document.getElementById('cardCandidatos');
  if (cardCandidatos && estado.eleicaoAtual) {
    cardCandidatos.innerHTML = `
      <h3>Escolha seu candidato</h3>
      <p class="card__sub" id="nomeEleicaoVotacao">${estado.eleicaoAtual.nome}</p>
      <div class="lista-candidatos" id="listaCandidatos"></div>
      <div class="mensagem" id="msgVoto"></div>
    `;
    renderizarCandidatosVotacao(estado.eleicaoAtual.candidatos);
    cardCandidatos.classList.add('card--oculto');
  }
  // Foca no campo de identificador
  setTimeout(() => {
    document.getElementById('inputIdentificador')?.focus();
  }, 100);
}

// ─── Histórico ────────────────────────────────────────────────────────────────

async function carregarHistorico() {
  const container = document.getElementById('historicoLista');
  if (!container) return;

  try {
    const dados = await api('/api/eleicoes');
    const lista  = dados.eleicoes || [];

    if (lista.length === 0) {
      container.innerHTML = '<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.88rem;">Nenhuma eleição registrada ainda.</p>';
      return;
    }

    container.innerHTML = [...lista].reverse().map(e => `
      <div class="historico-item">
        <div>
          <div class="historico-item__nome">${e.nomeEleicao}</div>
          <div class="historico-item__meta">
            ${e.modoAberto ? '🌐 Aberta' : '🔒 Restrita'} ·
            ${new Date(e.deployedAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
          </div>
          <div class="historico-item__endereco">Contrato: ${e.endereco}</div>
        </div>
        <button class="btn btn--secundario" onclick="verDetalhesEleicao('${e.endereco}')" style="white-space:nowrap;font-size:0.82rem;padding:10px 18px;">
          Ver votos
        </button>
      </div>
    `).join('');

  } catch {
    container.innerHTML = '<p style="color:var(--cinza-400);">Erro ao carregar histórico.</p>';
  }
}

async function verDetalhesEleicao(endereco) {
  try {
    const dados = await api(`/api/eleicao/${endereco}`);

    // Monta tabela de votos
    const candidatosMap = {};
    dados.candidatos.forEach(c => { candidatosMap[c.id] = c.nome; });

    const votosHtml = await carregarRegistrosVotos(endereco, dados, candidatosMap);

    // Cria modal simples
    const modal = document.createElement('div');
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;
      display:flex;align-items:center;justify-content:center;padding:24px;
    `;
    modal.innerHTML = `
      <div style="background:var(--cinza-900);border:1px solid var(--cinza-700);border-radius:24px;
                  padding:32px;max-width:720px;width:100%;max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
          <div>
            <h3 style="font-family:var(--fonte-display);font-size:1.3rem;margin-bottom:4px;">${dados.nome}</h3>
            <span style="font-family:var(--fonte-mono);font-size:0.72rem;color:var(--cinza-400);">${endereco}</span>
          </div>
          <button onclick="this.closest('div[style*=fixed]').remove()"
            style="background:var(--cinza-700);border:none;border-radius:999px;color:var(--branco);
                   padding:8px 16px;cursor:pointer;font-family:var(--fonte-mono);font-size:0.82rem;">
            Fechar ✕
          </button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">
          ${dados.candidatos.map(c => `
            <div style="background:var(--cinza-800);border-radius:12px;padding:16px;text-align:center;">
              <div style="font-family:var(--fonte-display);font-weight:700;font-size:1.1rem;">${c.nome}</div>
              <div style="font-family:var(--fonte-mono);font-size:1.4rem;color:var(--verde);margin-top:4px;">${c.votos}</div>
              <div style="font-family:var(--fonte-mono);font-size:0.7rem;color:var(--cinza-400);">votos</div>
            </div>
          `).join('')}
        </div>

        <h4 style="font-family:var(--fonte-mono);font-size:0.8rem;text-transform:uppercase;
                   letter-spacing:0.1em;color:var(--cinza-400);margin-bottom:12px;">
          Registro de votos on-chain (${dados.totalVotos} total)
        </h4>
        ${votosHtml}
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  } catch {
    alert('Erro ao carregar detalhes da eleição.');
  }
}

async function carregarRegistrosVotos(endereco, dados, candidatosMap) {
  try {
    const registros = await api(`/api/eleicao/${endereco}/votos`);

    if (registros.sigilosa) {
      return '<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.82rem;">Registros on-chain ocultados (Eleição Sigilosa). Será revelado após o encerramento.</p>';
    }

    if (!registros.votos || registros.votos.length === 0) {
      return '<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.82rem;">Nenhum voto registrado.</p>';
    }

    return `
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${registros.votos.map((v, i) => `
          <div style="background:var(--cinza-800);border-radius:10px;padding:12px 16px;
                      display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;">
            <span style="font-family:var(--fonte-mono);font-size:0.72rem;color:var(--cinza-400);">#${i + 1}</span>
            <span style="font-family:var(--fonte-mono);font-size:0.72rem;color:var(--cinza-200);word-break:break-all;">
              ${v.eleitorHash.slice(0, 18)}...${v.eleitorHash}
            </span>
            <span style="font-family:var(--fonte-display);font-weight:700;color:var(--verde);white-space:nowrap;">
              → ${candidatosMap[v.candidatoId] || `#${v.candidatoId}`}
            </span>
          </div>
        `).join('')}
      </div>
    `;
  } catch {
    return '<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.82rem;">Não foi possível carregar os registros de votos.</p>';
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function inicializar() {
  await Promise.all([carregarRede(), carregarEleicaoAtual(), carregarHistorico()]);
  setInterval(async () => {
    await carregarRede();
    await carregarEleicaoAtual();
  }, 10000);
}

document.addEventListener('DOMContentLoaded', inicializar);
