-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'TUNNEL_CONNECT';
ALTER TYPE "AuditAction" ADD VALUE 'TUNNEL_DISCONNECT';
ALTER TYPE "AuditAction" ADD VALUE 'TUNNEL_TOKEN_GENERATE';
ALTER TYPE "AuditAction" ADD VALUE 'TUNNEL_TOKEN_REVOKE';

-- AlterTable: Gateway tunnel fields
ALTER TABLE "Gateway" ADD COLUMN "tunnelEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Gateway" ADD COLUMN "encryptedTunnelToken" TEXT;
ALTER TABLE "Gateway" ADD COLUMN "tunnelTokenIV" TEXT;
ALTER TABLE "Gateway" ADD COLUMN "tunnelTokenTag" TEXT;
ALTER TABLE "Gateway" ADD COLUMN "tunnelTokenHash" TEXT;
ALTER TABLE "Gateway" ADD COLUMN "tunnelConnectedAt" TIMESTAMP(3);
ALTER TABLE "Gateway" ADD COLUMN "tunnelLastHeartbeat" TIMESTAMP(3);
ALTER TABLE "Gateway" ADD COLUMN "tunnelClientVersion" TEXT;
ALTER TABLE "Gateway" ADD COLUMN "tunnelClientIp" TEXT;
ALTER TABLE "Gateway" ADD COLUMN "tunnelCaCert" TEXT;
ALTER TABLE "Gateway" ADD COLUMN "encryptedCaKey" TEXT;
ALTER TABLE "Gateway" ADD COLUMN "caKeyIV" TEXT;
ALTER TABLE "Gateway" ADD COLUMN "caKeyTag" TEXT;
ALTER TABLE "Gateway" ADD COLUMN "tunnelClientCert" TEXT;
ALTER TABLE "Gateway" ADD COLUMN "tunnelClientCertExp" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Gateway_tunnelTokenHash_key" ON "Gateway"("tunnelTokenHash");

-- AlterTable: ManagedGatewayInstance tunnel proxy fields
ALTER TABLE "ManagedGatewayInstance" ADD COLUMN "tunnelProxyHost" TEXT;
ALTER TABLE "ManagedGatewayInstance" ADD COLUMN "tunnelProxyPort" INTEGER;
