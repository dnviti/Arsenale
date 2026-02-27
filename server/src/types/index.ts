import { Request } from 'express';

export interface AuthPayload {
  userId: string;
  email: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export interface EncryptedField {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface VaultSession {
  masterKey: Buffer;
  expiresAt: number;
}

export interface SftpEntry {
  name: string;
  size: number;
  type: 'file' | 'directory' | 'symlink';
  modifiedAt: string;
}

export interface RdpSettings {
  colorDepth?: 8 | 16 | 24;
  width?: number;
  height?: number;
  dpi?: number;
  resizeMethod?: 'display-update' | 'reconnect';
  qualityPreset?: 'performance' | 'balanced' | 'quality' | 'custom';
  enableWallpaper?: boolean;
  enableTheming?: boolean;
  enableFontSmoothing?: boolean;
  enableFullWindowDrag?: boolean;
  enableDesktopComposition?: boolean;
  enableMenuAnimations?: boolean;
  forceLossless?: boolean;
  disableAudio?: boolean;
  enableAudioInput?: boolean;
  security?: 'any' | 'nla' | 'nla-ext' | 'tls' | 'rdp';
  ignoreCert?: boolean;
  serverLayout?: string;
  console?: boolean;
  timezone?: string;
}
