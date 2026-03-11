import { useState, useCallback } from 'react';
import { extractApiError } from '../utils/apiError';

interface UseAsyncActionReturn {
  loading: boolean;
  error: string;
  setError: (error: string) => void;
  clearError: () => void;
  run: (action: () => Promise<void>, fallbackError?: string) => Promise<boolean>;
}

export function useAsyncAction(): UseAsyncActionReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const clearError = useCallback(() => setError(''), []);

  const run = useCallback(
    async (action: () => Promise<void>, fallbackError = 'An error occurred'): Promise<boolean> => {
      setError('');
      setLoading(true);
      try {
        await action();
        return true;
      } catch (err: unknown) {
        setError(extractApiError(err, fallbackError));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, error, setError, clearError, run };
}
