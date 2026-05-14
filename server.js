require('dotenv').config();

const express    = require('express');
const path       = require('node:path');
const fs         = require('node:fs');
const { ethers } = require('ethers');

const aplicacao    = express();
const porta        = process.env.PORT             || 3000;
const RPC_URL      = process.env.RPC_URL          || 'http://rpc-node:8545';
const ADMIN_KEY    = process.env.ADMIN_PRIVATE_KEY;
const CPF_SALT     = process.env.CPF_SALT         || 'tcc_eleicao_salt';
const ADMIN_SECRET = process.env.ADMIN_SECRET     || 'admin123';

const ABI_PATH      = path.resolve(__dirname, 'contracts/Votacao.abi.json');
const BYTECODE_PATH = path.resolve(__dirname, 'contracts/Votacao.bytecode.json');
const ADDRESS_PATH  = path.resolve(__dirname, 'contract-address.json');

const provider    = new ethers.JsonRpcProvider(RPC_URL);
const adminWallet = new ethers.Wallet(ADMIN_KEY, provider);

function carregarABI() {
  if (!fs.existsSync(ABI_PATH)) throw new Error('ABI nao encontrado.');
  return JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));
}

function carregarHistorico() {
  if (!fs.existsSync(ADDRESS_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(ADDRESS_PATH, 'utf8'));
    return Array.isArray(data) ? data : [data];
  } catch { return []; }
}

function eleicaoAtual() {
  const h = carregarHistorico();
  return h.length === 0 ? null : h[h.length - 1];
}

function contratoLeitura(endereco) {
  return new ethers.Contract(endereco, carregarABI(), provider);
}

function contratoEscrita(endereco) {
  return new ethers.Contract(endereco, carregarABI(), adminWallet);
}

function hashCPF(cpf) {
  return ethers.keccak256(ethers.toUtf8Bytes(cpf.replace(/\D/g, '') + CPF_SALT));
}

async function rpc(method, params = []) {
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.result;
}

function autenticarAdmin(req, res, next) {
  const senha = req.headers['x-admin-secret'] || req.body?.adminSecret;
  if (senha !== ADMIN_SECRET) return res.status(401).json({ erro: 'Nao autorizado.' });
  next();
}

aplicacao.use(express.json());
aplicacao.use(express.static(path.join(__dirname, 'public')));

// ─── Rotas publicas ───────────────────────────────────────────────────────────

aplicacao.get('/api/rede', async (_req, res) => {
  try {
    const [blocoHex, peersHex, validators] = await Promise.all([
      rpc('eth_blockNumber'), rpc('net_peerCount'), rpc('istanbul_getValidators', ['latest']),
    ]);
    res.json({ alturaBlockchain: parseInt(blocoHex, 16), nosConhecidos: parseInt(peersHex, 16), consenso: 'IBFT', validadores: validators.length });
  } catch {
    res.json({ alturaBlockchain: 0, nosConhecidos: 0, consenso: 'IBFT (aguardando)', validadores: 4 });
  }
});

aplicacao.get('/api/eleicoes', (_req, res) => {
  res.json({ eleicoes: carregarHistorico() });
});

aplicacao.get('/api/eleicao/atual', async (_req, res) => {
  try {
    const atual = eleicaoAtual();
    if (!atual) return res.status(404).json({ erro: 'Nenhuma eleicao encontrada.' });
    const contrato = contratoLeitura(atual.endereco);
    const [nome, estadoNum, candidatos, totalVotos] = await Promise.all([
      contrato.nomeEleicao(), contrato.estado(), contrato.apurar(), contrato.totalVotos(),
    ]);
    const estados = ['Aberta', 'EmVotacao', 'Encerrada'];
    const estadoStr = estados[Number(estadoNum)];

    let candidatosMapeados = candidatos.map(c => ({ id: Number(c.id), nome: c.nome, votos: Number(c.votos) }));
    if (atual.modoSigiloso && estadoStr !== 'Encerrada') {
      candidatosMapeados = candidatosMapeados.map(c => ({ ...c, votos: 0 }));
    }

    res.json({ 
      endereco: atual.endereco, 
      nome, 
      estado: estadoStr, 
      candidatos: candidatosMapeados, 
      totalVotos: Number(totalVotos), 
      deployedAt: atual.deployedAt,
      modoAberto: atual.modoAberto === true,
      sigilosa: atual.modoSigiloso === true
    });
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

aplicacao.get('/api/eleicao/:endereco', async (req, res) => {
  try {
    const contrato = contratoLeitura(req.params.endereco);
    const [nome, estadoNum, candidatos, totalVotos] = await Promise.all([
      contrato.nomeEleicao(), contrato.estado(), contrato.apurar(), contrato.totalVotos(),
    ]);
    const estados = ['Aberta', 'EmVotacao', 'Encerrada'];
    const estadoStr = estados[Number(estadoNum)];
    const historico = carregarHistorico();
    const eleicao = historico.find(e => e.endereco.toLowerCase() === req.params.endereco.toLowerCase());

    let candidatosMapeados = candidatos.map(c => ({ id: Number(c.id), nome: c.nome, votos: Number(c.votos) }));
    if (eleicao && eleicao.modoSigiloso && estadoStr !== 'Encerrada') {
      candidatosMapeados = candidatosMapeados.map(c => ({ ...c, votos: 0 }));
    }

    res.json({ 
      endereco: req.params.endereco, 
      nome, 
      estado: estadoStr, 
      candidatos: candidatosMapeados, 
      totalVotos: Number(totalVotos),
      modoAberto: eleicao ? eleicao.modoAberto === true : undefined,
      sigilosa: eleicao ? eleicao.modoSigiloso === true : false
    });
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

aplicacao.post('/api/votar', async (req, res) => {
  try {
    const { cpf, candidatoId } = req.body;
    if (!cpf || candidatoId === undefined) return res.status(400).json({ erro: 'CPF e candidatoId sao obrigatorios.' });
    const atual = eleicaoAtual();
    if (!atual) return res.status(404).json({ erro: 'Nenhuma eleicao encontrada.' });
    const contrato = contratoEscrita(atual.endereco);
    const eleitorHash = hashCPF(cpf);
    const jaVotou = await contrato.jaVotou(eleitorHash);
    if (jaVotou) return res.status(400).json({ erro: 'Este eleitor ja votou.' });
    const tx = await contrato.votar(eleitorHash, candidatoId);
    await tx.wait();
    res.status(201).json({ mensagem: 'Voto registrado com sucesso na blockchain.', txHash: tx.hash, eleitorId: eleitorHash });
  } catch (erro) {
    if (erro.message.includes('Eleitor nao autorizado')) return res.status(403).json({ erro: 'Eleitor nao autorizado para esta eleicao.' });
    if (erro.message.includes('Operacao invalida')) return res.status(400).json({ erro: 'A votacao nao esta aberta no momento.' });
    res.status(500).json({ erro: erro.message });
  }
});

aplicacao.get('/api/votar/status/:cpf', async (req, res) => {
  try {
    const atual = eleicaoAtual();
    if (!atual) return res.status(404).json({ erro: 'Nenhuma eleicao encontrada.' });
    const contrato = contratoLeitura(atual.endereco);
    const eleitorHash = hashCPF(req.params.cpf);
    const jaVotou = await contrato.jaVotou(eleitorHash);
    res.json({ jaVotou });
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

aplicacao.get('/api/eleicao/:endereco/votos', async (req, res) => {
  try {
    const contrato   = contratoLeitura(req.params.endereco);
    const estadoNum = await contrato.estado();
    const estados = ['Aberta', 'EmVotacao', 'Encerrada'];
    const estadoStr = estados[Number(estadoNum)];

    const historico = carregarHistorico();
    const eleicao = historico.find(e => e.endereco.toLowerCase() === req.params.endereco.toLowerCase());

    if (eleicao && eleicao.modoSigiloso && estadoStr !== 'Encerrada') {
      return res.json({ votos: [], sigilosa: true });
    }

    const totalVotos = Number(await contrato.totalVotos());
    const votos      = [];

    for (let i = 0; i < totalVotos; i++) {
      const [eleitorHash, candidatoId, timestamp] = await contrato.getRegistroVoto(i);
      votos.push({
        eleitorHash,
        candidatoId: Number(candidatoId),
        timestamp:   Number(timestamp),
      });
    }

    res.json({ votos });
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

// ─── Rotas admin ──────────────────────────────────────────────────────────────

aplicacao.post('/api/admin/verificar', autenticarAdmin, (_req, res) => {
  res.json({ ok: true });
});

aplicacao.post('/api/admin/eleicao', autenticarAdmin, async (req, res) => {
  try {
    const { nomeEleicao, modoAberto, modoSigiloso } = req.body;
    if (!nomeEleicao) return res.status(400).json({ erro: 'nomeEleicao e obrigatorio.' });
    if (!fs.existsSync(ABI_PATH) || !fs.existsSync(BYTECODE_PATH)) return res.status(500).json({ erro: 'Contrato nao compilado. Execute node scripts/deploy.js primeiro.' });
    const abi = JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));
    const bytecode = JSON.parse(fs.readFileSync(BYTECODE_PATH, 'utf8')).bytecode;
    const factory = new ethers.ContractFactory(abi, bytecode, adminWallet);
    const contrato = await factory.deploy(nomeEleicao, modoAberto === true);
    await contrato.waitForDeployment();
    const endereco = await contrato.getAddress();
    const historico = carregarHistorico();
    historico.push({ nomeEleicao, endereco, modoAberto: modoAberto === true, modoSigiloso: modoSigiloso === true, deployedAt: new Date().toISOString() });
    fs.writeFileSync(ADDRESS_PATH, JSON.stringify(historico, null, 2));
    res.status(201).json({ mensagem: 'Eleicao criada com sucesso.', endereco, nomeEleicao });
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

aplicacao.post('/api/admin/candidato', autenticarAdmin, async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ erro: 'nome do candidato e obrigatorio.' });
    const atual = eleicaoAtual();
    if (!atual) return res.status(404).json({ erro: 'Nenhuma eleicao encontrada.' });
    const contrato = contratoEscrita(atual.endereco);
    const tx = await contrato.adicionarCandidato(nome);
    await tx.wait();
    res.status(201).json({ mensagem: `Candidato "${nome}" adicionado com sucesso.`, txHash: tx.hash });
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

aplicacao.post('/api/admin/autorizar', autenticarAdmin, async (req, res) => {
  try {
    const { cpf } = req.body;
    if (!cpf) return res.status(400).json({ erro: 'Identificador e obrigatorio.' });
    const atual = eleicaoAtual();
    if (!atual) return res.status(404).json({ erro: 'Nenhuma eleicao encontrada.' });
    const contrato = contratoEscrita(atual.endereco);
    const eleitorHash = hashCPF(cpf);
    const tx = await contrato.autorizarEleitor(eleitorHash);
    await tx.wait();
    res.status(201).json({ mensagem: 'Eleitor autorizado com sucesso.', eleitorHash, txHash: tx.hash });
  } catch (erro) {
    if (erro.message.includes('Eleitor ja autorizado')) return res.status(400).json({ erro: 'Este eleitor ja esta autorizado.' });
    res.status(500).json({ erro: erro.message });
  }
});

aplicacao.post('/api/admin/iniciar', autenticarAdmin, async (req, res) => {
  try {
    const atual = eleicaoAtual();
    if (!atual) return res.status(404).json({ erro: 'Nenhuma eleicao encontrada.' });
    const contrato = contratoEscrita(atual.endereco);
    const tx = await contrato.iniciarVotacao();
    await tx.wait();
    res.json({ mensagem: 'Votacao iniciada com sucesso.', txHash: tx.hash });
  } catch (erro) {
    if (erro.message.includes('necessarios ao menos 2 candidatos')) return res.status(400).json({ erro: 'Adicione ao menos 2 candidatos antes de iniciar.' });
    res.status(500).json({ erro: erro.message });
  }
});

aplicacao.post('/api/admin/encerrar', autenticarAdmin, async (req, res) => {
  try {
    const atual = eleicaoAtual();
    if (!atual) return res.status(404).json({ erro: 'Nenhuma eleicao encontrada.' });
    const contrato = contratoEscrita(atual.endereco);
    const tx = await contrato.encerrarVotacao();
    await tx.wait();
    res.json({ mensagem: 'Votacao encerrada com sucesso.', txHash: tx.hash });
  } catch (erro) { res.status(500).json({ erro: erro.message }); }
});

aplicacao.get('/api/votar/elegivel/:cpf', async (req, res) => {
  try {
    const atual = eleicaoAtual();
    if (!atual) return res.json({ elegivel: false, motivo: 'Nenhuma eleição ativa.' });

    const contrato = contratoLeitura(atual.endereco);
    const [estadoNum, modoAberto] = await Promise.all([
      contrato.estado(),
      contrato.modoAberto(),
    ]);

    const estados = ['Aberta', 'EmVotacao', 'Encerrada'];
    const estadoAtual = estados[Number(estadoNum)];

    if (estadoAtual !== 'EmVotacao') {
      return res.json({ elegivel: false, motivo: `Votação não está aberta (estado: ${estadoAtual}).` });
    }

    const eleitorHash = hashCPF(req.params.cpf);
    const jaVotou = await contrato.jaVotou(eleitorHash);

    if (jaVotou) {
      return res.json({ elegivel: false, motivo: 'Este identificador já votou.' });
    }

    if (!modoAberto) {
      const autorizado = await contrato.eleitorAutorizado(eleitorHash);
      if (!autorizado) {
        return res.json({ elegivel: false, motivo: 'Identificador não autorizado para esta eleição.' });
      }
    }

    res.json({ elegivel: true });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ─── Fallback ─────────────────────────────────────────────────────────────────

aplicacao.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

aplicacao.listen(porta, () => {
  console.log(`Servidor disponivel em http://localhost:${porta}`);
  console.log(`Conectando ao GoQuorum em ${RPC_URL}`);
  console.log(`Admin wallet: ${adminWallet.address}`);
});
