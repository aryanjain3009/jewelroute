-- v3 follow-up guards (T3 review B1/B2). Cheap DDL only: the CHECK is added NOT VALID (no table
-- scan under the ACCESS EXCLUSIVE lock) and validated in 20261021000600; the triggers do not scan.
-- Reversible: prisma/rollback/20261021000300_v3_down.sql drops all of it.

-- B2: no row may be SUBMITTED (the value exists only for rollback / expand-contract).
ALTER TABLE "Order" ADD CONSTRAINT "Order_no_submitted" CHECK ("status" <> 'SUBMITTED') NOT VALID;

-- B1: a SOLD piece must be sold by a live order — some OrderItem.pieceId on an order that is not
-- REJECTED or CANCELLED. Checked at COMMIT (constraint triggers, deferred) because memo convert
-- moves the piece to SOLD before it inserts the order in the same transaction. Fires when a piece
-- becomes SOLD and when an order that sold pieces is rejected/cancelled — so a rejection that does
-- not un-sell its pieces (or a cancel of a converted order) cannot commit.
CREATE OR REPLACE FUNCTION jr_check_sold_piece(p_piece TEXT) RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "SamplePiece" sp WHERE sp.id = p_piece AND sp."custodianType" = 'SOLD')
     AND NOT EXISTS (SELECT 1 FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
                     WHERE oi."pieceId" = p_piece AND o."status" NOT IN ('REJECTED', 'CANCELLED')) THEN
    RAISE EXCEPTION 'SamplePiece_sold_has_live_order: piece % is SOLD but no live order sold it', p_piece
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION jr_piece_sold_guard() RETURNS trigger AS $$
BEGIN
  PERFORM jr_check_sold_piece(NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION jr_order_dead_guard() RETURNS trigger AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT "pieceId" FROM "OrderItem" WHERE "orderId" = NEW.id AND "pieceId" IS NOT NULL LOOP
    PERFORM jr_check_sold_piece(r."pieceId");
  END LOOP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "SamplePiece_sold_has_live_order" AFTER INSERT OR UPDATE OF "custodianType" ON "SamplePiece"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."custodianType" = 'SOLD') EXECUTE FUNCTION jr_piece_sold_guard();
CREATE CONSTRAINT TRIGGER "Order_dead_unsells_pieces" AFTER UPDATE OF "status" ON "Order"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."status" IN ('REJECTED', 'CANCELLED') AND OLD."status" IS DISTINCT FROM NEW."status")
  EXECUTE FUNCTION jr_order_dead_guard();
