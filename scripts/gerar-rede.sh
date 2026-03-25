#!/bin/bash
# =============================================================================
# gerar-rede.sh v2
# Compativel com quorumengineering/quorum:23.4.0
# Usa --entrypoint para chamar bootnode e geth diretamente
# =============================================================================

set -e

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$RAIZ/config"
VALIDATORS="$RAIZ/validators"
BOOTNODE_DIR="$RAIZ/bootnode"
RPC_DIR="$RAIZ/rpc-node"
IMAGEM="quorumengineering/quorum:23.4.0"

# No Windows com Git Bash, o Docker precisa do caminho no formato /c/...
# A funcao abaixo converte automaticamente
caminho_docker() {
  local CAMINHO="$1"
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    echo "$(cygpath -w "$CAMINHO" | sed 's/\\/\//g')"
  else
    echo "$CAMINHO"
  fi
}

echo "==> Verificando dependencias..."
if ! docker info > /dev/null 2>&1; then
  echo "ERRO: Docker nao esta rodando. Abra o Docker Desktop primeiro."
  exit 1
fi

echo "==> Limpando configuracoes anteriores..."
rm -f "$CONFIG/genesis.json" "$CONFIG/static-nodes.json"
rm -f "$BOOTNODE_DIR/nodekey" "$BOOTNODE_DIR/nodekey.pub"
for i in 1 2 3 4; do
  rm -rf "$VALIDATORS/$i/keystore"
  rm -f "$VALIDATORS/$i/nodekey" "$VALIDATORS/$i/nodekey.pub" "$VALIDATORS/$i/address"
done
rm -f "$RPC_DIR/nodekey" "$RPC_DIR/nodekey.pub"

# -------------------------------------------------------
# Gera nodekey (chave P2P do no) e extrai a chave publica
# -------------------------------------------------------
gerar_nodekey() {
  local DIR="$1"
  local LABEL="$2"
  local DMOUNT
  DMOUNT=$(caminho_docker "$DIR")

  echo "    [$LABEL] gerando nodekey..."
  docker run --rm --entrypoint bootnode \
    -v "${DMOUNT}:/output" \
    "$IMAGEM" -genkey /output/nodekey

  docker run --rm --entrypoint bootnode \
    -v "${DMOUNT}:/output" \
    "$IMAGEM" -nodekey /output/nodekey -writeaddress > "$DIR/nodekey.pub"

  echo "    [$LABEL] pubkey: $(cat $DIR/nodekey.pub)"
}

# -------------------------------------------------------
# Gera conta Ethereum (par de chaves ECDSA + endereco)
# -------------------------------------------------------
gerar_conta() {
  local DIR="$1"
  local LABEL="$2"
  local DMOUNT
  DMOUNT=$(caminho_docker "$DIR")

  echo "    [$LABEL] gerando conta..."

  # Arquivo de senha vazia temporario dentro do container
  docker run --rm --entrypoint geth \
    -v "${DMOUNT}:/data" \
    "$IMAGEM" \
    account new --datadir /data --password /dev/null 2>&1 | \
    grep -oiE '0x[0-9a-fA-F]{40}' | head -1 > "$DIR/address" || true

  # Fallback: extrai do nome do arquivo de keystore
  if [ ! -s "$DIR/address" ]; then
    local KEYFILE
    KEYFILE=$(ls "$DIR/keystore/" 2>/dev/null | head -1)
    if [ -n "$KEYFILE" ]; then
      local ADDR
      ADDR=$(echo "$KEYFILE" | grep -oE '[0-9a-fA-F]{40}$' | head -1)
      [ -n "$ADDR" ] && echo "0x$ADDR" > "$DIR/address"
    fi
  fi

  if [ -s "$DIR/address" ]; then
    echo "    [$LABEL] endereco: $(cat $DIR/address)"
  else
    echo "ERRO: nao foi possivel gerar o endereco para $LABEL"
    exit 1
  fi
}

# -------------------------------------------------------
# Gera chaves
# -------------------------------------------------------
echo ""
echo "==> Gerando chave do bootnode..."
gerar_nodekey "$BOOTNODE_DIR" "bootnode"

echo ""
echo "==> Gerando chaves e contas dos validadores..."
ENDERECOS=()
for i in 1 2 3 4; do
  gerar_nodekey "$VALIDATORS/$i" "validator-$i"
  gerar_conta   "$VALIDATORS/$i" "validator-$i"
  ADDR=$(cat "$VALIDATORS/$i/address" | tr -d '[:space:]')
  ENDERECOS+=("$ADDR")
done

echo ""
echo "==> Gerando chave do no RPC..."
gerar_nodekey "$RPC_DIR" "rpc-node"

# -------------------------------------------------------
# genesis.json
# -------------------------------------------------------
echo ""
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
echo "    genesis.json gerado."

# -------------------------------------------------------
# static-nodes.json
# -------------------------------------------------------
echo ""
echo "==> Gerando static-nodes.json..."

BN_PUB=$(cat  "$BOOTNODE_DIR/nodekey.pub"  | tr -d '[:space:]')
V1_PUB=$(cat  "$VALIDATORS/1/nodekey.pub"  | tr -d '[:space:]')
V2_PUB=$(cat  "$VALIDATORS/2/nodekey.pub"  | tr -d '[:space:]')
V3_PUB=$(cat  "$VALIDATORS/3/nodekey.pub"  | tr -d '[:space:]')
V4_PUB=$(cat  "$VALIDATORS/4/nodekey.pub"  | tr -d '[:space:]')
RPC_PUB=$(cat "$RPC_DIR/nodekey.pub"       | tr -d '[:space:]')

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
echo "    static-nodes.json gerado."

# -------------------------------------------------------
# Resumo
# -------------------------------------------------------
echo ""
echo "=============================================="
echo "  CONCLUIDO!"
echo "=============================================="
echo ""
echo "  Enderecos dos validadores:"
for i in 0 1 2 3; do
  echo "  Validador $((i+1)): ${ENDERECOS[$i]}"
done
echo ""
echo "  Proximo passo:"
echo "  docker compose up -d"
echo ""
