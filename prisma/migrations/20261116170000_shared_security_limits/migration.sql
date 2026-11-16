CREATE TABLE "SecurityRateBucket" ("key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL, "resetAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "SecurityRateBucket_resetAt_idx" ON "SecurityRateBucket"("resetAt");
ALTER TABLE "PatrolEvent" ADD COLUMN "rawCapturedAt" TIMESTAMP(3), ADD COLUMN "rawGpsCapturedAt" TIMESTAMP(3), ADD COLUMN "clockOffsetMs" DOUBLE PRECISION;
