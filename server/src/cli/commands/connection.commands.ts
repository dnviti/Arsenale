import { Command } from 'commander';
import * as connectionService from '../../services/connection.service';
import { resolveTenant } from '../helpers/resolve';
import { printJson, printError, printSuccess } from '../helpers/output';
import { unlockUserVault } from '../helpers/vault';
import { ConnectionType } from '../../generated/prisma/client';

export function registerConnectionCommands(program: Command): void {
  const connection = program
    .command('connection')
    .description('Connection management commands');

  connection
    .command('create')
    .description('Create a new connection in a tenant')
    .requiredOption('--tenant-id <id>', 'Tenant ID or slug')
    .requiredOption('--user-email <email>', 'User email performing the action')
    .requiredOption('--password <password>', 'User password to unlock vault')
    .requiredOption('--name <name>', 'Name of the connection')
    .requiredOption('--type <type>', 'Connection type (RDP|SSH|VNC|KUBERNETES)')
    .requiredOption('--host <host>', 'Connection hostname or IP')
    .requiredOption('--port <port>', 'Connection port')
    .requiredOption('--secret-id <id>', 'Credential secret ID to link')
    .option('--description <desc>', 'Connection description')
    .option('--format <format>', 'Output format (json|table)', 'table')
    .action(async (opts: { tenantId: string; userEmail: string; password?: string; name: string; type: string; host: string; port: string; secretId: string; description?: string; format: string }) => {
      const tenant = await resolveTenant(opts.tenantId);
      if (!tenant) { printError(`Tenant not found: ${opts.tenantId}`); process.exitCode = 1; return; }

      const user = await unlockUserVault(opts.userEmail, opts.password);
      if (!user) { process.exitCode = 1; return; }

      try {
        const result = await connectionService.createConnection(
          user.id,
          {
            name: opts.name,
            type: opts.type as ConnectionType,
            host: opts.host,
            port: parseInt(opts.port, 10),
            credentialSecretId: opts.secretId,
            description: opts.description,
          },
          tenant.id
        );

        if (opts.format === 'json') {
          printJson(result);
        } else {
          printSuccess(`Connection created: ${result.name} (${result.id})`);
        }
      } catch (err) {
        printError(`Failed to create connection: ${err instanceof Error ? err.message : err}`);
        process.exitCode = 1;
      }
    });
}
