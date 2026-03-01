import { config } from '../../config';
import { logger } from '../../utils/logger';
import type { EmailMessage, SendFn } from './types';
import { createSendFn as createSmtpSendFn } from './providers/smtp.provider';
import { createSendFn as createSendgridSendFn } from './providers/sendgrid.provider';
import { createSendFn as createSesSendFn } from './providers/ses.provider';
import { createSendFn as createResendSendFn } from './providers/resend.provider';
import { createSendFn as createMailgunSendFn } from './providers/mailgun.provider';

export type { EmailMessage } from './types';

let cachedSendFn: SendFn | null | undefined;

function getSendFn(): SendFn | null {
  if (cachedSendFn !== undefined) return cachedSendFn;

  switch (config.emailProvider) {
    case 'sendgrid':
      cachedSendFn = createSendgridSendFn();
      break;
    case 'ses':
      cachedSendFn = createSesSendFn();
      break;
    case 'resend':
      cachedSendFn = createResendSendFn();
      break;
    case 'mailgun':
      cachedSendFn = createMailgunSendFn();
      break;
    case 'smtp':
    default:
      cachedSendFn = createSmtpSendFn();
      break;
  }

  return cachedSendFn;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const send = getSendFn();
  if (!send) {
    logger.info('========================================');
    logger.info('EMAIL (dev mode — no provider configured):');
    logger.info(`  To: ${msg.to}`);
    logger.info(`  Subject: ${msg.subject}`);
    logger.info('========================================');
    return;
  }
  await send(msg);
}

export async function sendVerificationEmail(
  to: string,
  token: string,
): Promise<void> {
  const verifyUrl = `${config.clientUrl}/api/auth/verify-email?token=${token}`;

  const send = getSendFn();
  if (!send) {
    logger.info('========================================');
    logger.info('EMAIL VERIFICATION LINK (dev mode):');
    logger.info(verifyUrl);
    logger.info('========================================');
    return;
  }

  await send({
    to,
    subject: 'Verify your email — Remote Desktop Manager',
    html: `
      <h2>Email Verification</h2>
      <p>Click the link below to verify your email address:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>This link expires in 24 hours.</p>
      <p>If you did not create an account, you can ignore this email.</p>
    `,
    text: `Verify your email: ${verifyUrl}\n\nThis link expires in 24 hours. If you did not create an account, ignore this email.`,
  });
}

export function getEmailStatus(): {
  provider: string;
  configured: boolean;
  from: string;
} {
  const send = getSendFn();
  return {
    provider: config.emailProvider,
    configured: send !== null,
    from: config.smtpFrom,
  };
}
