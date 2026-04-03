/**
 * admin.js — Painel administrativo VoteChain
 * Conecta nas rotas /api/admin/* do server.js
 */

// ─── Estado ───────────────────────────────────────────────────────────────────
const estadoAdmin = {
  senhaAtual: null,
  candidatosLocais: [], // candidatos adicionados antes do deploy
  eleicaoCriada: false,
};

// ─── Utilitários ──────────────────────────────────────────────────────────────

async function api(path, opcoes = {}) {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': estadoAdmin.senhaAtual || '',
    },
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

// ─── Login ────────────────────────────────────────────────────────────────────

async function fazerLogin() {
  const senha = document.getElementById('senhaAdmin')?.value?.trim();
  if (!senha) {
    mostrarMensagem('msgLogin', 'Digite a senha.', 'erro');
    return;
  }

  mostrarMensagem('msgLogin', 'Verificando...', 'info');

  // Testa a senha fazendo uma chamada protegida
  try {
    const res = await fetch('/api/eleicao/atual', {
      headers: { 'x-admin-secret': senha },
    });

    // Se o server respondeu (independente do conteúdo), a senha está correta
    // (o server.js não protege /api/eleicao/atual, então fazemos uma rota de teste diferente)
    // Vamos testar com uma rota admin real
    const testRes = await fetch('/api/admin/eleicao', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': senha,
      },
      body: JSON.stringify({ nomeEleicao: '__teste__' }),
    });

    const testDados = await testRes.json();

    if (testRes.status === 401) {
      mostrarMensagem('msgLogin', 'Senha incorreta.', 'erro');
      return;
    }

    // Senha ok
    estadoAdmin.senhaAtual = senha;
    document.getElementById('overlayLogin').style.display = 'none';
    document.getElementById('adminWrapper').style.display = 'grid';

    await inicializarAdmin();

  } catch {
    mostrarMensagem('msgLogin', 'Erro ao conectar. Servidor está rodando?', 'erro');
  }
}

function sair() {
  estadoAdmin.senhaAtual = null;
  document.getElementById('overlayLogin').style.display = 'flex';
  document.getElementById('adminWrapper').style.display = 'none';
  document.getElementById('senhaAdmin').value = '';
}

// ─── Navegação ────────────────────────────────────────────────────────────────

function mostrarAba(nomeAba) {
  document.querySelectorAll('.aba').forEach(a => a.classList.remove('aba--ativa'));
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('sidebar-item--ativo'));

  const aba = document.getElementById(`aba-${nomeAba}`);
  if (aba) aba.classList.add('aba--ativa');

  // Marca botão ativo
  document.querySelectorAll('.sidebar-item').forEach(btn => {
    if (btn.getAttribute('onclick')?.includes(nomeAba)) {
      btn.classList.add('sidebar-item--ativo');
    }
  });

  // Carrega dados da aba
  if (nomeAba === 'gerenciar') carregarEleicaoAtiva();
  if (nomeAba === 'historico') carregarHistoricoAdmin();
}

// ─── Status da rede ───────────────────────────────────────────────────────────

async function carregarRedeAdmin() {
  try {
    const dados = await fetch('/api/rede').then(r => r.json());
    const el = document.getElementById('textoRedeSidebar');
    if (el) el.textContent = `Bloco #${dados.alturaBlockchain}`;
  } catch {
    const el = document.getElementById('textoRedeSidebar');
    if (el) el.textContent = 'Rede offline';
  }
}

// ─── Criar eleição ────────────────────────────────────────────────────────────

async function criarEleicao() {
  const nome = document.getElementById('nomeNovaEleicao')?.value?.trim();

  if (!nome) {
    mostrarMensagem('msgNovaEleicao', 'Informe o nome da eleição.', 'erro');
    return;
  }

  const btn = document.getElementById('btnCriarEleicao');
  if (btn) { btn.disabled = true; btn.textContent = 'Deployando contrato...'; }
  mostrarMensagem('msgNovaEleicao', 'Compilando e deployando contrato na blockchain. Aguarde...', 'info');

  try {
    const dados = await api('/api/admin/eleicao', {
      method: 'POST',
      body: JSON.stringify({ nomeEleicao: nome }),
    });

    if (dados.erro) {
      mostrarMensagem('msgNovaEleicao', dados.erro, 'erro');
      if (btn) { btn.disabled = false; btn.textContent = 'Criar eleição na blockchain'; }
      return;
    }

    mostrarMensagem('msgNovaEleicao', `✓ Eleição criada! Contrato: ${dados.endereco}`, 'sucesso');
    estadoAdmin.eleicaoCriada = true;

    if (btn) { btn.disabled = false; btn.textContent = 'Criar eleição na blockchain'; }

    // Adiciona candidatos que estavam na fila local
    if (estadoAdmin.candidatosLocais.length > 0) {
      mostrarMensagem('msgCandidato', 'Adicionando candidatos ao contrato...', 'info');
      for (const nome of estadoAdmin.candidatosLocais) {
        await adicionarCandidatoContrato(nome);
      }
      estadoAdmin.candidatosLocais = [];
      mostrarMensagem('msgCandidato', '✓ Todos os candidatos adicionados.', 'sucesso');
    }

  } catch (e) {
    mostrarMensagem('msgNovaEleicao', 'Erro no deploy: ' + e.message, 'erro');
    if (btn) { btn.disabled = false; btn.textContent = 'Criar eleição na blockchain'; }
  }
}

// ─── Candidatos ───────────────────────────────────────────────────────────────

async function adicionarCandidato() {
  const input = document.getElementById('nomeCandidato');
  const nome = input?.value?.trim();

  if (!nome) {
    mostrarMensagem('msgCandidato', 'Informe o nome do candidato.', 'erro');
    return;
  }

  if (estadoAdmin.eleicaoCriada) {
    await adicionarCandidatoContrato(nome);
  } else {
    // Guarda localmente até o deploy
    estadoAdmin.candidatosLocais.push(nome);
    renderizarCandidatosLocais();
    mostrarMensagem('msgCandidato', `"${nome}" será adicionado ao criar a eleição.`, 'info');
  }

  if (input) input.value = '';
}

async function adicionarCandidatoContrato(nome) {
  try {
    const dados = await api('/api/admin/candidato', {
      method: 'POST',
      body: JSON.stringify({ nome }),
    });

    if (dados.erro) {
      mostrarMensagem('msgCandidato', dados.erro, 'erro');
      return false;
    }

    renderizarCandidatosLocais();
    return true;
  } catch {
    return false;
  }
}

function renderizarCandidatosLocais() {
  const container = document.getElementById('listaCandidatosAdmin');
  if (!container) return;

  if (estadoAdmin.candidatosLocais.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = estadoAdmin.candidatosLocais.map((nome, i) => `
    <div class="candidato-admin-item">
      <span>#${i + 1}</span> ${nome}
      <small style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.7rem;margin-left:auto;">pendente</small>
    </div>
  `).join('');
}

// ─── Gerenciar eleição ativa ──────────────────────────────────────────────────

async function carregarEleicaoAtiva() {
  const container = document.getElementById('infoEleicaoAtiva');
  const resultados = document.getElementById('resultadosAdmin');

  try {
    const dados = await fetch('/api/eleicao/atual').then(r => r.json());

    if (dados.erro) {
      if (container) container.innerHTML = `<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.88rem;">Nenhuma eleição ativa. Crie uma na aba "Nova Eleição".</p>`;
      return;
    }

    if (container) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-family:var(--fonte-display);font-size:1.3rem;font-weight:800;margin-bottom:6px;">${dados.nome}</div>
            <span class="card-eleicao__estado estado--${dados.estado}">${traduzirEstado(dados.estado)}</span>
          </div>
          <div style="font-family:var(--fonte-mono);font-size:0.78rem;color:var(--cinza-400);text-align:right;">
            ${dados.totalVotos} voto(s)<br>
            ${dados.candidatos.length} candidato(s)<br>
            <span style="word-break:break-all;">${dados.endereco.slice(0, 20)}...</span>
          </div>
        </div>
      `;
    }

    // Resultados
    if (resultados) {
      if (dados.candidatos.length === 0) {
        resultados.innerHTML = '<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.82rem;">Nenhum candidato ainda.</p>';
      } else {
        const total = dados.totalVotos || 0;
        resultados.innerHTML = dados.candidatos.map(c => {
          const pct = total === 0 ? 0 : ((c.votos / total) * 100).toFixed(1);
          return `
            <div class="resultado-item">
              <div class="resultado-item__cabecalho">
                <span class="resultado-item__nome">${c.nome}</span>
                <span class="resultado-item__votos">${c.votos} · ${pct}%</span>
              </div>
              <div class="barra-resultado">
                <div class="barra-resultado__fill" style="width:${pct}%"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Habilita/desabilita botões por estado
    const btnIniciar = document.getElementById('btnIniciar');
    const btnEncerrar = document.getElementById('btnEncerrar');
    if (btnIniciar) btnIniciar.disabled = dados.estado !== 'Aberta';
    if (btnEncerrar) btnEncerrar.disabled = dados.estado !== 'EmVotacao';

  } catch {
    if (container) container.innerHTML = '<p style="color:var(--cinza-400);">Erro ao carregar.</p>';
  }
}

async function iniciarVotacao() {
  mostrarMensagem('msgAcoes', 'Iniciando votação na blockchain...', 'info');
  try {
    const dados = await api('/api/admin/iniciar', { method: 'POST', body: '{}' });
    if (dados.erro) { mostrarMensagem('msgAcoes', dados.erro, 'erro'); return; }
    mostrarMensagem('msgAcoes', '✓ Votação iniciada!', 'sucesso');
    setTimeout(carregarEleicaoAtiva, 2000);
  } catch {
    mostrarMensagem('msgAcoes', 'Erro ao iniciar votação.', 'erro');
  }
}

async function encerrarVotacao() {
  if (!confirm('Encerrar a votação? Esta ação é irreversível.')) return;
  mostrarMensagem('msgAcoes', 'Encerrando votação...', 'info');
  try {
    const dados = await api('/api/admin/encerrar', { method: 'POST', body: '{}' });
    if (dados.erro) { mostrarMensagem('msgAcoes', dados.erro, 'erro'); return; }
    mostrarMensagem('msgAcoes', '✓ Votação encerrada!', 'sucesso');
    setTimeout(carregarEleicaoAtiva, 2000);
  } catch {
    mostrarMensagem('msgAcoes', 'Erro ao encerrar votação.', 'erro');
  }
}

// ─── Autorizar eleitores ──────────────────────────────────────────────────────

function adicionarLog(identificador, ok, mensagem) {
  const container = document.getElementById('logAutorizacoes');
  if (!container) return;

  const vazio = container.querySelector('.log-vazio');
  if (vazio) vazio.remove();

  const item = document.createElement('div');
  item.className = `log-item log-item--${ok ? 'ok' : 'erro'}`;
  item.innerHTML = `
    <span>${ok ? '✓' : '✗'}</span>
    <div>
      <div style="color:var(--branco)">${identificador.slice(0, 6)}***</div>
      <div class="log-item__status">${mensagem}</div>
    </div>
    <span style="margin-left:auto;color:var(--cinza-400);font-size:0.7rem;">${new Date().toLocaleTimeString('pt-BR')}</span>
  `;

  container.insertBefore(item, container.firstChild);
}

async function autorizarEleitor() {
  const input = document.getElementById('inputEleitor');
  const identificador = input?.value?.trim();

  if (!identificador) {
    mostrarMensagem('msgAutorizar', 'Informe o identificador.', 'erro');
    return;
  }

  mostrarMensagem('msgAutorizar', 'Autorizando na blockchain...', 'info');

  try {
    const dados = await api('/api/admin/autorizar', {
      method: 'POST',
      body: JSON.stringify({ cpf: identificador }),
    });

    if (dados.erro) {
      mostrarMensagem('msgAutorizar', dados.erro, 'erro');
      adicionarLog(identificador, false, dados.erro);
      return;
    }

    mostrarMensagem('msgAutorizar', '✓ Eleitor autorizado!', 'sucesso');
    adicionarLog(identificador, true, 'Autorizado com sucesso');
    if (input) input.value = '';

  } catch {
    mostrarMensagem('msgAutorizar', 'Erro ao autorizar.', 'erro');
  }
}

async function autorizarLote() {
  const textarea = document.getElementById('listaEleitores');
  const texto = textarea?.value?.trim();

  if (!texto) {
    mostrarMensagem('msgLote', 'Cole a lista de identificadores.', 'erro');
    return;
  }

  const lista = texto.split('\n').map(l => l.trim()).filter(Boolean);

  if (lista.length === 0) {
    mostrarMensagem('msgLote', 'Nenhum identificador encontrado.', 'erro');
    return;
  }

  const progressoEl = document.getElementById('progressoLote');
  const barraEl = document.getElementById('barrLote');
  const textoEl = document.getElementById('textoLote');

  if (progressoEl) progressoEl.style.display = 'flex';

  let ok = 0;
  for (let i = 0; i < lista.length; i++) {
    const identificador = lista[i];
    const pct = ((i / lista.length) * 100).toFixed(0);
    if (barraEl) barraEl.style.width = `${pct}%`;
    if (textoEl) textoEl.textContent = `${i}/${lista.length}`;

    try {
      const dados = await api('/api/admin/autorizar', {
        method: 'POST',
        body: JSON.stringify({ cpf: identificador }),
      });

      if (dados.erro) {
        adicionarLog(identificador, false, dados.erro);
      } else {
        adicionarLog(identificador, true, 'Autorizado');
        ok++;
      }
    } catch {
      adicionarLog(identificador, false, 'Erro de conexão');
    }

    // Pequena pausa para não sobrecarregar
    await new Promise(r => setTimeout(r, 300));
  }

  if (barraEl) barraEl.style.width = '100%';
  if (textoEl) textoEl.textContent = `${lista.length}/${lista.length}`;
  mostrarMensagem('msgLote', `✓ Concluído: ${ok}/${lista.length} eleitores autorizados.`, 'sucesso');
  if (textarea) textarea.value = '';
}

// ─── Histórico ────────────────────────────────────────────────────────────────

async function carregarHistoricoAdmin() {
  const container = document.getElementById('historicoAdmin');
  if (!container) return;

  try {
    const dados = await fetch('/api/eleicoes').then(r => r.json());
    const lista = dados.eleicoes || [];

    if (lista.length === 0) {
      container.innerHTML = '<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.88rem;">Nenhuma eleição criada ainda.</p>';
      return;
    }

    container.innerHTML = [...lista].reverse().map((e, i) => `
      <div class="historico-item">
        <div>
          <div class="historico-item__nome">${e.nomeEleicao}</div>
          <div class="historico-item__meta">
            Criada em ${new Date(e.deployedAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}
          </div>
          <div class="historico-item__endereco">${e.endereco}</div>
        </div>
        <span style="font-family:var(--fonte-mono);font-size:0.72rem;color:var(--cinza-400);">#${lista.length - i}</span>
      </div>
    `).join('');

  } catch {
    container.innerHTML = '<p style="color:var(--cinza-400);">Erro ao carregar histórico.</p>';
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function inicializarAdmin() {
  await carregarRedeAdmin();
  setInterval(carregarRedeAdmin, 10000);
  setInterval(() => {
    const abaAtiva = document.querySelector('.aba--ativa');
    if (abaAtiva?.id === 'aba-gerenciar') carregarEleicaoAtiva();
  }, 8000);
}

document.addEventListener('DOMContentLoaded', () => {
  // Enter no campo de senha
  document.getElementById('senhaAdmin')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') fazerLogin();
  });
});
