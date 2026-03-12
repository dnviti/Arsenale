import { useState } from 'react';

/**
 * Returns true once `trigger` has been truthy at least once.
 * Used to defer mounting lazy-loaded components until first needed,
 * while keeping them mounted afterwards to preserve exit animations.
 */
export function useLazyMount(trigger: unknown): boolean {
  const [mounted, setMounted] = useState(() => Boolean(trigger));
  if (trigger && !mounted) {
    setMounted(true);
  }
  return mounted || Boolean(trigger);
}
