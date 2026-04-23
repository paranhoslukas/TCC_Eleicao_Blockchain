const estadoAdmin = {
  senhaAtual: null,
  candidatosLocais: [],
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

  try {
    const res = await fetch('/api/admin/verificar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': senha,
      },
      body: '{}',
    });

    if (res.status === 401) {
      mostrarMensagem('msgLogin', 'Senha incorreta.', 'erro');
      return;
    }

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
  estadoAdmin.candidatosLocais = [];
  estadoAdmin.eleicaoCriada = false;
  document.getElementById('overlayLogin').style.display = 'flex';
  document.getElementById('adminWrapper').style.display = 'none';
  document.getElementById('senhaAdmin').value = '';
  limparMensagem('msgLogin');
}

function limparMensagem(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'mensagem';
  el.textContent = '';
}

// ─── Navegação ────────────────────────────────────────────────────────────────

function mostrarAba(nomeAba) {
  document.querySelectorAll('.aba').forEach(a => a.classList.remove('aba--ativa'));
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('sidebar-item--ativo'));

  const aba = document.getElementById(`aba-${nomeAba}`);
  if (aba) aba.classList.add('aba--ativa');

  document.querySelectorAll('.sidebar-item').forEach(btn => {
    if (btn.getAttribute('onclick')?.includes(nomeAba)) {
      btn.classList.add('sidebar-item--ativo');
    }
  });

  if (nomeAba === 'gerenciar') carregarEleicaoAtiva();
  if (nomeAba === 'historico') carregarHistoricoAdmin();
}

// ─── Modo votação ─────────────────────────────────────────────────────────────

function atualizarModo() {
  const modo = document.querySelector('input[name="modoVotacao"]:checked')?.value;
  const desc = document.getElementById('modoDescricao');
  if (modo === 'aberto') {
    if (desc) desc.textContent = '⚠️ Modo aberto: qualquer pessoa com acesso pode votar — sem autorização prévia. Ideal para demos ao vivo.';
  } else {
    if (desc) desc.textContent = '💡 Modo restrito: somente eleitores autorizados pelo admin podem votar. Ideal para eleições formais.';
  }
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

// ─── Aguardar contrato estar disponível (retry) ───────────────────────────────

async function aguardarContrato(endereco, tentativas = 10) {
  for (let i = 0; i < tentativas; i++) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const res = await fetch(`/api/eleicao/${endereco}`).then(r => r.json());
      if (res.nome) return true; // contrato respondendo
    } catch { /* aguarda próxima tentativa */ }
  }
  return false;
}

// ─── Criar eleição ────────────────────────────────────────────────────────────

async function criarEleicao() {
  const nome = document.getElementById('nomeNovaEleicao')?.value?.trim();
  const modoAberto = document.querySelector('input[name="modoVotacao"]:checked')?.value === 'aberto';

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
      body: JSON.stringify({ nomeEleicao: nome, modoAberto }),
    });

    if (dados.erro) {
      mostrarMensagem('msgNovaEleicao', dados.erro, 'erro');
      if (btn) { btn.disabled = false; btn.textContent = 'Criar eleição na blockchain'; }
      return;
    }

    mostrarMensagem('msgNovaEleicao', `✓ Eleição criada! Contrato: ${dados.endereco}`, 'sucesso');
    estadoAdmin.eleicaoCriada = true;

    if (btn) { btn.disabled = false; btn.textContent = 'Criar eleição na blockchain'; }

    // Envia candidatos pendentes ao contrato
    if (estadoAdmin.candidatosLocais.length > 0) {
      mostrarMensagem('msgCandidato', 'Aguardando contrato ficar disponível...', 'info');

      // CORRIGIDO: aguarda o contrato responder com retry em vez de timeout fixo
      const contratoOk = await aguardarContrato(dados.endereco);

      if (!contratoOk) {
        mostrarMensagem('msgCandidato', '⚠️ Contrato demorou para responder. Tente adicionar os candidatos manualmente.', 'erro');
        return;
      }

      let sucessos = 0;
      const lista = [...estadoAdmin.candidatosLocais];
      estadoAdmin.candidatosLocais = [];

      for (const nomeCandidato of lista) {
        const ok = await adicionarCandidatoContrato(nomeCandidato);
        if (ok) sucessos++;
      }

      // CORRIGIDO: após enviar candidatos pendentes, busca a lista real do contrato
      await atualizarListaCandidatosDoContrato();

      if (sucessos === lista.length) {
        mostrarMensagem('msgCandidato', `✓ ${sucessos} candidato(s) adicionado(s) com sucesso.`, 'sucesso');
      } else {
        mostrarMensagem('msgCandidato', `⚠️ ${sucessos}/${lista.length} candidatos adicionados. Verifique em Gerenciar Ativa.`, 'info');
      }
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

  // Verifica duplicata na lista local
  if (estadoAdmin.candidatosLocais.includes(nome)) {
    mostrarMensagem('msgCandidato', `"${nome}" já está na lista.`, 'erro');
    if (input) input.value = '';
    return;
  }

  try {
    const eleicao = await fetch('/api/eleicao/atual').then(r => r.json());

    if (eleicao.erro || !eleicao.endereco) {
      // Sem eleição ativa — guarda localmente
      estadoAdmin.candidatosLocais.push(nome);
      renderizarCandidatosLocais();
      mostrarMensagem('msgCandidato', `"${nome}" será adicionado ao criar a eleição.`, 'info');
    } else {
      // Com eleição ativa — envia direto ao contrato
      mostrarMensagem('msgCandidato', `Adicionando "${nome}"...`, 'info');
      const ok = await adicionarCandidatoContrato(nome);
      if (ok) {
        mostrarMensagem('msgCandidato', `✓ "${nome}" adicionado com sucesso.`, 'sucesso');
        // CORRIGIDO: busca a lista real do contrato após adicionar
        await atualizarListaCandidatosDoContrato();
      }
    }
  } catch {
    mostrarMensagem('msgCandidato', 'Erro ao verificar eleição ativa.', 'erro');
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
    return true;
  } catch {
    return false;
  }
}

// NOVO: busca candidatos reais do contrato e renderiza na lista do admin
async function atualizarListaCandidatosDoContrato() {
  try {
    const eleicao = await fetch('/api/eleicao/atual').then(r => r.json());
    const container = document.getElementById('listaCandidatosAdmin');
    if (!container || eleicao.erro) return;

    const candidatos = eleicao.candidatos || [];

    if (candidatos.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = candidatos.map((c, i) => `
      <div class="candidato-admin-item">
        <span>#${i + 1}</span> ${c.nome}
        <small style="color:var(--verde);font-family:var(--fonte-mono);font-size:0.7rem;margin-left:auto;">on-chain ✓</small>
      </div>
    `).join('');
  } catch {
    // silencioso — não quebra o fluxo
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
            ${dados.modoAberto !== undefined ? `<span style="margin-left:8px;font-family:var(--fonte-mono);font-size:0.72rem;color:var(--cinza-400);">${dados.modoAberto ? '🌐 Aberta' : '🔒 Restrita'}</span>` : ''}
          </div>
          <div style="font-family:var(--fonte-mono);font-size:0.78rem;color:var(--cinza-400);text-align:right;">
            ${dados.totalVotos} voto(s)<br>
            ${dados.candidatos.length} candidato(s)<br>
            <span style="word-break:break-all;">${dados.endereco.slice(0, 20)}...</span>
          </div>
        </div>
      `;
    }

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

    const btnIniciar  = document.getElementById('btnIniciar');
    const btnEncerrar = document.getElementById('btnEncerrar');
    if (btnIniciar)  btnIniciar.disabled  = dados.estado !== 'Aberta';
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
  const barraEl     = document.getElementById('barrLote');
  const textoEl     = document.getElementById('textoLote');
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
    const lista  = dados.eleicoes || [];

    if (lista.length === 0) {
      container.innerHTML = '<p style="color:var(--cinza-400);font-family:var(--fonte-mono);font-size:0.88rem;">Nenhuma eleição criada ainda.</p>';
      return;
    }

    container.innerHTML = [...lista].reverse().map((e, i) => `
      <div class="historico-item">
        <div>
          <div class="historico-item__nome">${e.nomeEleicao}</div>
          <div class="historico-item__meta">
            ${e.modoAberto ? '🌐 Aberta' : '🔒 Restrita'} ·
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
  document.getElementById('senhaAdmin')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') fazerLogin();
  });
});
