import { Command } from 'commander';
import prisma from '../../lib/prisma';
import * as authService from '../../services/auth.service';
import * as tenantService from '../../services/tenant.service';
import * as secretService from '../../services/secret.service';
import * as gatewayService from '../../services/gateway.service';
import * as connectionService from '../../services/connection.service';
import { deriveKeyFromPassword, decryptMasterKey, storeVaultSession, getVaultSession } from '../../services/crypto.service';
import { printSuccess, printError } from '../helpers/output';
import { ConnectionType } from '../../generated/prisma/client';

export function registerDemoCommands(program: Command): void {
  const demo = program.command('demo').description('Demo environment commands');

  demo
    .command('setup')
    .description('Automatically generate a demo user and tenant with default gateways and connections')
    .action(async () => {
      try {
        const email = 'demo@arsenalepam.com';
        const password = 'arsenaledemo';

        // 1. Check if user exists
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          console.log('Creating demo user...');
          const result = await authService.register(email, password);
          user = await prisma.user.findUnique({ where: { id: result.userId } });
          if (!user) {
            throw new Error('Failed to retrieve newly created user');
          }
          
          // Mark email as verified and vault as setup for demo purposes
          await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: true, vaultSetupComplete: true },
          });
          printSuccess(`User created: ${email}`);
        } else {
          console.log(`User already exists: ${email}`);
        }

        // 2. Unlock vault in memory for the demo session
        const session = getVaultSession(user.id);
        if (!session) {
          if (user.vaultSalt && user.encryptedVaultKey && user.vaultKeyIV && user.vaultKeyTag) {
            const derivedKey = await deriveKeyFromPassword(password, user.vaultSalt);
            const masterKey = decryptMasterKey(
              {
                ciphertext: user.encryptedVaultKey,
                iv: user.vaultKeyIV,
                tag: user.vaultKeyTag,
              },
              derivedKey
            );
            storeVaultSession(user.id, masterKey);
          } else {
            throw new Error('User vault is missing encryption data. Cannot unlock vault.');
          }
        }

        // 3. Check if demo tenant exists
        const tenant = await prisma.tenant.findFirst({
          where: { slug: 'demo' },
        });

        let targetTenantId: string;
        if (!tenant) {
          console.log('Creating demo tenant...');
          const newTenant = await tenantService.createTenant(user.id, 'Demo Environment');
          printSuccess(`Tenant created: ${newTenant.name}`);
          targetTenantId = newTenant.id;
        } else {
          console.log(`Tenant already exists: ${tenant.name}`);
          targetTenantId = tenant.id;
          
          // Ensure the user is a member
          const membership = await prisma.tenantMember.findUnique({
            where: { tenantId_userId: { tenantId: targetTenantId, userId: user.id } },
          });

          if (!membership) {
            await tenantService.inviteUser(targetTenantId, email, 'ADMIN');
            printSuccess(`Added user to tenant: ${tenant.name}`);
          }
        }

        // 4. Initialize tenant vault if needed
        const currentTenant = await prisma.tenant.findUnique({ where: { id: targetTenantId } });
        if (currentTenant && !currentTenant.hasTenantVaultKey) {
          await secretService.initTenantVault(targetTenantId, user.id);
          printSuccess('Initialized demo tenant vault');
        }

        // 5. Add default gateways
        console.log('Configuring default gateways...');
        const guacdGateway = await prisma.gateway.findFirst({
          where: { tenantId: targetTenantId, type: 'GUACD' }
        });
        if (!guacdGateway) {
          await gatewayService.createGateway(user.id, targetTenantId, {
            name: 'Default Guacd',
            type: 'GUACD',
            host: 'guacd',
            port: 4822,
            description: 'Default demo Guacd gateway',
            isDefault: true,
          });
          printSuccess('Created default Guacd gateway');
        }

        const sshGateway = await prisma.gateway.findFirst({
          where: { tenantId: targetTenantId, type: 'SSH_BASTION' }
        });
        if (!sshGateway) {
          await gatewayService.createGateway(user.id, targetTenantId, {
            name: 'Default SSH Gateway',
            type: 'SSH_BASTION',
            host: 'ssh-gateway',
            port: 2222,
            description: 'Default demo SSH gateway',
            isDefault: true,
          });
          printSuccess('Created default SSH gateway');
        }

        // 6. Create passwords inside the password manager (TENANT scope)
        console.log('Creating demo secrets in the password manager...');
        const demoLogins = [
          { name: 'Demo RDP Login', username: 'demo', password: 'Dcv5B!5HT66@zjR*5k^h' },
          { name: 'Demo SSH Login', username: 'demo', password: 'Dcv5B!5HT66@zjR*5k^h' },
          { name: 'Demo VNC Login', username: 'demo', password: 'Dcv5B!5HT66@zjR*5k^h' },
        ];

        const createdSecrets: Record<string, string> = {};
        for (const login of demoLogins) {
          const existingSecret = await prisma.vaultSecret.findFirst({
            where: { tenantId: targetTenantId, name: login.name, type: 'LOGIN' }
          });
          
          if (!existingSecret) {
            const secret = await secretService.createSecret(
              user.id,
              {
                name: login.name,
                type: 'LOGIN',
                scope: 'TENANT',
                tenantId: targetTenantId,
                data: {
                  type: 'LOGIN',
                  username: login.username,
                  password: login.password
                }
              },
              targetTenantId
            );
            createdSecrets[login.name] = secret.id;
            printSuccess(`Created secret: ${login.name}`);
          } else {
            createdSecrets[login.name] = existingSecret.id;
          }
        }

        // 7. Add 3 demo connections
        console.log('Creating demo connections...');
        const demoConnections = [
          { name: 'Demo Windows (RDP)', type: ConnectionType.RDP, host: '192.168.81.11', port: 3389, secretName: 'Demo RDP Login' },
          { name: 'Demo Linux (SSH)', type: ConnectionType.SSH, host: '192.168.81.12', port: 22, secretName: 'Demo SSH Login' },
          { name: 'Demo Desktop (VNC)', type: ConnectionType.VNC, host: '192.168.81.13', port: 5900, secretName: 'Demo VNC Login' },
        ];

        for (const conn of demoConnections) {
          const existingConn = await prisma.connection.findFirst({
            where: { userId: user.id, name: conn.name }
          });
          
          if (!existingConn) {
            await connectionService.createConnection(
              user.id,
              {
                name: conn.name,
                type: conn.type,
                host: conn.host,
                port: conn.port,
                credentialSecretId: createdSecrets[conn.secretName],
                description: `Automatically generated demo ${conn.type} connection`,
              },
              targetTenantId
            );
            printSuccess(`Created connection: ${conn.name}`);
          }
        }

        printSuccess('Demo setup complete.');
        process.exit(0);
      } catch (err) {
        printError(`Demo setup failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
