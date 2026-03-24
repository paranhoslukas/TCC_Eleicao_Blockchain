#!/bin/bash
# =============================================================================
# gerar-rede.sh
# Gera as chaves criptograficas, enderecos e o genesis.json da rede GoQuorum
# com consenso IBFT2. Execute uma unica vez antes de subir o docker-compose.
# =============================================================================

set -e

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$RAIZ/config"
VALIDATORS="$RAIZ/validators"
BOOTNODE_DIR="$RAIZ/bootnode"
RPC_DIR="$RAIZ/rpc-node"

echo "==> Verificando dependencias..."
if ! command -v docker &> /dev/null; then
  echo "ERRO: Docker nao encontrado. Instale o Docker antes de continuar."
  exit 1
fi

echo "==> Limpando configuracoes anteriores..."
rm -f "$CONFIG"/genesis.json
rm -f "$CONFIG"/static-nodes.json
rm -f "$BOOTNODE_DIR"/nodekey
rm -f "$BOOTNODE_DIR"/nodekey.pub
for i in 1 2 3 4; do
  rm -f "$VALIDATORS/$i"/nodekey
  rm -f "$VALIDATORS/$i"/nodekey.pub
  rm -f "$VALIDATORS/$i"/address
  rm -f "$VALIDATORS/$i"/account.json
done
rm -f "$RPC_DIR"/nodekey
rm -f "$RPC_DIR"/nodekey.pub

echo "==> Gerando chave do bootnode..."
docker run --rm \
  -v "$BOOTNODE_DIR":/output \
  quorumengineering/quorum:23.4.0 \
  sh -c "geth account new --datadir /output --password /dev/null 2>/dev/null; \
         bootnode -genkey /output/nodekey; \
         bootnode -nodekey /output/nodekey -writeaddress > /output/nodekey.pub"

BOOTNODE_PUBKEY=$(cat "$BOOTNODE_DIR/nodekey.pub")
echo "    Bootnode pubkey: $BOOTNODE_PUBKEY"

echo "==> Gerando chaves dos validadores..."
ENDERECOS=()
for i in 1 2 3 4; do
  echo "    Validador $i..."
  docker run --rm \
    -v "$VALIDATORS/$i":/output \
    quorumengineering/quorum:23.4.0 \
    sh -c "
      geth account new --datadir /output --password /dev/null 2>/dev/null
      ADDR=\$(geth account list --datadir /output 2>/dev/null | head -1 | grep -oE '0x[0-9a-fA-F]+')
      echo \$ADDR > /output/address
      bootnode -genkey /output/nodekey
      bootnode -nodekey /output/nodekey -writeaddress > /output/nodekey.pub
    "
  ADDR=$(cat "$VALIDATORS/$i/address" | tr -d '[:space:]')
  ENDERECOS+=("$ADDR")
  echo "    Endereco $i: $ADDR"
done

echo "==> Gerando chave do no RPC..."
docker run --rm \
  -v "$RPC_DIR":/output \
  quorumengineering/quorum:23.4.0 \
  sh -c "bootnode -genkey /output/nodekey; \
         bootnode -nodekey /output/nodekey -writeaddress > /output/nodekey.pub"

echo "==> Gerando extradata IBFT com os 4 validadores..."
VALIDATOR_LIST=""
for ADDR in "${ENDERECOS[@]}"; do
  ADDR_LIMPO=$(echo "$ADDR" | sed 's/0x//')
  VALIDATOR_LIST="$VALIDATOR_LIST$ADDR_LIMPO"
done

# extradata IBFT2: 32 bytes zeros + RLP(validators) + 65 bytes zeros
EXTRA_DATA=$(docker run --rm \
  quorumengineering/quorum:23.4.0 \
  sh -c "istanbul extra encode --validators ${ENDERECOS[*]}" 2>/dev/null || \
  echo "0x0000000000000000000000000000000000000000000000000000000000000000f85ad594${VALIDATOR_LIST}b8410000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c0")

echo "==> Gerando genesis.json..."
cat > "$CONFIG/genesis.json" << EOF
{
  "config": {
    "chainId": 1337,
    "homesteadBlock": 0,
    "eip150Block": 0,
    "eip155Block": 0,
    "eip158Block": 0,
    "byzantiumBlock": 0,
    "constantinopleBlock": 0,
    "petersburgBlock": 0,
    "istanbulBlock": 0,
    "ibft2": {
      "blockperiodseconds": 2,
      "epochlength": 30000,
      "requesttimeoutseconds": 4
    }
  },
  "nonce": "0x0",
  "timestamp": "0x58ee40ba",
  "gasLimit": "0xE0000000",
  "difficulty": "0x1",
  "mixHash": "0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365",
  "coinbase": "0x0000000000000000000000000000000000000000",
  "alloc": {
    "${ENDERECOS[0]}": { "balance": "0x200000000000000000000000000000000000000000000000000000000000000" },
    "${ENDERECOS[1]}": { "balance": "0x200000000000000000000000000000000000000000000000000000000000000" },
    "${ENDERECOS[2]}": { "balance": "0x200000000000000000000000000000000000000000000000000000000000000" },
    "${ENDERECOS[3]}": { "balance": "0x200000000000000000000000000000000000000000000000000000000000000" }
  },
  "number": "0x0",
  "gasUsed": "0x0",
  "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "extraData": "0x0000000000000000000000000000000000000000000000000000000000000000"
}
EOF

echo "==> genesis.json gerado em $CONFIG/genesis.json"

echo "==> Gerando static-nodes.json..."
V1_PUB=$(cat "$VALIDATORS/1/nodekey.pub" | tr -d '[:space:]')
V2_PUB=$(cat "$VALIDATORS/2/nodekey.pub" | tr -d '[:space:]')
V3_PUB=$(cat "$VALIDATORS/3/nodekey.pub" | tr -d '[:space:]')
V4_PUB=$(cat "$VALIDATORS/4/nodekey.pub" | tr -d '[:space:]')
RPC_PUB=$(cat "$RPC_DIR/nodekey.pub" | tr -d '[:space:]')
BN_PUB=$(cat "$BOOTNODE_DIR/nodekey.pub" | tr -d '[:space:]')

cat > "$CONFIG/static-nodes.json" << EOF
[
  "enode://${BN_PUB}@bootnode:30301",
  "enode://${V1_PUB}@validator-1:30303",
  "enode://${V2_PUB}@validator-2:30303",
  "enode://${V3_PUB}@validator-3:30303",
  "enode://${V4_PUB}@validator-4:30303",
  "enode://${RPC_PUB}@rpc-node:30303"
]
EOF

echo "==> static-nodes.json gerado em $CONFIG/static-nodes.json"
echo ""
echo "==> CONCLUIDO! Agora execute: docker compose up -d"
echo ""
echo "    Enderecos dos validadores:"
for i in 0 1 2 3; do
  echo "    Validador $((i+1)): ${ENDERECOS[$i]}"
done
