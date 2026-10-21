-- AlterTable
ALTER TABLE "CustodyEvent" ADD COLUMN     "outboxEventId" TEXT;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "assignedAgentId" TEXT;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "plannedTime" TEXT;

-- CreateIndex
CREATE INDEX "CustodyEvent_tenantId_visitId_idx" ON "CustodyEvent"("tenantId", "visitId");

-- CreateIndex
CREATE INDEX "CustodyEvent_tenantId_memoId_idx" ON "CustodyEvent"("tenantId", "memoId");

-- CreateIndex
CREATE INDEX "Memo_tenantId_visitId_idx" ON "Memo"("tenantId", "visitId");

-- CreateIndex
CREATE INDEX "Memo_tenantId_shopId_idx" ON "Memo"("tenantId", "shopId");

-- CreateIndex
CREATE INDEX "MemoItem_memoId_idx" ON "MemoItem"("memoId");

-- CreateIndex
CREATE INDEX "MemoItem_tenantId_pieceId_idx" ON "MemoItem"("tenantId", "pieceId");

-- CreateIndex
CREATE INDEX "Order_tenantId_visitId_idx" ON "Order"("tenantId", "visitId");

-- CreateIndex
CREATE INDEX "Order_tenantId_shopId_createdAt_idx" ON "Order"("tenantId", "shopId", "createdAt");

-- CreateIndex
CREATE INDEX "Shop_tenantId_assignedAgentId_idx" ON "Shop"("tenantId", "assignedAgentId");

-- CreateIndex
CREATE INDEX "Visit_tenantId_shopId_plannedDate_idx" ON "Visit"("tenantId", "shopId", "plannedDate");

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- plannedTime is an IST wall-clock slot "HH:MM"
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_plannedTime_format" CHECK ("plannedTime" IS NULL OR "plannedTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
