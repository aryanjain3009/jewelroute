-- CreateEnum
CREATE TYPE "Role" AS ENUM ('FIELD_AGENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "Purity" AS ENUM ('K24', 'K22', 'K18', 'K14');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('PLANNED', 'CHECKED_IN', 'ACTIVE', 'COMPLETED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GeoVerification" AS ENUM ('VERIFIED', 'LOW_ACCURACY', 'SIMULATED');

-- CreateEnum
CREATE TYPE "MakingChargeType" AS ENUM ('PER_GRAM', 'PERCENT');

-- CreateEnum
CREATE TYPE "CustodianType" AS ENUM ('VAULT', 'AGENT', 'SHOP', 'SOLD', 'LOST');

-- CreateEnum
CREATE TYPE "CustodyReason" AS ENUM ('INTAKE', 'ISSUE_TO_AGENT', 'MEMO_HANDOVER', 'MEMO_RETURN', 'RETURN_TO_VAULT', 'CONVERTED_TO_SALE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MemoStatus" AS ENUM ('ACTIVE', 'PARTIALLY_RETURNED', 'RETURNED', 'CONVERTED_TO_ORDER');

-- CreateEnum
CREATE TYPE "MemoItemStatus" AS ENUM ('OUT', 'RETURNED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "AckStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "demoMode" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "homeArea" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerName" TEXT,
    "phone" TEXT,
    "address" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "geofenceRadiusM" INTEGER NOT NULL DEFAULT 100,
    "creditLimitPaise" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "plannedDate" DATE NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "status" "VisitStatus" NOT NULL DEFAULT 'PLANNED',
    "assignedById" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkInAccuracyM" DOUBLE PRECISION,
    "checkInDistanceM" DOUBLE PRECISION,
    "verification" "GeoVerification",
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedLat" DOUBLE PRECISION,
    "completedLng" DOUBLE PRECISION,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitProof" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "captureLat" DOUBLE PRECISION,
    "captureLng" DOUBLE PRECISION,
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "distanceM" DOUBLE PRECISION,

    CONSTRAINT "VisitProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purity" "Purity" NOT NULL,
    "ratePaisePerGram" BIGINT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoldRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JewelryDesign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "purity" "Purity" NOT NULL,
    "grossWeightMg" INTEGER NOT NULL,
    "netWeightMg" INTEGER NOT NULL,
    "makingChargeType" "MakingChargeType" NOT NULL DEFAULT 'PER_GRAM',
    "makingChargeValue" BIGINT NOT NULL,
    "stoneValuePaise" BIGINT NOT NULL DEFAULT 0,
    "otherComponents" JSONB NOT NULL DEFAULT '[]',
    "imageUrls" TEXT[],
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JewelryDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SamplePiece" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "tagCode" TEXT NOT NULL,
    "grossWeightMg" INTEGER NOT NULL,
    "netWeightMg" INTEGER NOT NULL,
    "custodianType" "CustodianType" NOT NULL DEFAULT 'VAULT',
    "custodianAgentId" TEXT,
    "custodianShopId" TEXT,
    "custodySeq" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SamplePiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "fromType" "CustodianType",
    "fromAgentId" TEXT,
    "fromShopId" TEXT,
    "toType" "CustodianType" NOT NULL,
    "toAgentId" TEXT,
    "toShopId" TEXT,
    "reason" "CustodyReason" NOT NULL,
    "memoId" TEXT,
    "visitId" TEXT,
    "actorId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "visitId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'SUBMITTED',
    "clientOpId" TEXT NOT NULL,
    "subtotalPaise" BIGINT NOT NULL,
    "gstPaise" BIGINT NOT NULL,
    "totalPaise" BIGINT NOT NULL,
    "goldRateSnapshot" JSONB NOT NULL,
    "notes" TEXT,
    "sourceMemoId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "pieceId" TEXT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purity" "Purity" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "netWeightMg" INTEGER NOT NULL,
    "goldRateId" TEXT NOT NULL,
    "ratePaisePerGram" BIGINT NOT NULL,
    "goldValuePaise" BIGINT NOT NULL,
    "makingPaise" BIGINT NOT NULL,
    "stonePaise" BIGINT NOT NULL,
    "otherPaise" BIGINT NOT NULL DEFAULT 0,
    "unitPricePaise" BIGINT NOT NULL,
    "lineTotalPaise" BIGINT NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "visitId" TEXT,
    "status" "MemoStatus" NOT NULL DEFAULT 'ACTIVE',
    "clientOpId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "notes" TEXT,
    "totalValuePaise" BIGINT NOT NULL,
    "ackStatus" "AckStatus" NOT NULL DEFAULT 'PENDING',
    "ackTokenHash" TEXT,
    "ackCodeHash" TEXT,
    "ackAttempts" INTEGER NOT NULL DEFAULT 0,
    "ackAt" TIMESTAMP(3),
    "ackMethod" TEXT,
    "ackTokenExpiresAt" TIMESTAMP(3),
    "overdueNotifiedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Memo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memoId" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "valuePaise" BIGINT NOT NULL,
    "status" "MemoItemStatus" NOT NULL DEFAULT 'OUT',
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoExtension" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memoId" TEXT NOT NULL,
    "fromDueDate" DATE NOT NULL,
    "toDueDate" DATE NOT NULL,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "secretEncrypted" TEXT NOT NULL,
    "secretLast4" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "actorId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fannedOutAt" TIMESTAMP(3),
    "targetEndpointId" TEXT,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "lastLatencyMs" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "statusCode" INTEGER,
    "latencyMs" INTEGER,
    "error" TEXT,
    "responseBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivedWebhook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "endpointId" TEXT,
    "endpointToken" TEXT NOT NULL,
    "deliveryId" TEXT,
    "headers" JSONB,
    "eventId" TEXT,
    "eventType" TEXT,
    "signatureOk" BOOLEAN NOT NULL,
    "body" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceivedWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("tenantId","key")
);

-- CreateTable
CREATE TABLE "DocSequence" (
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DocSequence_pkey" PRIMARY KEY ("tenantId","kind","year")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "User_tenantId_role_idx" ON "User"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "Shop_tenantId_city_idx" ON "Shop"("tenantId", "city");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_tenantId_code_key" ON "Shop"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Visit_tenantId_plannedDate_idx" ON "Visit"("tenantId", "plannedDate");

-- CreateIndex
CREATE INDEX "Visit_tenantId_agentId_plannedDate_idx" ON "Visit"("tenantId", "agentId", "plannedDate");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_tenantId_agentId_shopId_plannedDate_key" ON "Visit"("tenantId", "agentId", "shopId", "plannedDate");

-- CreateIndex
CREATE INDEX "VisitProof_tenantId_uploadedAt_idx" ON "VisitProof"("tenantId", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VisitProof_visitId_checksumSha256_key" ON "VisitProof"("visitId", "checksumSha256");

-- CreateIndex
CREATE INDEX "GoldRate_tenantId_purity_effectiveFrom_idx" ON "GoldRate"("tenantId", "purity", "effectiveFrom");

-- CreateIndex
CREATE INDEX "JewelryDesign_tenantId_category_idx" ON "JewelryDesign"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "JewelryDesign_tenantId_sku_key" ON "JewelryDesign"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "SamplePiece_tenantId_custodianType_idx" ON "SamplePiece"("tenantId", "custodianType");

-- CreateIndex
CREATE INDEX "SamplePiece_tenantId_custodianAgentId_idx" ON "SamplePiece"("tenantId", "custodianAgentId");

-- CreateIndex
CREATE INDEX "SamplePiece_tenantId_custodianShopId_idx" ON "SamplePiece"("tenantId", "custodianShopId");

-- CreateIndex
CREATE UNIQUE INDEX "SamplePiece_tenantId_tagCode_key" ON "SamplePiece"("tenantId", "tagCode");

-- CreateIndex
CREATE INDEX "CustodyEvent_tenantId_occurredAt_idx" ON "CustodyEvent"("tenantId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustodyEvent_pieceId_seq_key" ON "CustodyEvent"("pieceId", "seq");

-- CreateIndex
CREATE INDEX "Order_tenantId_status_createdAt_idx" ON "Order"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_clientOpId_key" ON "Order"("tenantId", "clientOpId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_number_key" ON "Order"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Memo_ackTokenHash_key" ON "Memo"("ackTokenHash");

-- CreateIndex
CREATE INDEX "Memo_tenantId_status_dueDate_idx" ON "Memo"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Memo_tenantId_clientOpId_key" ON "Memo"("tenantId", "clientOpId");

-- CreateIndex
CREATE UNIQUE INDEX "Memo_tenantId_number_key" ON "Memo"("tenantId", "number");

-- CreateIndex
CREATE INDEX "OutboxEvent_tenantId_createdAt_idx" ON "OutboxEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_fannedOutAt_idx" ON "OutboxEvent"("fannedOutAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_tenantId_aggregateType_aggregateId_idx" ON "OutboxEvent"("tenantId", "aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_tenantId_createdAt_idx" ON "WebhookDelivery"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_endpointId_eventId_key" ON "WebhookDelivery"("endpointId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_tenantId_objectKey_key" ON "StoredFile"("tenantId", "objectKey");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "AuditLog"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitProof" ADD CONSTRAINT "VisitProof_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitNote" ADD CONSTRAINT "VisitNote_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldRate" ADD CONSTRAINT "GoldRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JewelryDesign" ADD CONSTRAINT "JewelryDesign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamplePiece" ADD CONSTRAINT "SamplePiece_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamplePiece" ADD CONSTRAINT "SamplePiece_designId_fkey" FOREIGN KEY ("designId") REFERENCES "JewelryDesign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamplePiece" ADD CONSTRAINT "SamplePiece_custodianAgentId_fkey" FOREIGN KEY ("custodianAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamplePiece" ADD CONSTRAINT "SamplePiece_custodianShopId_fkey" FOREIGN KEY ("custodianShopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "SamplePiece"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_designId_fkey" FOREIGN KEY ("designId") REFERENCES "JewelryDesign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoItem" ADD CONSTRAINT "MemoItem_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "Memo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoItem" ADD CONSTRAINT "MemoItem_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "SamplePiece"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoExtension" ADD CONSTRAINT "MemoExtension_memoId_fkey" FOREIGN KEY ("memoId") REFERENCES "Memo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookAttempt" ADD CONSTRAINT "WebhookAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "WebhookDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- Hand-written invariants (Prisma cannot express these). Applied by
-- `prisma migrate deploy` together with the generated DDL above.
-- =====================================================================

-- An agent can have at most ONE open (CHECKED_IN / ACTIVE) visit at a time.
CREATE UNIQUE INDEX "Visit_one_open_per_agent" ON "Visit" ("tenantId", "agentId")
  WHERE "status" IN ('CHECKED_IN', 'ACTIVE');

-- Every physical sample has exactly one custodian: the right FK column for the
-- custodian type is set and the others are NULL.
ALTER TABLE "SamplePiece" ADD CONSTRAINT "SamplePiece_custodian_consistent" CHECK (
  (("custodianType" = 'AGENT') = ("custodianAgentId" IS NOT NULL)) AND
  (("custodianType" = 'SHOP')  = ("custodianShopId"  IS NOT NULL))
);
ALTER TABLE "SamplePiece" ADD CONSTRAINT "SamplePiece_weights" CHECK ("netWeightMg" > 0 AND "grossWeightMg" >= "netWeightMg" AND "custodySeq" >= 1);

-- A piece can be OUT on at most one memo.
CREATE UNIQUE INDEX "MemoItem_one_out_per_piece" ON "MemoItem" ("pieceId") WHERE "status" = 'OUT';

-- Value sanity.
ALTER TABLE "GoldRate" ADD CONSTRAINT "GoldRate_positive" CHECK ("ratePaisePerGram" > 0);
ALTER TABLE "JewelryDesign" ADD CONSTRAINT "JewelryDesign_weights" CHECK ("netWeightMg" > 0 AND "grossWeightMg" >= "netWeightMg" AND "makingChargeValue" >= 0 AND "stoneValuePaise" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "Order_totals" CHECK ("subtotalPaise" >= 0 AND "gstPaise" >= 0 AND "totalPaise" = "subtotalPaise" + "gstPaise");
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_values" CHECK ("quantity" > 0 AND "unitPricePaise" >= 0 AND "lineTotalPaise" = "unitPricePaise" * "quantity");
ALTER TABLE "MemoItem" ADD CONSTRAINT "MemoItem_value" CHECK ("valuePaise" >= 0);
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_geo" CHECK ("geofenceRadiusM" > 0 AND "lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180);
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_seq" CHECK ("seq" >= 1);
ALTER TABLE "Memo" ADD CONSTRAINT "Memo_ack_attempts" CHECK ("ackAttempts" >= 0);

-- Append-only ledgers: gold rates, custody events and order-line price snapshots
-- can never be changed or removed. The only escape hatch is an explicit
-- transaction-local purge flag used by the demo seed to wipe a whole tenant:
--   SELECT set_config('jewelroute.allow_purge', 'on', true);
CREATE OR REPLACE FUNCTION jr_forbid_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND coalesce(current_setting('jewelroute.allow_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only (% blocked)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GoldRate_append_only" BEFORE UPDATE OR DELETE ON "GoldRate" FOR EACH ROW EXECUTE FUNCTION jr_forbid_mutation();
CREATE TRIGGER "CustodyEvent_append_only" BEFORE UPDATE OR DELETE ON "CustodyEvent" FOR EACH ROW EXECUTE FUNCTION jr_forbid_mutation();
CREATE TRIGGER "OrderItem_append_only" BEFORE UPDATE OR DELETE ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION jr_forbid_mutation();
