#!/usr/bin/env bash
# Onboards a new tester's own Freighter wallet in one step:
#   1. funds it with free Testnet XLM (Friendbot) if it doesn't exist yet,
#   2. gives it a role and display name in the app database,
#   3. grants the matching on-chain permission (admin-signed; not needed for fund_manager).
#
# Usage:
#   scripts/add-tester.sh <provider|fund_manager|compliance_reviewer|committee_member> <G... address> "Display name" [--local]
#   scripts/add-tester.sh --remove <G... address> [--local]
#
# Targets the live (Neon) database by default; --local uses web/.env.local instead.
# Needs: stellar CLI with the pb-admin key, and `npx neonctl login` for the live database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/web"
NEON_PROJECT="${NEON_PROJECT:-round-block-91308759}"
HORIZON="https://horizon-testnet.stellar.org"

LOCAL=false
ARGS=()
for a in "$@"; do [ "$a" = "--local" ] && LOCAL=true || ARGS+=("$a"); done
set -- "${ARGS[@]}"

usage() { sed -n '7,9p' "$0" | sed 's/^# \{0,3\}//'; exit 1; }
[ $# -ge 2 ] || usage

CONTRACT_ID="$(grep -E '^NEXT_PUBLIC_CONTRACT_ID=' "$WEB/.env.local" | cut -d= -f2-)"
export CONTRACT_ID

db() {
  cd "$WEB"
  if $LOCAL; then
    npm run --silent "$@"
  else
    local url
    url="$(npx --yes neonctl cs --project-id "$NEON_PROJECT" 2>/dev/null)" || { echo "Not logged in to Neon: run 'npx neonctl login'" >&2; exit 1; }
    url="${url/sslmode=require/sslmode=verify-full}"
    DATABASE_URL="$url" DATABASE_SSL=true npm run --silent "$@"
  fi
}

onchain() { # <reviewer|provider|committee> <address> <grant|revoke>
  local role="$1" addr="$2" op="$3"
  case "$role:$op" in
    provider:grant)  stellar contract invoke --id "$CONTRACT_ID" --source pb-admin --network testnet -- set_issuer --issuer "$addr" --kinds_mask 1 ;;
    reviewer:grant)  stellar contract invoke --id "$CONTRACT_ID" --source pb-admin --network testnet -- set_issuer --issuer "$addr" --kinds_mask 2 ;;
    committee:grant) stellar contract invoke --id "$CONTRACT_ID" --source pb-admin --network testnet -- set_approver --approver "$addr" --allowed true ;;
    issuer:revoke)    stellar contract invoke --id "$CONTRACT_ID" --source pb-admin --network testnet -- set_issuer --issuer "$addr" --kinds_mask 0 ;;
    committee:revoke) stellar contract invoke --id "$CONTRACT_ID" --source pb-admin --network testnet -- set_approver --approver "$addr" --allowed false ;;
  esac >/dev/null 2>&1
}

check_address() { [[ "$1" =~ ^G[A-Z2-7]{55}$ ]] || { echo "Not a Stellar public key: $1" >&2; exit 1; }; }

if [ "$1" = "--remove" ]; then
  ADDR="$2"; check_address "$ADDR"
  echo "Removing tester $ADDR"
  db db:unassign -- "$ADDR"
  onchain issuer "$ADDR" revoke && echo "  on-chain issuer permission removed"
  onchain committee "$ADDR" revoke && echo "  on-chain approver permission removed"
  exit 0
fi

ROLE="$1"; ADDR="$2"; NAME="${3:-}"
check_address "$ADDR"
[ -n "$NAME" ] || { echo "Give the tester a display name, e.g. \"Wanjiku N.\"" >&2; exit 1; }
case "$ROLE" in
  provider) CHAIN=provider ;; compliance_reviewer) CHAIN=reviewer ;; committee_member) CHAIN=committee ;; fund_manager) CHAIN="" ;;
  *) echo "Role must be provider, fund_manager, compliance_reviewer or committee_member" >&2; exit 1 ;;
esac

echo "1/3 Testnet funds"
if curl -sf "$HORIZON/accounts/$ADDR" >/dev/null; then
  echo "  account already exists"
else
  curl -sf "https://friendbot.stellar.org/?addr=$ADDR" >/dev/null && echo "  funded with 10,000 test XLM" || { echo "  Friendbot failed; try again in a minute" >&2; exit 1; }
fi

echo "2/3 App role"
db db:assign -- "$ADDR" "$ROLE" "$NAME" | grep -v "Also grant\|grant-onchain-role\|^$" || true

echo "3/3 On-chain permission"
if [ -z "$CHAIN" ]; then
  echo "  not needed for a fund manager"
else
  onchain "$CHAIN" "$ADDR" grant && echo "  granted ($CHAIN)" || { echo "  on-chain grant failed" >&2; exit 1; }
fi

echo
echo "Done. $NAME can now sign in with this wallet at /connect (Freighter on Test Net)."
