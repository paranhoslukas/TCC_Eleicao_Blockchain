/**
 * deploy.js
 * Compila e deploya o contrato Votacao.sol na rede GoQuorum local.
 * 
 * Uso:
 *   node scripts/deploy.js "Nome da Eleicao"
 * 
 * Dependencias:
 *   npm install ethers solc fs path
 */

const { ethers } = require("ethers");
const solc       = require("solc");
const fs         = require("fs");
const path       = require("path");

// ─── Configuracao ─────────────────────────────────────────────────────────────

const RPC_URL        = "http://localhost:8545";          // RPC do rpc-node no Docker
const ADMIN_PRIVKEY  = "0xSUA_CHAVE_PRIVADA_AQUI";      // Chave privada da conta admin
const CONTRACT_PATH  = path.resolve(__dirname, "../contracts/Votacao.sol");
const OUTPUT_PATH    = path.resolve(__dirname, "../contract-address.json");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compilarContrato() {
  console.log("📦 Compilando Votacao.sol...");

  const source = fs.readFileSync(CONTRACT_PATH, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      "Votacao.sol": { content: source }
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode"]
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  // Verifica erros de compilacao
  if (output.errors) {
    const erros = output.errors.filter(e => e.severity === "error");
    if (erros.length > 0) {
      erros.forEach(e => console.error("❌ Erro:", e.formattedMessage));
      process.exit(1);
    }
    // Warnings nao bloqueiam
    output.errors
      .filter(e => e.severity === "warning")
      .forEach(e => console.warn("⚠️  Warning:", e.formattedMessage));
  }

  const contrato = output.contracts["Votacao.sol"]["Votacao"];

  console.log("✅ Compilacao concluida.");
  return {
    abi:      contrato.abi,
    bytecode: contrato.evm.bytecode.object
  };
}

function salvarEndereco(endereco, nomeEleicao) {
  let historico = [];

  // Mantem historico de deploys anteriores
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      historico = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
      if (!Array.isArray(historico)) historico = [historico]; // compatibilidade
    } catch {
      historico = [];
    }
  }

  historico.push({
    nomeEleicao,
    endereco,
    deployedAt: new Date().toISOString()
  });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(historico, null, 2));
  console.log(`💾 Enderecos salvos em contract-address.json`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const nomeEleicao = process.argv[2];

  if (!nomeEleicao) {
    console.error('❌ Informe o nome da eleicao: node scripts/deploy.js "Nome da Eleicao"');
    process.exit(1);
  }

  // Conecta no GoQuorum
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(ADMIN_PRIVKEY, provider);

  console.log(`🔗 Conectado em: ${RPC_URL}`);
  console.log(`👤 Admin: ${wallet.address}`);

  // Verifica saldo (no GoQuorum com etherbase configurado deve ser > 0)
  const saldo = await provider.getBalance(wallet.address);
  console.log(`💰 Saldo: ${ethers.formatEther(saldo)} ETH`);

  if (saldo === 0n) {
    console.warn("⚠️  Saldo zero — verifique se o miner.etherbase do docker-compose aponta para este endereco.");
  }

  // Compila
  const { abi, bytecode } = compilarContrato();

  // Deploya
  console.log(`🚀 Deployando contrato: "${nomeEleicao}"...`);

  const factory  = new ethers.ContractFactory(abi, bytecode, wallet);
  const contrato = await factory.deploy(nomeEleicao);

  console.log(`⏳ Aguardando confirmacao...`);
  await contrato.waitForDeployment();

  const endereco = await contrato.getAddress();

  console.log("");
  console.log("═══════════════════════════════════════════");
  console.log(`✅ Contrato deployado com sucesso!`);
  console.log(`📋 Nome:     ${nomeEleicao}`);
  console.log(`📍 Endereco: ${endereco}`);
  console.log("═══════════════════════════════════════════");
  console.log("");
  console.log("Proximos passos:");
  console.log("  1. Adicione candidatos:   contrato.adicionarCandidato('Nome')");
  console.log("  2. Autorize eleitores:    contrato.autorizarEleitor(hash)");
  console.log("  3. Inicie a votacao:      contrato.iniciarVotacao()");
  console.log("");

  // Salva endereco + historico
  salvarEndereco(endereco, nomeEleicao);

  // Salva ABI separado (server.js vai precisar)
  const abiPath = path.resolve(__dirname, "../contracts/Votacao.abi.json");
  fs.writeFileSync(abiPath, JSON.stringify(abi, null, 2));
  console.log(`📄 ABI salvo em contracts/Votacao.abi.json`);
}

main().catch(err => {
  console.error("❌ Erro no deploy:", err.message);
  process.exit(1);
});
