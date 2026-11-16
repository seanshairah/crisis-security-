-- AlterTable
ALTER TABLE "PatrolCheckpoint" ADD COLUMN     "qrPayload" TEXT,
ADD COLUMN     "qrVersion" INTEGER NOT NULL DEFAULT 1;

