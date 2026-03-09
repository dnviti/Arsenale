-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('RECORDING', 'COMPLETE', 'ERROR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'RECORDING_START';
ALTER TYPE "AuditAction" ADD VALUE 'RECORDING_VIEW';
ALTER TYPE "AuditAction" ADD VALUE 'RECORDING_DELETE';

-- CreateTable
CREATE TABLE "SessionRecording" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "protocol" "SessionProtocol" NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "duration" INTEGER,
    "format" TEXT NOT NULL DEFAULT 'asciicast',
    "status" "RecordingStatus" NOT NULL DEFAULT 'RECORDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SessionRecording_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionRecording_userId_createdAt_idx" ON "SessionRecording"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SessionRecording_sessionId_idx" ON "SessionRecording"("sessionId");

-- CreateIndex
CREATE INDEX "SessionRecording_connectionId_idx" ON "SessionRecording"("connectionId");

-- AddForeignKey
ALTER TABLE "SessionRecording" ADD CONSTRAINT "SessionRecording_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRecording" ADD CONSTRAINT "SessionRecording_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
