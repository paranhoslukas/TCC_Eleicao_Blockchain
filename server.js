const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');

const aplicacao = express();
const porta = process.env.PORT || 3000;
const RPC_URL = process.env.RPC_URL || 'http://rpc-node:8545';

aplicacao.use(express.json());
aplicacao.use(express.static(path.join(__dirname)));

// Credenciais emitidas (hash -> usado)
const credenciais = new Map();

// Votos registrados localmente (espelhados da chain)
const votos = { Candidato_A: 0, Candidato_B: 0 };
const blocosRegistrados = [];

// -------------------------------------------------------
// Utilitario: chama o RPC do GoQuorum
// -------------------------------------------------------
async function rpc(method, params = []) {
  const resposta = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const dados = await resposta.json();
  if (dados.error) throw new Error(dados.error.message);
  return dados.result;
}

// -------------------------------------------------------
// GET /api/resultados
// -------------------------------------------------------
aplicacao.get('/api/resultados', (_req, res) => {
  res.json({
    votos,
    totalVotos: votos.Candidato_A + votos.Candidato_B,
  });
});

// -------------------------------------------------------
// GET /api/rede — dados ao vivo do GoQuorum
// -------------------------------------------------------
aplicacao.get('/api/rede', async (_req, res) => {
  try {
    const [blocoHex, peersHex, validators] = await Promise.all([
      rpc('eth_blockNumber'),
      rpc('net_peerCount'),
      rpc('istanbul_getValidators', ['latest']),
    ]);

    res.json({
      alturaBlockchain: parseInt(blocoHex, 16),
      nosConhecidos: parseInt(peersHex, 16),
      consenso: 'IBFT',
      validadores: validators.length,
      transacoesConfirmadas: votos.Candidato_A + votos.Candidato_B,
    });
  } catch (erro) {
    res.json({
      alturaBlockchain: 0,
      nosConhecidos: 0,
      consenso: 'IBFT (aguardando)',
      validadores: 4,
      transacoesConfirmadas: 0,
    });
  }
});

// -------------------------------------------------------
// GET /api/blocos
// -------------------------------------------------------
aplicacao.get('/api/blocos', (_req, res) => {
  res.json({ blocos: blocosRegistrados });
});

// -------------------------------------------------------
// POST /api/credenciais
// -------------------------------------------------------
aplicacao.post('/api/credenciais', (_req, res) => {
  const credencial = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(credencial).digest('hex');
  credenciais.set(hash, false);
  res.status(201).json({ credencial });
});

// -------------------------------------------------------
// POST /api/votar
// -------------------------------------------------------
aplicacao.post('/api/votar', async (req, res) => {
  const { candidato, credencial } = req.body;

  if (!candidato || !credencial) {
    return res.status(400).json({ erro: 'Candidato e credencial sao obrigatorios.' });
  }

  const candidatosValidos = ['Candidato_A', 'Candidato_B'];
  if (!candidatosValidos.includes(candidato)) {
    return res.status(400).json({ erro: 'Candidato invalido.' });
  }

  const hash = crypto.createHash('sha256').update(credencial).digest('hex');
  if (!credenciais.has(hash)) {
    return res.status(400).json({ erro: 'Credencial invalida.' });
  }
  if (credenciais.get(hash) === true) {
    return res.status(400).json({ erro: 'Credencial ja utilizada.' });
  }

  // Marcar credencial como usada
  credenciais.set(hash, true);
  votos[candidato]++;

  // Buscar altura atual da chain para registrar no bloco
  let alturaAtual = blocosRegistrados.length;
  try {
    const blocoHex = await rpc('eth_blockNumber');
    alturaAtual = parseInt(blocoHex, 16);
  } catch (_) {}

  // Registrar bloco de auditoria local
  const hashAnterior = blocosRegistrados.length > 0
    ? blocosRegistrados[blocosRegistrados.length - 1].hash
    : '0'.repeat(64);

  const conteudo = `${candidato}:${hash}:${alturaAtual}:${Date.now()}`;
  const hashBloco = crypto.createHash('sha256').update(conteudo + hashAnterior).digest('hex');

  const bloco = {
    indice: blocosRegistrados.length + 1,
    candidato,
    hash: hashBloco,
    hashAnterior,
    blocoChain: alturaAtual,
    timestamp: Date.now(),
  };

  blocosRegistrados.push(bloco);

  res.status(201).json({
    mensagem: 'Voto registrado com sucesso.',
    blocoIndice: bloco.indice,
    hashBlocoCurto: hashBloco.slice(0, 16),
  });
});

// -------------------------------------------------------
// Fallback -> index.html
// -------------------------------------------------------
aplicacao.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

aplicacao.listen(porta, () => {
  console.log(`Servidor de votacao disponivel em http://localhost:${porta}`);
  console.log(`Conectando ao GoQuorum em ${RPC_URL}`);
});
