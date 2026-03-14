import prisma, { KeystrokePolicyAction } from '../lib/prisma';
import { logger } from '../utils/logger';

export interface ResolvedKeystrokePolicy {
  id: string;
  name: string;
  action: KeystrokePolicyAction;
  compiledPatterns: { regex: RegExp; source: string }[];
}

export interface KeystrokeViolation {
  policyId: string;
  policyName: string;
  action: KeystrokePolicyAction;
  matchedPattern: string;
  matchedInput: string;
}

/**
 * Load all enabled keystroke policies for a tenant.
 * Results are compiled once per session start and cached in-memory.
 */
export async function loadPolicies(tenantId: string): Promise<ResolvedKeystrokePolicy[]> {
  const rows = await prisma.keystrokePolicy.findMany({
    where: { tenantId, enabled: true },
    select: { id: true, name: true, action: true, regexPatterns: true },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    action: row.action,
    compiledPatterns: row.regexPatterns
      .map((src) => {
        try {
          return { regex: new RegExp(src, 'i'), source: src };
        } catch {
          logger.warn(`Invalid regex in keystroke policy ${row.id}: ${src}`);
          return null;
        }
      })
      .filter((p): p is { regex: RegExp; source: string } => p !== null),
  }));
}

/**
 * Lightweight input line reconstructor.
 *
 * Terminal data arrives as raw bytes including control characters.
 * This class maintains a logical input buffer, handling:
 *   - Backspace (0x7F, 0x08): delete last character
 *   - Carriage return / line feed (0x0D, 0x0A): flush line
 *   - Printable ASCII and UTF-8
 *   - Ignores other control sequences (ESC[..., etc.)
 *
 * When a line is flushed (enter pressed), `onLine` is called and the
 * buffer is reset.
 */
export class InputLineBuffer {
  private buf = '';
  private inEscape = false;

  /**
   * Feed raw terminal input into the buffer.
   * Returns completed lines (if any).
   */
  feed(data: string): string[] {
    const lines: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      const code = data.charCodeAt(i);

      // Handle ESC sequences: ESC[ ... <letter>
      if (code === 0x1b) {
        this.inEscape = true;
        continue;
      }
      if (this.inEscape) {
        // CSI sequences end with a letter (0x40-0x7E)
        if (code >= 0x40 && code <= 0x7e) {
          this.inEscape = false;
        }
        continue;
      }

      // Backspace / DEL
      if (code === 0x7f || code === 0x08) {
        this.buf = this.buf.slice(0, -1);
        continue;
      }

      // Enter: flush the line
      if (code === 0x0d || code === 0x0a) {
        if (this.buf.length > 0) {
          lines.push(this.buf);
          this.buf = '';
        }
        continue;
      }

      // Skip other control characters
      if (code < 0x20 && code !== 0x09) {
        continue;
      }

      this.buf += ch;
    }

    return lines;
  }

  /** Return the current partial (uncommitted) buffer for mid-typing inspection. */
  peek(): string {
    return this.buf;
  }

  reset(): void {
    this.buf = '';
    this.inEscape = false;
  }
}

/**
 * Inspect a completed command line against all loaded policies.
 * Returns the first violation found, or null if clean.
 */
export function inspectLine(
  line: string,
  policies: ResolvedKeystrokePolicy[],
): KeystrokeViolation | null {
  for (const policy of policies) {
    for (const pattern of policy.compiledPatterns) {
      if (pattern.regex.test(line)) {
        return {
          policyId: policy.id,
          policyName: policy.name,
          action: policy.action,
          matchedPattern: pattern.source,
          matchedInput: line.length > 200 ? line.slice(0, 200) + '…' : line,
        };
      }
    }
  }
  return null;
}
