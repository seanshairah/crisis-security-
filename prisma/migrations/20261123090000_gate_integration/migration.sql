-- Gate integration hardening. Additive only: existing rows keep working unchanged.
ALTER TYPE "GateStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "GateMovement" ADD COLUMN "capturedAt" TIMESTAMP(3),
ADD COLUMN "receivedAt" TIMESTAMP(3);
CREATE INDEX "GateMovement_correctionOf_idx" ON "GateMovement"("correctionOf");

CREATE INDEX "GateHistory_actor_action_idx" ON "GateHistory"("actor", "action");

ALTER TABLE "GateDelivery" ADD COLUMN "deadAt" TIMESTAMP(3);
CREATE INDEX "GateDelivery_deadAt_idx" ON "GateDelivery"("deadAt");

ALTER TABLE "GateDeliveryAttempt" ADD COLUMN "httpStatus" INTEGER,
ADD COLUMN "durationMs" INTEGER;
CREATE INDEX "GateDeliveryAttempt_deliveryId_createdAt_idx" ON "GateDeliveryAttempt"("deliveryId", "createdAt");
