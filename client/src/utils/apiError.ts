export function extractApiError(err: unknown, fallback: string): string {
  const axiosErr = err as {
    response?: { data?: { error?: string; message?: string } };
    message?: string;
  };
  return (
    axiosErr?.response?.data?.error ||
    axiosErr?.response?.data?.message ||
    fallback
  );
}
