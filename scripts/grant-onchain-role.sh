#!/usr/bin/env bash
# Grants on-chain permissions on the PensionBridge contract (admin-signed).
# Usage: scripts/grant-onchain-role.sh <provider|reviewer|committee> <G... address>
set -euo pipefail
ROLE="$1"; ADDR="$2"
CID="${CONTRACT_ID:?set CONTRACT_ID}"
SRC="${ADMIN_KEY_ALIAS:-pb-admin}"
case "$ROLE" in
  provider)  stellar contract invoke --id "$CID" --source "$SRC" --network testnet -- set_issuer --issuer "$ADDR" --kinds_mask 1 ;;
  reviewer)  stellar contract invoke --id "$CID" --source "$SRC" --network testnet -- set_issuer --issuer "$ADDR" --kinds_mask 2 ;;
  committee) stellar contract invoke --id "$CID" --source "$SRC" --network testnet -- set_approver --approver "$ADDR" --allowed true ;;
  *) echo "role must be provider, reviewer or committee" >&2; exit 1 ;;
esac
