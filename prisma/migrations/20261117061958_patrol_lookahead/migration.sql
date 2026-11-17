-- CreateEnum
CREATE TYPE "PatrolLookahead" AS ENUM ('DEFAULT', 'OFF', 'AUTO', 'CUSTOM');

-- AlterTable
ALTER TABLE "PatrolPolicy" ADD COLUMN     "lookaheadMinutes" INTEGER,
ADD COLUMN     "lookaheadMode" "PatrolLookahead" NOT NULL DEFAULT 'DEFAULT';
