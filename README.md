# TCC — Votação Eletrônica Auditável com GoQuorum

Protótipo de sistema de votação eletrônica baseado em blockchain permissiva (GoQuorum/IBFT2).

## Stack

- **Blockchain**: GoQuorum 23.4.0 com consenso IBFT2
- **Backend**: Node.js + Express
- **Frontend**: HTML/CSS/JS
- **Infraestrutura**: Docker Compose

## Como rodar localmente

### 1. Gerar as chaves e o genesis (apenas uma vez)
```bash
MSYS_NO_PATHCONV=1 ./scripts/gerar-rede.sh
./scripts/corrigir-genesis.sh
```

### 2. Subir a rede
```bash
MSYS_NO_PATHCONV=1 docker compose up -d
```

### 3. Validar
```bash
./scripts/validar-rede.sh
```

## Estrutura
```
├── config/          # genesis.json e static-nodes.json
├── validators/      # Endereços e chaves públicas dos 4 validadores IBFT
├── bootnode/        # Chave pública do bootnode
├── rpc-node/        # Chave pública do nó RPC
├── scripts/         # Scripts de setup e validação
├── server.js        # API Express
├── app.js           # Frontend JS
└── docker-compose.yml
```
