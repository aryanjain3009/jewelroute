-- Contract step for 20261021001100 (SHARE UPDATE EXCLUSIVE; reads and writes continue). Existing rows have NULLs.
SET lock_timeout = '3s';
ALTER TABLE "RefreshToken" VALIDATE CONSTRAINT "RefreshToken_successor_needs_rotation";
ALTER TABLE "RefreshToken" VALIDATE CONSTRAINT "RefreshToken_grace_needs_successor";
RESET lock_timeout;
