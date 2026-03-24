# Rede GoQuorum — TCC Votacao Eletronica

## Estrutura de diretorios

```
tcc-eleicao-blockchain/
├── docker-compose.yml        # Orquestracao dos containers
├── Dockerfile                # Container do backend Node.js
├── config/
│   ├── genesis.json          # Gerado por gerar-rede.sh
│   └── static-nodes.json     # Gerado por gerar-rede.sh
├── bootnode/
│   ├── nodekey               # Chave privada do bootnode
│   └── nodekey.pub           # Chave publica do bootnode
├── validators/
│   ├── 1/                    # Chaves e endereco do validador 1
│   ├── 2/
│   ├── 3/
│   └── 4/
├── rpc-node/
│   ├── nodekey
│   └── nodekey.pub
└── scripts/
    ├── gerar-rede.sh         # Gera chaves e genesis.json (rodar 1x)
    └── validar-rede.sh       # Verifica se a rede esta saudavel
```

## Como usar

### Passo 1 — Gerar as chaves e o genesis (apenas uma vez)

```bash
chmod +x scripts/gerar-rede.sh
./scripts/gerar-rede.sh
```

Este script usa a propria imagem Docker do GoQuorum para gerar:
- Chave nodekey do bootnode
- Chaves nodekey + endereco de cada um dos 4 validadores
- Chave nodekey do no RPC
- config/genesis.json com IBFT2 configurado
- config/static-nodes.json com os enodes de todos os nos

### Passo 2 — Subir a rede

```bash
docker compose up -d
```

Aguarde cerca de 15-30 segundos para todos os nos sincronizarem.

### Passo 3 — Validar que a rede esta funcionando

```bash
chmod +x scripts/validar-rede.sh
./scripts/validar-rede.sh
```

Voce deve ver blocos sendo produzidos a cada 2 segundos.

### Passo 4 — Verificar producao de blocos manualmente

```bash
# Numero do bloco atual
curl -s -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Lista de validadores IBFT
curl -s -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"istanbul_getValidators","params":["latest"],"id":1}'

# Numero de peers conectados
curl -s -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}'
```

### Parar a rede

```bash
docker compose down
```

### Apagar tudo e comecar do zero

```bash
docker compose down -v
rm -rf config/genesis.json config/static-nodes.json
rm -rf bootnode/nodekey bootnode/nodekey.pub
rm -rf validators/1/* validators/2/* validators/3/* validators/4/*
rm -rf rpc-node/nodekey rpc-node/nodekey.pub
./scripts/gerar-rede.sh
```

## Detalhes da rede

| Parametro        | Valor         |
|------------------|---------------|
| Chain ID         | 1337          |
| Consenso         | IBFT2         |
| Validadores      | 4             |
| Tolerancia BFT   | f = 1 no      |
| Intervalo bloco  | 2 segundos    |
| Porta RPC HTTP   | 8545          |
| Porta RPC WS     | 8546          |
| Porta backend    | 3000          |

## Proximo passo

Com a rede funcionando, o proximo passo e fazer o deploy do contrato
inteligente de votacao (Votacao.sol) usando o script de deploy com ethers.js,
e refatorar o server.js para chamar o contrato em vez de gerenciar a chain
localmente.
