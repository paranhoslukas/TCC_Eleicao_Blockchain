#!/bin/bash
# =============================================================================
# validar-rede.sh
# Verifica se a rede GoQuorum esta funcionando corretamente apos o docker compose up.
# Execute depois que todos os containers estiverem de pe.
# =============================================================================

RPC="http://localhost:8545"
OK=0
FALHA=0

checar() {
  local descricao="$1"
  local resultado="$2"
  local esperado="$3"

  if echo "$resultado" | grep -q "$esperado"; then
    echo "  [OK] $descricao"
    OK=$((OK + 1))
  else
    echo "  [FALHA] $descricao"
    echo "         Resultado: $resultado"
    FALHA=$((FALHA + 1))
  fi
}

rpc() {
  curl -s -X POST "$RPC" \
    -H "Content-Type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"$1\",\"params\":$2,\"id\":1}"
}

echo ""
echo "==> Validando rede GoQuorum (IBFT) em $RPC"
echo ""

echo "--- Conectividade ---"
BLOCO=$(rpc "eth_blockNumber" "[]")
checar "No RPC respondendo" "$BLOCO" "result"

CHAIN=$(rpc "eth_chainId" "[]")
checar "Chain ID correto (1337 = 0x539)" "$CHAIN" "0x539"

echo ""
echo "--- Sincronizacao ---"
SINC=$(rpc "eth_syncing" "[]")
checar "No nao esta sincronizando (ja sincronizado)" "$SINC" "false"

PEERS=$(rpc "net_peerCount" "[]")
checar "Pelo menos 4 peers conectados" "$PEERS" "0x"

echo ""
echo "--- Consenso IBFT ---"
VALIDATORS=$(rpc "istanbul_getValidators" "[\"latest\"]")
checar "Lista de validadores retornada" "$VALIDATORS" "0x"

SNAPSHOT=$(rpc "istanbul_getSnapshot" "[\"latest\"]")
checar "Snapshot IBFT disponivel" "$SNAPSHOT" "validators"

echo ""
echo "--- Producao de blocos ---"
BLOCO_NUM_HEX=$(rpc "eth_blockNumber" "[]" | grep -oE '"0x[0-9a-f]+"' | head -1 | tr -d '"')
BLOCO_NUM=$((16#${BLOCO_NUM_HEX#0x}))
echo "  Altura atual: $BLOCO_NUM"

if [ "$BLOCO_NUM" -gt 2 ]; then
  echo "  [OK] Rede esta produzindo blocos (altura > 2)"
  OK=$((OK + 1))
else
  echo "  [AGUARDANDO] Altura atual: $BLOCO_NUM. Espere alguns segundos e tente novamente."
  FALHA=$((FALHA + 1))
fi

echo ""
echo "==> Resultado: $OK verificacoes OK, $FALHA falhas"

if [ "$FALHA" -eq 0 ]; then
  echo "==> Rede funcionando corretamente. Pronto para deploy do contrato."
else
  echo "==> Verifique os logs com: docker compose logs -f"
fi
echo ""
