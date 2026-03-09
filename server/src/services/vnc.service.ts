import crypto from 'crypto';
import { config } from '../config';
import type { VncSettings } from '../types';

export interface VncRecordingParams {
  recordingPath: string;
  recordingName: string;
}

export interface VncConnectionParams {
  host: string;
  port: number;
  password: string;
  vncSettings?: Partial<VncSettings>;
  guacdHost?: string;
  guacdPort?: number;
  recording?: VncRecordingParams;
  metadata?: {
    userId: string;
    connectionId: string;
    ipAddress?: string;
    recordingId?: string;
  };
}

function getGuacamoleKey(): Buffer {
  return crypto.createHash('sha256').update(config.guacamoleSecret).digest();
}

/** Merge system defaults with connection overrides */
export function mergeVncSettings(
  connectionOverrides?: Partial<VncSettings> | null,
): VncSettings {
  const systemDefaults: Required<Omit<VncSettings, 'colorDepth'>> = {
    cursor: 'local',
    readOnly: false,
    clipboardEncoding: 'UTF-8',
    swapRedBlue: false,
    disableAudio: true,
  };

  const merged: VncSettings = { ...systemDefaults };

  if (connectionOverrides) {
    for (const [k, v] of Object.entries(connectionOverrides)) {
      if (v !== undefined) (merged as Record<string, unknown>)[k] = v;
    }
  }

  return merged;
}

/**
 * Generate an encrypted token for guacamole-lite with VNC protocol.
 * Same encryption format as RDP — guacamole-lite handles both.
 */
export function generateVncGuacamoleToken(params: VncConnectionParams): string {
  const vnc = params.vncSettings ?? {};

  const settings: Record<string, string> = {
    hostname: params.host,
    port: String(params.port),
    password: params.password,
    cursor: vnc.cursor ?? 'local',
    'clipboard-encoding': vnc.clipboardEncoding ?? 'UTF-8',
  };

  if (vnc.colorDepth) settings['color-depth'] = String(vnc.colorDepth);
  if (vnc.readOnly) settings['read-only'] = 'true';
  if (vnc.swapRedBlue) settings['swap-red-blue'] = 'true';
  if (vnc.disableAudio === false) settings['enable-audio'] = 'true';

  if (params.recording) {
    settings['recording-path'] = params.recording.recordingPath;
    settings['recording-name'] = params.recording.recordingName;
    settings['create-recording-path'] = 'true';
  }

  const connectionConfig = {
    connection: {
      type: 'vnc',
      ...(params.guacdHost && { guacdHost: params.guacdHost }),
      ...(params.guacdPort && { guacdPort: params.guacdPort }),
      settings,
    },
    ...(params.metadata && { metadata: params.metadata }),
  };

  // guacamole-lite's Crypt.decrypt() outputs with 'ascii' encoding,
  // which corrupts any byte > 127. Escape non-ASCII chars to \uXXXX.
  const data = JSON.stringify(connectionConfig).replace(
    /[\u0080-\uffff]/g,
    (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'),
  );
  const iv = crypto.randomBytes(16);
  const key = getGuacamoleKey();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  let encrypted = cipher.update(data, 'utf8', 'binary');
  encrypted += cipher.final('binary');

  const tokenObj = {
    iv: iv.toString('base64'),
    value: Buffer.from(encrypted, 'binary').toString('base64'),
  };

  const b64 = Buffer.from(JSON.stringify(tokenObj)).toString('base64');
  return b64.endsWith('=') ? b64 : b64 + '=';
}
