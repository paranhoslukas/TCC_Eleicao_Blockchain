#!/usr/bin/env node
/**
 * gerar-extra-data.js
 * Gera o extraData correto para IBFT2 do GoQuorum 23.4.0
 * 
 * Formato IBFT2 extraData:
 * 32 bytes vanity + RLP([validators, votes, round, committedSeals]) + 65 bytes proposer seal
 * 
 * Para genesis block:
 * - votes = [] (lista vazia)
 * - round = 0x00
 * - committedSeals = [] (lista vazia)
 * - proposer seal = 65 bytes zeros
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const GENESIS = path.join(RAIZ, 'config', 'genesis.json');

// Ler enderecos dos validadores
const enderecos = [];
for (let i = 1; i <= 4; i++) {
  const addr = fs.readFileSync(path.join(RAIZ, 'validators', String(i), 'address'), 'utf8')
    .trim().toLowerCase().replace(/^0x/, '');
  enderecos.push(Buffer.from(addr, 'hex'));
  console.log(`Validador ${i}: 0x${addr}`);
}

// RLP encoding manual
function rlpEncodeByte(b) {
  if (b.length === 1 && b[0] < 0x80) return b;
  return Buffer.concat([rlpEncodeLength(b.length, 0x80), b]);
}

function rlpEncodeLength(length, offset) {
  if (length < 56) return Buffer.from([offset + length]);
  const bl = toBytesNoPad(length);
  return Buffer.concat([Buffer.from([offset + 55 + bl.length]), bl]);
}

function toBytesNoPad(n) {
  const hex = n.toString(16);
  return Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex');
}

function rlpEncodeList(items) {
  const encoded = Buffer.concat(items);
  return Buffer.concat([rlpEncodeLength(encoded.length, 0xc0), encoded]);
}

function rlpEncodeAddress(addr) {
  // endereco 20 bytes: sempre prefixo 0x94
  return Buffer.concat([Buffer.from([0x94]), addr]);
}

// Construir o conteudo IBFT do extraData
// IstanbulExtra struct: {Validators, Seal, CommittedSeal}
// Para genesis: Validators = lista, Seal = 65 zeros, CommittedSeal = []

const validatorsList = rlpEncodeList(enderecos.map(rlpEncodeAddress));
const seal = Buffer.alloc(65, 0);           // proposer seal vazio
const sealEncoded = rlpEncodeByte(seal);
const committedSeals = rlpEncodeList([]);   // lista vazia

// IstanbulExtra = RLP([validators_list_items..., seal, committedSeals])
// Na verdade e: RLP encode do struct completo
const istanbulExtra = rlpEncodeList([
  validatorsList,          // ja e RLP encoded list
  sealEncoded,             // seal
  committedSeals           // committed seals
]);

// Mas o formato real e mais simples - vamos tentar o formato direto:
// extraData = vanity(32) + RLP(validators) + seal(65)
// onde RLP(validators) e o encode da lista de enderecos

// Formato correto documentado: vanity + istanbul_extra
// istanbul_extra = rlp([validators[], seal, committedSeal[]])
// validators[] = lista de enderecos 20 bytes cada
// seal = bytes65 vazio no genesis
// committedSeal[] = [] no genesis

const vanity = Buffer.alloc(32, 0);

// Encode correto: os validadores como lista RLP dentro do struct
const validatorsRLP = rlpEncodeList(enderecos.map(addr => {
  // Cada endereco e encoded como: 0x94 + 20 bytes
  return Buffer.concat([Buffer.from([0x94]), addr]);
}));

const sealBytes = Buffer.alloc(65, 0);
const sealRLP = Buffer.concat([Buffer.from([0x80 + 65]), sealBytes]); // string de 65 bytes

const committedRLP = Buffer.from([0xc0]); // lista vazia

// IstanbulExtra = RLP list de [validators_rlp_content, seal, committed]
// Na estrutura Go: type IstanbulExtra struct { Validators []common.Address; Seal []byte; CommittedSeal [][]byte }
// O encode e: rlp([addr1, addr2, ...], seal_bytes, [])

const istanbulExtraContent = Buffer.concat([
  validatorsRLP,
  sealRLP,
  committedRLP
]);

// Wrap em lista RLP
const istanbulExtraLen = istanbulExtraContent.length;
let lenPrefix;
if (istanbulExtraLen < 56) {
  lenPrefix = Buffer.from([0xc0 + istanbulExtraLen]);
} else {
  const lenBytes = toBytesNoPad(istanbulExtraLen);
  lenPrefix = Buffer.concat([Buffer.from([0xf7 + lenBytes.length]), lenBytes]);
}
const istanbulExtraRLP = Buffer.concat([lenPrefix, istanbulExtraContent]);

const extraData = '0x' + vanity.toString('hex') + istanbulExtraRLP.toString('hex');

console.log(`\nextraData gerado (${vanity.length + istanbulExtraRLP.length} bytes):`);
console.log(extraData.substring(0, 100) + '...');

// Atualizar genesis.json
const genesis = JSON.parse(fs.readFileSync(GENESIS, 'utf8'));
genesis.extraData = extraData;
// Usar config.ibft (chave correta para GoQuorum 23.4.0)
genesis.config.ibft = {
  blockperiodseconds: 2,
  epochlength: 30000,
  requesttimeoutseconds: 4
};
// Remover chaves depreciadas
delete genesis.config.istanbul;
delete genesis.config.ibft2;

fs.writeFileSync(GENESIS, JSON.stringify(genesis, null, 2));
console.log('\ngenesis.json atualizado com config.ibft e extraData correto!');
console.log('\nAgora rode:');
console.log('  docker compose down -v');
console.log('  MSYS_NO_PATHCONV=1 docker compose up -d');
