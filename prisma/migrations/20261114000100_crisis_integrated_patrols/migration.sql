-- CreateEnum
CREATE TYPE "PatrolAssignmentStatus" AS ENUM ('PENDING', 'MISSED', 'COMPLETED');

-- AlterTable
ALTER TABLE "GatewayDevice" ADD COLUMN     "sharedCompanyDevice" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PatrolPolicy" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "minIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "maxIntervalMinutes" INTEGER NOT NULL DEFAULT 40,
    "responseMinutes" INTEGER NOT NULL DEFAULT 10,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatrolPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolCheckpoint" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qrHash" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusM" INTEGER NOT NULL DEFAULT 50,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "minimumVisits" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatrolCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolCredential" (
    "guardId" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PatrolCredential_pkey" PRIMARY KEY ("guardId")
);

-- CreateTable
CREATE TABLE "PatrolDeviceLock" (
    "deviceId" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),

    CONSTRAINT "PatrolDeviceLock_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "PatrolSession" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "policyVersion" INTEGER NOT NULL,

    CONSTRAINT "PatrolSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolAssignment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "PatrolAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "alertedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PatrolAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolEvent" (
    "eventId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "distanceM" DOUBLE PRECISION,
    "delayed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PatrolEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatrolPolicy_locationId_key" ON "PatrolPolicy"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "PatrolCheckpoint_qrHash_key" ON "PatrolCheckpoint"("qrHash");

-- CreateIndex
CREATE INDEX "PatrolCheckpoint_locationId_active_idx" ON "PatrolCheckpoint"("locationId", "active");

-- CreateIndex
CREATE INDEX "PatrolSession_deviceId_endedAt_idx" ON "PatrolSession"("deviceId", "endedAt");

-- CreateIndex
CREATE INDEX "PatrolSession_shiftId_idx" ON "PatrolSession"("shiftId");

-- CreateIndex
CREATE INDEX "PatrolAssignment_status_expiresAt_idx" ON "PatrolAssignment"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "PatrolAssignment_sessionId_dueAt_idx" ON "PatrolAssignment"("sessionId", "dueAt");

-- CreateIndex
CREATE INDEX "PatrolEvent_sessionId_capturedAt_idx" ON "PatrolEvent"("sessionId", "capturedAt");

-- AddForeignKey
ALTER TABLE "PatrolPolicy" ADD CONSTRAINT "PatrolPolicy_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolCheckpoint" ADD CONSTRAINT "PatrolCheckpoint_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolCredential" ADD CONSTRAINT "PatrolCredential_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "Guard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolDeviceLock" ADD CONSTRAINT "PatrolDeviceLock_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "GatewayDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolSession" ADD CONSTRAINT "PatrolSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "GatewayDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolSession" ADD CONSTRAINT "PatrolSession_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolAssignment" ADD CONSTRAINT "PatrolAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PatrolSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolAssignment" ADD CONSTRAINT "PatrolAssignment_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "PatrolCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolEvent" ADD CONSTRAINT "PatrolEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PatrolSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolEvent" ADD CONSTRAINT "PatrolEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatrolAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX "PatrolSession_one_open_device" ON "PatrolSession"("deviceId") WHERE "endedAt" IS NULL;
ALTER TABLE "PatrolPolicy" ADD CONSTRAINT "PatrolPolicy_valid_intervals" CHECK ("minIntervalMinutes" >= 1 AND "maxIntervalMinutes" BETWEEN "minIntervalMinutes" AND 240 AND "responseMinutes" BETWEEN 1 AND 60);
ALTER TABLE "PatrolCheckpoint" ADD CONSTRAINT "PatrolCheckpoint_valid_coordinates" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180 AND "radiusM" BETWEEN 10 AND 500);
ALTER TABLE "PatrolAssignment" ADD CONSTRAINT "PatrolAssignment_valid_window" CHECK ("expiresAt" > "dueAt");
