-- AlterTable: Add ipUaHash column to RefreshToken for token binding (SEC-111)
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "ipUaHash" TEXT;

-- AlterEnum: Add TOKEN_HIJACK_ATTEMPT to AuditAction (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'TOKEN_HIJACK_ATTEMPT'
                   AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN
        ALTER TYPE "AuditAction" ADD VALUE 'TOKEN_HIJACK_ATTEMPT';
    END IF;
END
$$;
