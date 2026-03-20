const estadoInterface = {
    credencialAtual: null,
};

function atualizarTexto(id, valor) {
    const elemento = document.getElementById(id);

    if (elemento) {
        elemento.textContent = valor;
    }
}

function atualizarBarra(id, percentual) {
    const barra = document.getElementById(id);

    if (barra) {
        barra.style.width = `${percentual}%`;
        barra.textContent = `${percentual.toFixed(1)}%`;
    }
}

async function gerarCredencial() {
    const resposta = await fetch('/api/credenciais', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    const dados = await resposta.json();

    estadoInterface.credencialAtual = dados.credencial;
    atualizarTexto('credencialAtual', dados.credencial);
    atualizarTexto('statusCredencial', 'Credencial pronta para um voto.');
}

async function votar(candidato) {
    if (!estadoInterface.credencialAtual) {
        atualizarTexto('statusCredencial', 'Gere uma credencial antes de votar.');
        return;
    }

    const resposta = await fetch('/api/votar', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            candidato,
            credencial: estadoInterface.credencialAtual,
        }),
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
        atualizarTexto('statusVotacao', dados.erro || 'Nao foi possivel registrar o voto.');
        return;
    }

    estadoInterface.credencialAtual = null;
    atualizarTexto('credencialAtual', 'Nenhuma');
    atualizarTexto('statusCredencial', 'Credencial consumida com sucesso.');
    atualizarTexto('statusVotacao', `Voto registrado no bloco ${dados.blocoIndice}. Hash: ${dados.hashBlocoCurto}`);

    await Promise.all([
        carregarResultados(),
        carregarRede(),
        carregarAuditoria(),
    ]);
}

async function carregarResultados() {
    const resposta = await fetch('/api/resultados');
    const dados = await resposta.json();

    const total = dados.totalVotos || 0;
    const percentualA = total === 0 ? 0 : (dados.votos.Candidato_A / total) * 100;
    const percentualB = total === 0 ? 0 : (dados.votos.Candidato_B / total) * 100;

    atualizarTexto('totalVotos', total);
    atualizarTexto('quantidadeA', dados.votos.Candidato_A);
    atualizarTexto('quantidadeB', dados.votos.Candidato_B);
    atualizarBarra('barraA', percentualA);
    atualizarBarra('barraB', percentualB);
}

async function carregarRede() {
    const resposta = await fetch('/api/rede');
    const dados = await resposta.json();

    atualizarTexto('nosRede', dados.nosConhecidos);
    atualizarTexto('consensoRede', dados.consenso);
    atualizarTexto('blocoAtual', dados.alturaBlockchain);
    atualizarTexto('transacoesConfirmadas', dados.transacoesConfirmadas);
}

async function carregarAuditoria() {
    const resposta = await fetch('/api/blocos');
    const dados = await resposta.json();
    const lista = document.getElementById('listaAuditoria');

    if (!lista) {
        return;
    }

    lista.innerHTML = '';

    dados.blocos.slice().reverse().forEach((bloco) => {
        const item = document.createElement('li');
        item.className = 'item-auditoria';
        item.innerHTML = `
            <strong>Bloco ${bloco.indice}</strong>
            <span>Candidato: ${bloco.candidato}</span>
            <span>Hash atual: ${bloco.hash}</span>
            <span>Hash anterior: ${bloco.hashAnterior}</span>
            <span>Registro: ${new Date(bloco.timestamp).toLocaleString('pt-BR')}</span>
        `;
        lista.appendChild(item);
    });
}

async function inicializarPainel() {
    try {
        await Promise.all([
            carregarResultados(),
            carregarRede(),
            carregarAuditoria(),
        ]);
    } catch (_erro) {
        atualizarTexto('statusVotacao', 'Falha ao carregar os dados iniciais da aplicacao.');
    }
}

document.addEventListener('DOMContentLoaded', inicializarPainel);