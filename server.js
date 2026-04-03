/**
 * server.js
 * Backend do sistema de votacao eletronica auditavel com GoQuorum.
 *
 * Rotas publicas  → /api/eleicao/*   (qualquer um acessa)
 * Rotas admin     → /api/admin/*     (protegidas por ADMIN_SECRET no .env)
 */

require('dotenv').config();

const express  = require('express');
const path     = require('node:path');
const crypto   = require('node:crypto');
const fs       = require('node:fs');
const { ethers } = require('ethers');

const aplicacao = express();
const porta     = process.env.PORT        || 3000;
const RPC_URL   = process.env.RPC_URL     || 'http://rpc-node:8545';
const ADMIN_KEY = process.env.ADMIN_PRIVATE_KEY;
const CPF_SALT  = process.env.CPF_SALT    || 'tcc_eleicao_salt';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123'; // senha do painel admin

// ─── Paths dos artefatos do contrato ──────────────────────────────────────────

const ABI_PATH     = path.resolve(__dirname, 'contracts/Votacao.abi.json');
const ADDRESS_PATH = path.resolve(__dirname, 'contract-address.json');

// ─── Setup ethers ─────────────────────────────────────────────────────────────

const provider = new ethers.JsonRpcProvider(RPC_URL);
const adminWallet = new ethers.Wallet(ADMIN_KEY, provider);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Carrega o ABI do contrato do arquivo gerado pelo deploy.js
 */
function carregarABI() {
  if (!fs.existsSync(ABI_PATH)) {
    throw new Error('ABI nao encontrado. Execute node scripts/deploy.js primeiro.');
  }
  return JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));
}

/**
 * Carrega o historico de eleicoes deployadas
 */
function carregarHistorico() {
  if (!fs.existsSync(ADDRESS_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(ADDRESS_PATH, 'utf8'));
    return Array.isArray(data) ? data : [data];
  } catch {
    return [];
  }
}

/**
 * Retorna a eleicao mais recente do historico
 */
function eleicaoAtual() {
  const historico = carregarHistorico();
  if (historico.length === 0) return null;
  return historico[historico.length - 1];
}

/**
 * Instancia o contrato para leitura (sem signer)
 */
function contratoLeitura(endereco) {
  const abi = carregarABI();
  return new ethers.Contract(endereco, abi, provider);
}

/**
 * Instancia o contrato para escrita (com signer admin)
 */
function contratoEscrita(endereco) {
  const abi = carregarABI();
  return new ethers.Contract(endereco, abi, adminWallet);
}

/**
 * Gera o hash anonimizado do CPF
 */
function hashCPF(cpf) {
  return ethers.keccak256(
    ethers.toUtf8Bytes(cpf.replace(/\D/g, '') + CPF_SALT)
  );
}

/**
 * Utilitario: chama o RPC do GoQuorum diretamente
 */
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

/**
 * Middleware de autenticacao do admin
 */
function autenticarAdmin(req, res, next) {
  const senha = req.headers['x-admin-secret'] || req.body?.adminSecret;
  if (senha !== ADMIN_SECRET) {
    return res.status(401).json({ erro: 'Nao autorizado.' });
  }
  next();
}

// ─── Middlewares globais ───────────────────────────────────────────────────────

aplicacao.use(express.json());
aplicacao.use(express.static(path.join(__dirname, 'public')));

// ─── Rotas publicas ───────────────────────────────────────────────────────────

/**
 * GET /api/rede
 * Dados ao vivo da rede GoQuorum
 */
aplicacao.get('/api/rede', async (_req, res) => {
  try {
    const [blocoHex, peersHex, validators] = await Promise.all([
      rpc('eth_blockNumber'),
      rpc('net_peerCount'),
      rpc('istanbul_getValidators', ['latest']),
    ]);
    res.json({
      alturaBlockchain:  parseInt(blocoHex, 16),
      nosConhecidos:     parseInt(peersHex, 16),
      consenso:          'IBFT',
      validadores:       validators.length,
    });
  } catch {
    res.json({ alturaBlockchain: 0, nosConhecidos: 0, consenso: 'IBFT (aguardando)', validadores: 4 });
  }
});

/**
 * GET /api/eleicoes
 * Lista todas as eleicoes deployadas (historico)
 */
aplicacao.get('/api/eleicoes', (_req, res) => {
  const historico = carregarHistorico();
  res.json({ eleicoes: historico });
});

/**
 * GET /api/eleicao/atual
 * Retorna dados da eleicao ativa (a mais recente)
 */
aplicacao.get('/api/eleicao/atual', async (_req, res) => {
  try {
    const atual = eleicaoAtual();
    if (!atual) return res.status(404).json({ erro: 'Nenhuma eleicao encontrada.' });

    const contrato = contratoLeitura(atual.endereco);

    const [nome, estadoNum, candidatos, totalVotos] = await Promise.all([
      contrato.nomeEleicao(),
      contrato.estado(),
      contrato.apurar(),
      contrato.totalVotos(),
    ]);

    const estados = ['Aberta', 'EmVotacao', 'Encerrada'];

    res.json({
      endereco:   atual.endereco,
      nome,
      estado:     estados[Number(estadoNum)],
      candidatos: candidatos.map(c => ({
        id:    Number(c.id),
        nome:  c.nome,
        votos: Number(c.votos),
      })),
      totalVotos: Number(totalVotos),
      deployedAt: atual.deployedAt,
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

/**
 * GET /api/eleicao/:endereco
 * Retorna dados de qualquer eleicao pelo endereco do contrato (historico)
 */
aplicacao.get('/api/eleicao/:endereco', async (req, res) => {
  try {
    const contrato = contratoLeitura(req.params.endereco);

    const [nome, estadoNum, candidatos, totalVotos] = await Promise.all([
      contrato.nomeEleicao(),
      contrato.estado(),
      contrato.apurar(),
      contrato.totalVotos(),
    ]);

    const estados = ['Aberta', 'EmVotacao', 'Encerrada'];

    res.json({
      endereco:   req.params.endereco,
      nome,
      estado:     estados[Number(estadoNum)],
      candidatos: candidatos.map(c => ({
        id:    Number(c.id),
        nome:  c.nome,
        votos: Number(c.votos),
      })),
      totalVotos: Number(totalVotos),
    });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

/**
 * POST /api/votar
 * Registra o voto de um eleitor identificado por CPF
 * Body: { cpf, candidatoId }
 */
aplicacao.post('/api/votar', async (req, res) => {
  try {
    const { cpf, candidatoId } = req.body;

    if (!cpf || candidatoId === undefined) {
      return res.status(400).json({ erro: 'CPF e candidatoId sao obrigatorios.' });
    }

    const atual = eleicaoAtual();
    if (!atual) return res.status(404).json({ erro: 'Nenhuma eleicao encontrada.' });

    const contrato = contratoEscrita(atual.endereco);
    const eleitorHash = hashCPF(cpf);

    // Verifica se ja votou antes de enviar transacao
    const jaVotou = await contrato.jaVotou(eleitorHash);
    if (jaVotou) {
      return res.status(400).json({ erro: 'Este eleitor ja votou.' });
    }

    const tx = await contrato.votar(eleitorHash, candidatoId);
    await tx.wait();

    res.status(201).json({
      mensagem:  'Voto registrado com sucesso na blockchain.',
      txHash:    tx.hash,
      eleitorId: eleitorHash.slice(0, 10) + '...', // mostra so o inicio por privacidade
    });
  } catch (erro) {
    // Trata erros do contrato de forma legivel
    if (erro.message.includes('Eleitor nao autorizado')) {
      return res.status(403).json({ erro: 'Eleitor nao autorizado para esta eleicao.' });
    }
    if (erro.message.includes('Operacao invalida')) {
      return res.status(400).json({ erro: 'A votacao nao esta aberta no momento.' });
    }
    res.status(500).json({ erro: erro.message });
  }
});

/**
 * GET /api/votar/status/:cpf
 * Verifica se um CPF ja votou na eleicao atual
 */
aplicacao.get('/api/votar/status/:cpf', async (req, res) => {
  try {
    const atual = eleicaoAtual();
    if (!atual) return res.status(404).json({ erro: 'Nenhuma eleicao encontrada.' });

    const contrato  = contratoLeitura(atual.endereco);
    const eleitorHash = hashCPF(req.params.cpf);
    const jaVotou   = await contrato.jaVotou(eleitorHash);

    res.json({ jaVotou });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ─── Rotas admin (protegidas) ─────────────────────────────────────────────────

/**
 * POST /api/admin/eleicao
 * Cria (deploya) uma nova eleicao
 * Body: { adminSecret, nomeEleicao }
 */
aplicacao.post('/api/admin/eleicao', autenticarAdmin, async (req, res) => {
  try {
    const { nomeEleicao } = req.body;
    if (!nomeEleicao) return res.status(400).json({ erro: 'nomeEleicao e obrigatorio.' });

    // Usa bytecode já compilado localmente — não recompila no servidor
    const abiPath      = path.resolve(__dirname, 'contracts/Votacao.abi.json');
    const bytecodePath = path.resolve(__dirname, 'contracts/Votacao.bytecode.json');

    if (!fs.existsSync(abiPath) || !fs.existsSync(bytecodePath)) {
      return res.status(500).json({ erro: 'Contrato não compilado. Execute node scripts/deploy.js primeiro para gerar o ABI e bytecode.' });
    }

    const abi      = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    const bytecode = JSON.parse(fs.readFileSync(bytecodePath, 'utf8')).bytecode;

    const factory  = new ethers.ContractFactory(abi, bytecode, adminWallet);
    const contrato = await factory.deploy(nomeEleicao);
    await contrato.waitForDeployment();
    const endereco = await contrato.getAddress();

    const historico = carregarHistorico();
    historico.push({ nomeEleicao, endereco, deployedAt: new Date().toISOString() });
    fs.writeFileSync(ADDRESS_PATH, JSON.stringify(historico, null, 2));
    fs.writeFileSync(ABI_PATH, JSON.stringify(abi, null, 2));

    res.status(201).json({ mensagem: 'Eleicao criada com sucesso.', endereco, nomeEleicao });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

/**
 * POST /api/admin/iniciar
 * Inicia a fase de votacao
 * Body: { adminSecret }
 */
aplicacao.post('/api/admin/iniciar', autenticarAdmin, async (req, res) => {
  try {
    const atual    = eleicaoAtual();
    if (!atual) return res.status(404).json({ erro: 'Nenhuma eleicao encontrada.' });

    const contrato = contratoEscrita(atual.endereco);
    const tx       = await contrato.iniciarVotacao();
    await tx.wait();

    res.json({ mensagem: 'Votacao iniciada com sucesso.', txHash: tx.hash });
  } catch (erro) {
    if (erro.message.includes('necessarios ao menos 2 candidatos')) {
      return res.status(400).json({ erro: 'Adicione ao menos 2 candidatos antes de iniciar.' });
    }
    res.status(500).json({ erro: erro.message });
  }
});

/**
 * POST /api/admin/encerrar
 * Encerra a votacao
 * Body: { adminSecret }
 */
aplicacao.post('/api/admin/encerrar', autenticarAdmin, async (req, res) => {
  try {
    const atual    = eleicaoAtual();
    if (!atual) return res.status(404).json({ erro: 'Nenhuma eleicao encontrada.' });

    const contrato = contratoEscrita(atual.endereco);
    const tx       = await contrato.encerrarVotacao();
    await tx.wait();

    res.json({ mensagem: 'Votacao encerrada com sucesso.', txHash: tx.hash });
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ─── Fallback → index.html ────────────────────────────────────────────────────

aplicacao.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────

aplicacao.listen(porta, () => {
  console.log(`Servidor disponivel em http://localhost:${porta}`);
  console.log(`Conectando ao GoQuorum em ${RPC_URL}`);
  console.log(`Admin wallet: ${adminWallet.address}`);
});
