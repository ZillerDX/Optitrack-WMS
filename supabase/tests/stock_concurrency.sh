#!/usr/bin/env bash
# Concurrency tests for 0008_stock_movements.sql: many database connections call the functions
# at the same moment and the invariants must still hold. Needs the migrations applied and the
# usual libpq variables (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE). It commits real rows
# (parallel sessions cannot share one transaction) and removes them at the end.
#
#   bash supabase/tests/stock_concurrency.sh
set -euo pipefail

TMP="$(mktemp -d)"
RUN="$(date +%s)$$"
PSQL=(psql -X -q -At -v ON_ERROR_STOP=1)
FAILED=0

sql() { "${PSQL[@]}" -c "$1"; }
fail() { echo "FAIL: $*"; FAILED=1; }
check() { # check <description> <expected> <actual>
    if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; else fail "$1: expected $2, got $3"; fi
}

cleanup() {
    "${PSQL[@]}" >/dev/null 2>&1 <<SQL || true
DELETE FROM public.purchase_orders WHERE user_id IN (SELECT id FROM public.users WHERE email LIKE 'conc-$RUN-%');
DELETE FROM public.transactions    WHERE user_id IN (SELECT id FROM public.users WHERE email LIKE 'conc-$RUN-%');
DELETE FROM public.inventory       WHERE product_id IN (SELECT id FROM public.products WHERE owner_id IN (SELECT id FROM public.users WHERE email LIKE 'conc-$RUN-%'));
DELETE FROM public.products        WHERE owner_id IN (SELECT id FROM public.users WHERE email LIKE 'conc-$RUN-%');
DELETE FROM public.locations       WHERE owner_id IN (SELECT id FROM public.users WHERE email LIKE 'conc-$RUN-%');
DELETE FROM public.users           WHERE email LIKE 'conc-$RUN-%';
SQL
    rm -rf "$TMP"
}
trap cleanup EXIT

# fire <count> <sql-with-@I@-placeholder-for-the-iteration>: run them all at once, count successes
fire() {
    local n="$1" tpl="$2" i
    rm -f "$TMP"/res.*
    for i in $(seq 1 "$n"); do
        (
            stmt="${tpl//@I@/$i}"
            if "${PSQL[@]}" -c "$stmt" >/dev/null 2>"$TMP/err.$i"; then echo ok >"$TMP/res.$i"; else echo fail >"$TMP/res.$i"; fi
        ) &
    done
    wait
    OK=$(cat "$TMP"/res.* | grep -c '^ok$' || true)
    BAD=$(cat "$TMP"/res.* | grep -c '^fail$' || true)
}

new_user() { sql "INSERT INTO public.users (email, password_hash, first_name, last_name, role, is_active) VALUES ('conc-$RUN-$1', 'x', 'C', 'C', 'ADMIN', true) RETURNING id"; }
new_location() { sql "INSERT INTO public.locations (owner_id, name, capacity) VALUES ($1, '$2', $3) RETURNING id" >/dev/null; }
new_product() { sql "INSERT INTO public.products (owner_id, sku, name, cost_price, sell_price, min_stock_level) VALUES ($1, '$2', '$2', 5, 9, 3) RETURNING id"; }

echo "1. Overselling: 40 sessions each try to ship 1 unit of a product that has 10"
U=$(new_user s1); new_location "$U" DOCK 1000; P=$(new_product "$U" S1)
sql "SELECT public.apply_stock_movement($U, $P, 'DOCK', 'ADJUST', 10)" >/dev/null
fire 40 "SELECT public.apply_stock_movement($U, $P, 'DOCK', 'OUTBOUND', 1)"
check "shipments that succeeded" 10 "$OK"
check "shipments refused" 30 "$BAD"
check "stock left" 0 "$(sql "SELECT quantity FROM public.inventory WHERE product_id = $P")"
check "OUTBOUND rows recorded" 10 "$(sql "SELECT count(*) FROM public.transactions WHERE product_id = $P AND type = 'OUTBOUND'")"
grep -qi "insufficient stock" "$TMP"/err.* || fail "refusals should say 'Insufficient stock'"

echo "2. Capacity: 40 sessions each add 1 unit across two products to a location that holds 10"
U=$(new_user s2); new_location "$U" SHELF 10; P1=$(new_product "$U" S2A); P2=$(new_product "$U" S2B)
fire 40 "SELECT public.apply_stock_movement($U, CASE WHEN @I@ % 2 = 0 THEN $P1 ELSE $P2 END, 'SHELF', 'INBOUND', 1)"
check "additions that succeeded" 10 "$OK"
check "location total (capacity 10)" 10 "$(sql "SELECT COALESCE(sum(quantity), 0) FROM public.inventory WHERE product_id IN ($P1, $P2)")"

echo "3. Ledger: mixed inbound/outbound at the same time; stock must equal the sum of the transactions"
U=$(new_user s3); new_location "$U" BAY 100000; P=$(new_product "$U" S3)
sql "SELECT public.apply_stock_movement($U, $P, 'BAY', 'ADJUST', 50)" >/dev/null
fire 60 "SELECT public.apply_stock_movement($U, $P, 'BAY', CASE WHEN @I@ % 3 = 0 THEN 'OUTBOUND' ELSE 'INBOUND' END, @I@ % 7 + 1)"
STOCK=$(sql "SELECT quantity FROM public.inventory WHERE product_id = $P")
LEDGER=$(sql "SELECT COALESCE(sum(CASE type WHEN 'INBOUND' THEN quantity WHEN 'OUTBOUND' THEN -quantity ELSE 0 END), 0) FROM public.transactions WHERE product_id = $P AND type <> 'ADJUST'")
check "stock = 50 + inbound - outbound recorded" "$((50 + LEDGER))" "$STOCK"
check "no negative stock" 0 "$(sql "SELECT count(*) FROM public.inventory WHERE product_id = $P AND quantity < 0")"

echo "4. Purchase orders: 10 sessions approve the SAME PO number at once"
U=$(new_user s4); new_location "$U" RECV 1000; P=$(new_product "$U" S4)
fire 10 "SELECT public.approve_reorder($U, $P, 'RECV', 5, 'PO-$RUN')"
check "approvals that succeeded" 1 "$OK"
check "stock received once" 5 "$(sql "SELECT quantity FROM public.inventory WHERE product_id = $P")"
check "PO rows" 1 "$(sql "SELECT count(*) FROM public.purchase_orders WHERE po_number = 'PO-$RUN'")"
check "receipt transactions" 1 "$(sql "SELECT count(*) FROM public.transactions WHERE ref_code = 'PO-$RUN'")"

echo "5. Two tenants at the same time never see each other's stock"
UA=$(new_user s5a); UB=$(new_user s5b); new_location "$UA" X 1000; new_location "$UB" X 1000
PA=$(new_product "$UA" S5); PB=$(new_product "$UB" S5)
fire 20 "SELECT public.apply_stock_movement(CASE WHEN @I@ % 2 = 0 THEN $UA ELSE $UB END, CASE WHEN @I@ % 2 = 0 THEN $PA ELSE $PB END, 'X', 'INBOUND', 1)"
check "all succeeded" 20 "$OK"
check "tenant A stock" 10 "$(sql "SELECT quantity FROM public.inventory WHERE product_id = $PA")"
check "tenant B stock" 10 "$(sql "SELECT quantity FROM public.inventory WHERE product_id = $PB")"

echo "6. Deleting stock rows while receipts arrive: no unit may vanish without a transaction"
U=$(new_user s6); new_location "$U" BIN 100000; P=$(new_product "$U" S6)
sql "SELECT public.apply_stock_movement($U, $P, 'BIN', 'ADJUST', 5)" >/dev/null
fire 60 "SELECT CASE WHEN @I@ % 4 = 0 THEN public.delete_inventory($U, (SELECT id FROM public.inventory WHERE product_id = $P LIMIT 1)) ELSE public.apply_stock_movement($U, $P, 'BIN', 'INBOUND', 1) END"
# replay the ledger in commit order (ids are handed out under the location lock): the last ADJUST
# sets the quantity, receipts after it add to it. A row deleted while it still held stock, without
# its ADJUST, would leave the replay higher than what is on the shelf.
EXPECTED=$(sql "WITH last_adjust AS (SELECT COALESCE(max(id), 0) AS id FROM public.transactions WHERE product_id = $P AND type = 'ADJUST')
SELECT COALESCE((SELECT quantity FROM public.transactions WHERE id = (SELECT id FROM last_adjust)), 0)
     + COALESCE((SELECT sum(quantity) FROM public.transactions WHERE product_id = $P AND type = 'INBOUND' AND id > (SELECT id FROM last_adjust)), 0)")
ACTUAL=$(sql "SELECT COALESCE(sum(quantity), 0) FROM public.inventory WHERE product_id = $P")
check "shelf quantity = ledger replay" "$EXPECTED" "$ACTUAL"
DELETED=$(sql "SELECT count(*) FROM public.transactions WHERE product_id = $P AND notes = 'Inventory record deleted'")
if [ "$DELETED" -ge 1 ]; then echo "  ok   at least one delete removed stock ($DELETED)"; else fail "no delete ran while stock was on the shelf"; fi

if [ "$FAILED" -ne 0 ]; then echo "stock_concurrency.sh: FAILED"; exit 1; fi
echo "stock_concurrency.sh: all invariants held"
