export interface RecoveryStrategy {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RECOVERY: RecoveryStrategy = {
  maxRetries: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  strategy: RecoveryStrategy = DEFAULT_RECOVERY
): Promise<T> {
  let lastError: Error | null = null;
  let delay = strategy.backoffMs;

  for (let attempt = 0; attempt < strategy.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < strategy.maxRetries - 1) {
        await new Promise(r => setTimeout(r, delay));
        delay *= strategy.backoffMultiplier;
      }
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

export async function executeWithCircuitBreaker<T>(
  fn: () => Promise<T>,
  threshold: number = 5,
  timeout: number = 60000
): Promise<T> {
  let failureCount = 0;
  const start = Date.now();

  const execute = async (): Promise<T> => {
    if (failureCount >= threshold) {
      if (Date.now() - start > timeout) {
        failureCount = 0;
        return execute();
      }
      throw new Error("Circuit breaker open");
    }

    try {
      const result = await fn();
      failureCount = 0;
      return result;
    } catch (err) {
      failureCount++;
      throw err;
    }
  };

  return execute();
}
