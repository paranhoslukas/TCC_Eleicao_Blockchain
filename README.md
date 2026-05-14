# AuditVote — Votação Eletrônica Auditável com Blockchain Permissiva

> TCC — Unianchieta · Jundiaí SP  
> Autores: Lucas Paranhos · Matheus Barbosa · João Gabriel  
> Orientador: Clayton Augusto Valdo

Sistema de votação eletrônica baseado em blockchain permissiva (GoQuorum/IBFT2), com contratos inteligentes em Solidity, backend Node.js e frontend web auditável publicamente.

**Demo ao vivo:** [auditvote.ddns.net:2001](http://auditvote.ddns.net:2001)  
**Repo do nó externo (auditoria):** [github.com/paranhoslukas/tcc-eleicao-node](https://github.com/paranhoslukas/tcc-eleicao-node)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Blockchain | GoQuorum 23.4.0 · Consenso IBFT2 · 4 validadores |
| Contrato inteligente | Solidity 0.8.19 |
| Backend | Node.js 20 · Express 5 · ethers.js 6 |
| Frontend | HTML · CSS · JavaScript puro |
| Infraestrutura | Docker Compose · 7 containers |
| Deploy | Rede doméstica com DDNS |
| Docker publico para participar da rede ``` https://github.com/paranhoslukas/tcc-eleicao-blockchain-no``` |


---

## Arquitetura da rede

```
┌─────────────────────────────────────────────────┐
│               Máquina principal                  │
│                                                  │
│  tcc-bootnode      → discovery de peers          │
│  tcc-validator-1   → valida e assina blocos      │
│  tcc-validator-2   → valida e assina blocos      │
│  tcc-validator-3   → valida e assina blocos      │
│  tcc-validator-4   → valida e assina blocos      │
│  tcc-rpc-node      → leitura via HTTP/WS         │
│  tcc-backend       → API Node.js + frontend      │
└─────────────────────────────────────────────────┘
            │ P2P (porta 30303)
            ▼
┌─────────────────────────────────────────────────┐
│         Qualquer máquina externa                 │
│                                                  │
│  tcc-no-externo    → observa e audita a chain    │
│  (repo público: tcc-eleicao-node)                │
└─────────────────────────────────────────────────┘
```

Os 4 validadores assinam cada bloco via consenso IBFT2 (Byzantine Fault Tolerant). O nó externo sincroniza uma cópia completa da blockchain de forma independente, sem confiar na máquina principal — garantindo a auditabilidade descentralizada.

---

## Estrutura do projeto

```
tcc-eleicao-blockchain/
│
├── config/
│   ├── genesis.json          # Bloco gênese da rede (chain ID 1337, IBFT2)
│   └── static-nodes.json     # Enodes de todos os nós para discovery P2P
│
├── contracts/
│   ├── Votacao.sol            # Contrato inteligente principal (Solidity 0.8.19)
│   ├── Votacao.abi.json       # ABI gerado após compilação (usado pelo backend)
│   └── Votacao.bytecode.json  # Bytecode gerado após compilação (usado no deploy)
│
├── public/
│   ├── index.html             # Frontend público: votar, resultados, histórico
│   ├── admin.html             # Painel administrativo protegido por senha
│   ├── scripts/
│   │   ├── app.js             # Lógica do frontend público
│   │   └── admin.js           # Lógica do painel admin
│   └── styles/
│       └── main_styles.css    # Design system completo (tema escuro)
│
├── validators/
│   ├── 1/                     # Chaves do validador 1 (nodekey, keystore, address)
│   ├── 2/                     # Chaves do validador 2
│   ├── 3/                     # Chaves do validador 3
│   └── 4/                     # Chaves do validador 4
│
├── bootnode/
│   └── nodekey.pub            # Chave pública do bootnode P2P
│
├── rpc-node/
│   └── nodekey.pub            # Chave pública do nó RPC
│
├── scripts/
│   ├── gerar-rede.sh          # Gera chaves, genesis e static-nodes (rodar 1x)
│   ├── corrigir-genesis.sh    # Corrige o extraData do genesis para GoQuorum 23.4.0
│   └── validar-rede.sh        # Verifica saúde da rede após subir os containers
│
├── server.js                  # API Express: rotas públicas e admin, deploy de contratos
├── docker-compose.yml         # Orquestração dos 7 containers
├── Dockerfile                 # Imagem do container do backend Node.js
├── package.json               # Dependências: express, ethers, solc, dotenv
├── contract-address.json      # Histórico de eleições deployadas (gerado em runtime)
├── .env                       # Variáveis sensíveis (nunca sobe ao git)
├── .gitignore                 # Exclui chaves privadas, .env, node_modules
└── .dockerignore              # Exclui node_modules e logs da imagem Docker
```

---

## Fluxo de uma eleição

```
1. Admin faz deploy do contrato     → estado: Aberta
2. Admin adiciona candidatos        → mínimo 2
3. Admin autoriza eleitores         → somente no modo restrito
4. Admin inicia a votação           → estado: EmVotacao
5. Eleitores votam via frontend     → CPF/RA hasheado no servidor
6. Admin encerra a votação          → estado: Encerrada
7. Qualquer pessoa audita           → registros on-chain públicos
```

---

## Contrato inteligente (Votacao.sol)

Dois modos de votação:

- **Restrito** (`modoAberto=false`) — somente eleitores autorizados pelo admin
- **Aberto** (`modoAberto=true`) — qualquer pessoa com acesso pode votar (ideal para demos)

Identificação do eleitor: `keccak256(CPF + salt)` — o dado original nunca é armazenado on-chain.

Compilar com `solc@0.8.19` (versões mais novas causam `CALL_EXCEPTION` no GoQuorum 23.4.0):

```bash
npm install solc@0.8.19
node -e "
const solc = require('solc');
const fs = require('fs');
const source = fs.readFileSync('./contracts/Votacao.sol', 'utf8');
const input = { language: 'Solidity', sources: { 'Votacao.sol': { content: source } }, settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } } };
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const c = output.contracts['Votacao.sol']['Votacao'];
fs.writeFileSync('./contracts/Votacao.abi.json', JSON.stringify(c.abi, null, 2));
fs.writeFileSync('./contracts/Votacao.bytecode.json', JSON.stringify({ bytecode: c.evm.bytecode.object }));
console.log('Compilado com sucesso.');
"
```

---

## Rotas da API (server.js)

**Públicas:**

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/rede` | Status da rede GoQuorum (bloco atual, peers, validadores) |
| GET | `/api/eleicoes` | Lista histórico de todas as eleições |
| GET | `/api/eleicao/atual` | Dados da eleição mais recente |
| GET | `/api/eleicao/:endereco` | Dados de uma eleição específica |
| GET | `/api/eleicao/:endereco/votos` | Registros de votos on-chain para auditoria |
| GET | `/api/votar/elegivel/:cpf` | Verifica elegibilidade do eleitor |
| POST | `/api/votar` | Registra voto na blockchain |

**Admin** (header `x-admin-secret`):

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/admin/verificar` | Valida senha do admin |
| POST | `/api/admin/eleicao` | Deploy de novo contrato na blockchain |
| POST | `/api/admin/candidato` | Adiciona candidato ao contrato |
| POST | `/api/admin/autorizar` | Autoriza eleitor individual |
| POST | `/api/admin/iniciar` | Inicia votação |
| POST | `/api/admin/encerrar` | Encerra votação |

---

## Como rodar localmente

### 1. Configurar variáveis de ambiente

Crie o arquivo `.env` na raiz do projeto:

```env
ADMIN_PRIVATE_KEY=0xSUA_CHAVE_PRIVADA
ADMIN_ADDRESS=0xSEU_ENDERECO
RPC_URL=http://rpc-node:8545
CPF_SALT=tcc_eleicao_2025_salt
ADMIN_SECRET=sua_senha_admin
```

### 2. Gerar as chaves e o genesis (apenas uma vez)

```bash
MSYS_NO_PATHCONV=1 ./scripts/gerar-rede.sh
./scripts/corrigir-genesis.sh
```

### 3. Subir a rede

```bash
MSYS_NO_PATHCONV=1 docker compose up -d
```

Aguarde 15–30 segundos para todos os nós sincronizarem.

### 4. Validar que a rede está funcionando

```bash
./scripts/validar-rede.sh
```

### 5. Acessar o sistema

- **Frontend público:** [http://localhost:3000](http://localhost:3000)
- **Painel admin:** [http://localhost:3000/admin.html](http://localhost:3000/admin.html)
- **RPC GoQuorum:** [http://localhost:8545](http://localhost:8545)

---

## Atualizar container sem rebuild

```bash
# Copiar arquivo atualizado e reiniciar
docker cp server.js tcc-backend:/aplicacao/server.js
docker restart tcc-backend

# Rebuild completo (quando mudar Dockerfile ou package.json)
docker compose up -d --build backend
```

**Atenção:** após rebuild, recopiar os arquivos gerados em runtime:

```bash
docker cp contract-address.json tcc-backend:/aplicacao/contract-address.json
docker cp contracts/Votacao.abi.json tcc-backend:/aplicacao/contracts/Votacao.abi.json
docker cp contracts/Votacao.bytecode.json tcc-backend:/aplicacao/contracts/Votacao.bytecode.json
```

---

## Detalhes da rede

| Parâmetro | Valor |
|---|---|
| Chain ID | 1337 |
| Consenso | IBFT2 |
| Validadores | 4 |
| Tolerância BFT | f = 1 nó (suporta 1 falha) |
| Intervalo de bloco | 2 segundos |
| Porta RPC HTTP | 8545 |
| Porta RPC WS | 8546 |
| Porta P2P | 30303 |
| Porta backend | 3000 |
| Porta bootnode | 30301 |

---

## Conectar um nó externo (auditoria)

Qualquer pessoa pode conectar um nó observador à rede para auditar os votos de forma independente, sem depender do servidor principal.

**Repositório público:** [github.com/paranhoslukas/tcc-eleicao-node](https://github.com/paranhoslukas/tcc-eleicao-node)

```bash
git clone https://github.com/paranhoslukas/tcc-eleicao-node.git
cd tcc-eleicao-node
docker compose up -d
docker logs tcc-no-externo -f
```

O nó sincroniza toda a blockchain automaticamente e permite auditoria via RPC local em `http://localhost:8545`.

**Verificar conexão:**

```bash
# Número do bloco atual (deve aumentar a cada 2 segundos)
curl -s -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Validadores IBFT ativos
curl -s -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"istanbul_getValidators","params":["latest"],"id":1}'
```

---

## Parar e reiniciar

```bash
# Parar sem apagar dados
docker compose down

# Apagar tudo e começar do zero
docker compose down -v
rm -rf config/genesis.json config/static-nodes.json
rm -rf bootnode/nodekey bootnode/nodekey.pub
rm -rf validators/1/* validators/2/* validators/3/* validators/4/*
rm -rf rpc-node/nodekey rpc-node/nodekey.pub
MSYS_NO_PATHCONV=1 ./scripts/gerar-rede.sh
./scripts/corrigir-genesis.sh
MSYS_NO_PATHCONV=1 docker compose up -d
```

---

## Segurança

- Chaves privadas dos validadores estão no `.gitignore` e nunca sobem ao repositório
- `ADMIN_PRIVATE_KEY`, `ADMIN_SECRET` e `CPF_SALT` ficam exclusivamente no `.env`
- O CPF/RA do eleitor é hasheado no servidor antes de qualquer interação com a blockchain
- O dado original nunca é armazenado em nenhuma camada do sistema
