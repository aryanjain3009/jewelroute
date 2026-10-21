-- Validate the NOT VALID CHECK from 20261021000500 in its own migration (SHARE UPDATE EXCLUSIVE:
-- reads and writes continue while it scans). Reversible: dropped by the v3 down script.
ALTER TABLE "Order" VALIDATE CONSTRAINT "Order_no_submitted";
