-- CreateEnum
CREATE TYPE "KeystrokePolicyAction" AS ENUM ('BLOCK_AND_TERMINATE', 'ALERT_ONLY');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SESSION_TERMINATED_POLICY_VIOLATION';
ALTER TYPE "AuditAction" ADD VALUE 'KEYSTROKE_POLICY_ALERT';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'KEYSTROKE_POLICY_VIOLATION';

-- CreateTable
CREATE TABLE "KeystrokePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "action" "KeystrokePolicyAction" NOT NULL DEFAULT 'ALERT_ONLY',
    "regexPatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeystrokePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KeystrokePolicy_tenantId_enabled_idx" ON "KeystrokePolicy"("tenantId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "KeystrokePolicy_tenantId_name_key" ON "KeystrokePolicy"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "KeystrokePolicy" ADD CONSTRAINT "KeystrokePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
