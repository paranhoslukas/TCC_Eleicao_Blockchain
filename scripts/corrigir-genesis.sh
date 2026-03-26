#!/bin/bash
# corrigir-genesis.sh v2 - usa chave "istanbul" correta para GoQuorum 23.4.0

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
GENESIS="$RAIZ/config/genesis.json"

echo "==> Lendo enderecos dos validadores..."
ENDERECOS=()
for i in 1 2 3 4; do
  ADDR=$(cat "$RAIZ/validators/$i/address" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]' | sed 's/^0x//')
  ENDERECOS+=("$ADDR")
  echo "    Validador $i: 0x$ADDR"
done

echo ""
echo "==> Gerando extraData IBFT2..."
VANITY="0000000000000000000000000000000000000000000000000000000000000000"
ENCODED_ADDRS=""
for ADDR in "${ENDERECOS[@]}"; do
  ENCODED_ADDRS="${ENCODED_ADDRS}94${ADDR}"
done
PAYLOAD_LEN=$((${#ENCODED_ADDRS} / 2))
if [ $PAYLOAD_LEN -le 55 ]; then
  PREFIX=$(printf '%02x' $((0xc0 + PAYLOAD_LEN)))
  VALIDATORS_RLP="${PREFIX}${ENCODED_ADDRS}"
else
  LEN_HEX=$(printf '%02x' $PAYLOAD_LEN)
  NUM_LEN_BYTES=$(( ${#LEN_HEX} / 2 ))
  PREFIX=$(printf '%02x' $((0xf7 + NUM_LEN_BYTES)))
  VALIDATORS_RLP="${PREFIX}${LEN_HEX}${ENCODED_ADDRS}"
fi
SEAL="0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
EXTRA_DATA="0x${VANITY}${VALIDATORS_RLP}${SEAL}"
echo "    extraData: OK ($((${#EXTRA_DATA}/2 - 1)) bytes)"

V1="0x${ENDERECOS[0]}"
V2="0x${ENDERECOS[1]}"
V3="0x${ENDERECOS[2]}"
V4="0x${ENDERECOS[3]}"

echo ""
echo "==> Gerando genesis.json com chave 'istanbul' (correta para GoQuorum 23.4.0)..."

cat > "$GENESIS" << EOF
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
    "istanbul": {
      "epoch": 30000,
      "policy": 0,
      "ceil2Nby3Block": 0
    },
    "txnSizeLimit": 64,
    "maxCodeSize": 0,
    "isQuorum": true
  },
  "nonce": "0x0",
  "timestamp": "0x58ee40ba",
  "gasLimit": "0xE0000000",
  "difficulty": "0x1",
  "mixHash": "0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365",
  "coinbase": "0x0000000000000000000000000000000000000000",
  "alloc": {
    "$V1": { "balance": "0x200000000000000000000000000000000000000000000000000000000000000" },
    "$V2": { "balance": "0x200000000000000000000000000000000000000000000000000000000000000" },
    "$V3": { "balance": "0x200000000000000000000000000000000000000000000000000000000000000" },
    "$V4": { "balance": "0x200000000000000000000000000000000000000000000000000000000000000" }
  },
  "number": "0x0",
  "gasUsed": "0x0",
  "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "extraData": "$EXTRA_DATA"
}
EOF

echo "    genesis.json gerado!"
echo ""
echo "==> Agora rode:"
echo "    docker compose down -v"
echo "    MSYS_NO_PATHCONV=1 docker compose up -d"
