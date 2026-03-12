-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'TENANT_MEMBERSHIP_EXPIRED';
ALTER TYPE "AuditAction" ADD VALUE 'TEAM_MEMBERSHIP_EXPIRED';
ALTER TYPE "AuditAction" ADD VALUE 'TENANT_MEMBERSHIP_EXPIRY_UPDATE';
ALTER TYPE "AuditAction" ADD VALUE 'TEAM_MEMBERSHIP_EXPIRY_UPDATE';

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TenantMember" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TeamMember_expiresAt_idx" ON "TeamMember"("expiresAt");

-- CreateIndex
CREATE INDEX "TenantMember_expiresAt_idx" ON "TenantMember"("expiresAt");
