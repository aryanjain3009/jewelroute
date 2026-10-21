-- Contract step for 20261021000900: VALIDATE takes SHARE UPDATE EXCLUSIVE (reads and writes continue).
-- Every existing row has NULL rotatedAt / selfAckSuspected = false, so both pass.
ALTER TABLE "RefreshToken" VALIDATE CONSTRAINT "RefreshToken_rotated_is_revoked";
ALTER TABLE "Memo" VALIDATE CONSTRAINT "Memo_self_ack_consistent";
