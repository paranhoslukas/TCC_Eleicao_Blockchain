/**
 * benchmark.js — Coleta de métricas de desempenho
 * TCC — Votação Eletrônica Auditável com Blockchain Permissiva
 *
 * Métricas coletadas:
 *   - Latência de confirmação de bloco (ms)
 *   - TPS (Transações Por Segundo)
 *   - Throughput sob carga concorrente
 *   - Utilização da rede (peers, altura de bloco)
 *
 * Uso:
 *   node scripts/benchmark.js
 *
 * Pré-requisito:
 *   Rede GoQuorum rodando em http://localhost:8545
 */

const { ethers } = require('ethers');
const fs         = require('fs');
const path       = require('path');

// ─── Configuração ─────────────────────────────────────────────────────────────

const RPC_URL         = process.env.RPC_URL          || 'http://localhost:8545';
const ADMIN_KEY       = process.env.ADMIN_PRIVATE_KEY || '0x447c526fdfc4b972eb3f0a008611f6dcdafffca38072ce6fa2d7fd65ab3f0b35';
const ABI_PATH        = path.resolve(__dirname, '../contracts/Votacao.abi.json');
const BYTECODE_PATH   = path.resolve(__dirname, '../contracts/Votacao.bytecode.json');
const RESULTADO_PATH  = path.resolve(__dirname, '../benchmark-resultado.json');
const CPF_SALT        = process.env.CPF_SALT || 'tcc_eleicao_2025_salt';

// Cenários de teste
const CENARIOS = [
  { nome: 'Leve',   votos: 5,  concorrencia: 1 },
  { nome: 'Médio',  votos: 20, concorrencia: 5 },
  { nome: 'Pesado', votos: 50, concorrencia: 10 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const provider    = new ethers.JsonRpcProvider(RPC_URL);
const adminWallet = new ethers.Wallet(ADMIN_KEY, provider);

function hashCPF(cpf) {
  return ethers.keccak256(ethers.toUtf8Bytes(cpf + CPF_SALT));
}

function cpfAleatorio(i) {
  return String(i).padStart(11, '0');
}

async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return d.result;
}

function log(msg) {
  const hora = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${hora}] ${msg}`);
}

function separador(titulo) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${titulo}`);
  console.log('═'.repeat(60));
}

// ─── Coleta status da rede ────────────────────────────────────────────────────

async function coletarStatusRede() {
  separador('STATUS DA REDE GOQUORUM');

  const [blocoHex, peersHex, validators] = await Promise.all([
    rpc('eth_blockNumber'),
    rpc('net_peerCount'),
    rpc('istanbul_getValidators', ['latest']),
  ]);

  const bloco      = parseInt(blocoHex, 16);
  const peers      = parseInt(peersHex, 16);
  const nValidadores = validators.length;

  // Mede intervalo real entre blocos
  const blocoAtual   = await provider.getBlock(bloco);
  const blocoAnterior = await provider.getBlock(bloco - 1);
  const intervaloBlocos = blocoAtual.timestamp - blocoAnterior.timestamp;

  log(`Altura blockchain : ${bloco}`);
  log(`Peers conectados  : ${peers}`);
  log(`Validadores IBFT  : ${nValidadores}`);
  log(`Intervalo blocos  : ${intervaloBlocos}s`);
  log(`Validadores       : ${validators.join(', ')}`);

  return { bloco, peers, nValidadores, intervaloBlocos, validators };
}

// ─── Deploy de contrato de teste ──────────────────────────────────────────────

async function deployContratoBenchmark(indice) {
  const abi      = JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));
  const bytecode = JSON.parse(fs.readFileSync(BYTECODE_PATH, 'utf8')).bytecode;
  const factory  = new ethers.ContractFactory(abi, bytecode, adminWallet);

  log(`Deployando contrato de benchmark #${indice}...`);
  const inicio   = Date.now();
  const contrato = await factory.deploy(`Benchmark-${indice}`, true); // modoAberto=true
  await contrato.waitForDeployment();
  const latenciaDeploy = Date.now() - inicio;
  const endereco = await contrato.getAddress();

  log(`Contrato deployado: ${endereco} (${latenciaDeploy}ms)`);
  return { contrato, endereco, latenciaDeploy };
}

// ─── Benchmark de latência de confirmação ─────────────────────────────────────

async function benchmarkLatencia(contrato) {
  separador('BENCHMARK — LATÊNCIA DE CONFIRMAÇÃO');

  // Adiciona 2 candidatos
  const tx1 = await contrato.adicionarCandidato('Candidato A');
  await tx1.wait();
  const tx2 = await contrato.adicionarCandidato('Candidato B');
  await tx2.wait();

  // Inicia votação
  const txInicio = await contrato.iniciarVotacao();
  await txInicio.wait();

  const latencias = [];
  const AMOSTRAS  = 10;

  log(`Coletando latência de ${AMOSTRAS} transações sequenciais...`);

  for (let i = 0; i < AMOSTRAS; i++) {
    const cpf  = cpfAleatorio(i + 1000);
    const hash = hashCPF(cpf);

    const inicio = Date.now();
    const tx     = await contrato.votar(hash, i % 2); // alterna entre candidato 0 e 1
    const receipt = await tx.wait();
    const latencia = Date.now() - inicio;

    latencias.push(latencia);
    log(`  Voto #${i + 1}: ${latencia}ms (bloco ${receipt.blockNumber})`);
  }

  const min    = Math.min(...latencias);
  const max    = Math.max(...latencias);
  const media  = Math.round(latencias.reduce((a, b) => a + b, 0) / latencias.length);
  const sorted = [...latencias].sort((a, b) => a - b);
  const p95    = sorted[Math.floor(sorted.length * 0.95)] || max;

  log(`\n  Mínima  : ${min}ms`);
  log(`  Máxima  : ${max}ms`);
  log(`  Média   : ${media}ms`);
  log(`  P95     : ${p95}ms`);

  return { latencias, min, max, media, p95, amostras: AMOSTRAS };
}

// ─── Benchmark de TPS e throughput ───────────────────────────────────────────

async function benchmarkTPS(cenario, indiceContrato) {
  separador(`BENCHMARK — ${cenario.nome.toUpperCase()} (${cenario.votos} votos, concorrência ${cenario.concorrencia})`);

  const { contrato } = await deployContratoBenchmark(indiceContrato);

  // Setup
  const txA = await contrato.adicionarCandidato('Candidato A');
  await txA.wait();
  const txB = await contrato.adicionarCandidato('Candidato B');
  await txB.wait();
  const txI = await contrato.iniciarVotacao();
  await txI.wait();

  log(`Enviando ${cenario.votos} votos com concorrência ${cenario.concorrencia}...`);

  const latencias  = [];
  const erros      = [];
  const inicio     = Date.now();

  // Processa em lotes de acordo com a concorrência
  const lotes = Math.ceil(cenario.votos / cenario.concorrencia);

  for (let lote = 0; lote < lotes; lote++) {
    const promessas = [];
    const inicio_lote = lote * cenario.concorrencia;
    const fim_lote    = Math.min(inicio_lote + cenario.concorrencia, cenario.votos);

    for (let i = inicio_lote; i < fim_lote; i++) {
      const cpf  = cpfAleatorio(i + 2000 + indiceContrato * 1000);
      const hash = hashCPF(cpf);

      const p = (async () => {
        const t0 = Date.now();
        try {
          const tx      = await contrato.votar(hash, i % 2);
          const receipt = await tx.wait();
          latencias.push(Date.now() - t0);
          return receipt;
        } catch (e) {
          erros.push(e.message);
          return null;
        }
      })();

      promessas.push(p);
    }

    await Promise.all(promessas);
    process.stdout.write(`  Lote ${lote + 1}/${lotes} concluído\r`);
  }

  const duracao = (Date.now() - inicio) / 1000; // segundos
  const sucessos = latencias.length;
  const tps      = (sucessos / duracao).toFixed(2);

  const min   = latencias.length ? Math.min(...latencias) : 0;
  const max   = latencias.length ? Math.max(...latencias) : 0;
  const media = latencias.length
    ? Math.round(latencias.reduce((a, b) => a + b, 0) / latencias.length)
    : 0;

  log(`\n  Votos enviados  : ${cenario.votos}`);
  log(`  Confirmados     : ${sucessos}`);
  log(`  Erros           : ${erros.length}`);
  log(`  Duração total   : ${duracao.toFixed(2)}s`);
  log(`  TPS             : ${tps} tx/s`);
  log(`  Latência média  : ${media}ms`);
  log(`  Latência mínima : ${min}ms`);
  log(`  Latência máxima : ${max}ms`);

  return {
    cenario: cenario.nome,
    votos: cenario.votos,
    concorrencia: cenario.concorrencia,
    confirmados: sucessos,
    erros: erros.length,
    duracaoSegundos: parseFloat(duracao.toFixed(2)),
    tps: parseFloat(tps),
    latenciaMedia: media,
    latenciaMin: min,
    latenciaMax: max,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   BENCHMARK — TCC Votação Eletrônica Auditável           ║');
  console.log('║   GoQuorum IBFT2 · Métricas de Desempenho                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  RPC: ${RPC_URL}`);
  console.log(`  Admin: ${adminWallet.address}\n`);

  const inicio = Date.now();
  const resultado = {
    data: new Date().toISOString(),
    rpc: RPC_URL,
    admin: adminWallet.address,
    rede: {},
    latencia: {},
    tps: [],
  };

  try {
    // 1. Status da rede
    resultado.rede = await coletarStatusRede();

    // 2. Benchmark de latência sequencial
    const { contrato: contratoLatencia } = await deployContratoBenchmark(0);
    resultado.latencia = await benchmarkLatencia(contratoLatencia);

    // 3. Benchmarks de TPS por cenário
    for (let i = 0; i < CENARIOS.length; i++) {
      const metricas = await benchmarkTPS(CENARIOS[i], i + 1);
      resultado.tps.push(metricas);
    }

    // 4. Resumo final
    separador('RESUMO FINAL');

    const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
    log(`Tempo total do benchmark: ${duracao}s\n`);

    log('Latência de confirmação (sequencial):');
    log(`  Média : ${resultado.latencia.media}ms`);
    log(`  Mínima: ${resultado.latencia.min}ms`);
    log(`  Máxima: ${resultado.latencia.max}ms`);
    log(`  P95   : ${resultado.latencia.p95}ms\n`);

    log('Throughput (TPS) por cenário:');
    resultado.tps.forEach(t => {
      log(`  ${t.cenario.padEnd(8)}: ${t.tps} tx/s | ${t.confirmados}/${t.votos} confirmados | latência média ${t.latenciaMedia}ms`);
    });

    // 5. Salva resultado em JSON
    fs.writeFileSync(RESULTADO_PATH, JSON.stringify(resultado, null, 2));
    log(`\nResultado salvo em: benchmark-resultado.json`);

    // 6. Gera tabela para o artigo
    console.log('\nTabela de Latência de Confirmação:');
    console.log('| Métrica | Valor |');
    console.log('|---------|-------|');
    console.log(`| Latência mínima | ${resultado.latencia.min} ms |`);
    console.log(`| Latência máxima | ${resultado.latencia.max} ms |`);
    console.log(`| Latência média  | ${resultado.latencia.media} ms |`);
    console.log(`| Percentil 95    | ${resultado.latencia.p95} ms |`);
    console.log(`| Amostras        | ${resultado.latencia.amostras} transações |`);

    console.log('\nTabela de Throughput (TPS):');
    console.log('| Cenário | Votos | Concorrência | TPS | Lat. Média | Confirmados |');
    console.log('|---------|-------|--------------|-----|------------|-------------|');
    resultado.tps.forEach(t => {
      console.log(`| ${t.cenario} | ${t.votos} | ${t.concorrencia} | ${t.tps} | ${t.latenciaMedia} ms | ${t.confirmados}/${t.votos} |`);
    });

    console.log('\n');

  } catch (erro) {
    console.error('\n❌ Erro durante benchmark:', erro.message);
    console.error('\nVerifique:');
    console.error('  1. Rede GoQuorum está rodando: docker compose ps');
    console.error('  2. RPC acessível: curl http://localhost:8545');
    console.error('  3. ABI compilado: contracts/Votacao.abi.json existe');
    process.exit(1);
  }
}

main();
