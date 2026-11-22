-- CreateEnum
CREATE TYPE "GateStatus" AS ENUM ('PENDING', 'REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GateSyncStatus" AS ENUM ('NOT_QUEUED', 'PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "GatePolicy" (
    "locationId" TEXT NOT NULL,
    "guardCanApprove" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GatePolicy_pkey" PRIMARY KEY ("locationId")
);

-- CreateTable
CREATE TABLE "GateMovement" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "expected" JSONB,
    "observed" JSONB,
    "checkpointId" TEXT,
    "sessionId" TEXT,
    "guardId" TEXT,
    "shiftId" TEXT,
    "status" "GateStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "decisionBy" TEXT,
    "decisionAt" TIMESTAMP(3),
    "reason" TEXT,
    "correctionOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GateMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateHistory" (
    "id" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateDelivery" (
    "id" TEXT NOT NULL,
    "movementId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "GateSyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GateDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GateMovement_sourceReference_key" ON "GateMovement"("sourceReference");

-- CreateIndex
CREATE INDEX "GateMovement_locationId_status_createdAt_idx" ON "GateMovement"("locationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "GateHistory_movementId_createdAt_idx" ON "GateHistory"("movementId", "createdAt");

-- CreateIndex
CREATE INDEX "GateDelivery_status_nextAttemptAt_idx" ON "GateDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "GateDelivery_movementId_version_key" ON "GateDelivery"("movementId", "version");

-- AddForeignKey
ALTER TABLE "GatePolicy" ADD CONSTRAINT "GatePolicy_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateMovement" ADD CONSTRAINT "GateMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateHistory" ADD CONSTRAINT "GateHistory_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "GateMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateDelivery" ADD CONSTRAINT "GateDelivery_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "GateMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateDeliveryAttempt" ADD CONSTRAINT "GateDeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "GateDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

