/**
 * Comprehensive Error Handling System
 * Provides timeout, retry, and circuit breaker patterns for robust API communication
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMaxMs: number;
  retryCondition?: (error: Error) => boolean;
}

export interface TimeoutConfig {
  timeoutMs: number;
  abortController?: AbortController;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  monitoringPeriodMs: number;
  halfOpenMaxCalls: number;
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly service: string,
    public readonly operation: string,
    public readonly code?: string,
    public readonly isRetryable: boolean = true,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class TimeoutError extends ServiceError {
  constructor(service: string, operation: string, timeoutMs: number, originalError?: Error) {
    super(
      `Operation timed out after ${timeoutMs}ms`,
      service,
      operation,
      'TIMEOUT',
      true,
      originalError
    );
    this.name = 'TimeoutError';
  }
}

export class CircuitBreakerError extends ServiceError {
  constructor(service: string, operation: string) {
    super(
      `Circuit breaker is OPEN for ${service}.${operation}`,
      service,
      operation,
      'CIRCUIT_BREAKER_OPEN',
      false
    );
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Universal timeout wrapper for any async operation
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  config: TimeoutConfig,
  service: string = 'unknown',
  operationName: string = 'unknown'
): Promise<T> {
  const { timeoutMs, abortController } = config;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      if (abortController) {
        abortController.abort();
      }
      reject(new TimeoutError(service, operationName, timeoutMs));
    }, timeoutMs);
    
    // Clear timeout if aborted externally
    if (abortController) {
      abortController.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
      });
    }
  });

  try {
    return await Promise.race([operation(), timeoutPromise]);
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw error;
    }
    // Wrap other errors with context
    throw new ServiceError(
      `Operation failed: ${error instanceof Error ? error.message : String(error)}`,
      service,
      operationName,
      'OPERATION_FAILED',
      true,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Enhanced retry logic with exponential backoff and jitter
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  service: string = 'unknown',
  operationName: string = 'unknown'
): Promise<T> {
  const {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    backoffMultiplier,
    jitterMaxMs,
    retryCondition = () => true
  } = config;

  let lastError: Error = new Error('No attempts made');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation();
      
      // Log successful retry if not first attempt
      if (attempt > 1) {
        console.log(`✅ ${service}.${operationName} succeeded on attempt ${attempt}/${maxAttempts}`);
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on final attempt
      if (attempt === maxAttempts) {
        break;
      }
      
      // Check if this error should be retried
      if (!retryCondition(lastError)) {
        console.log(`❌ ${service}.${operationName} failed with non-retryable error: ${lastError.message}`);
        throw lastError;
      }
      
      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(baseDelayMs * Math.pow(backoffMultiplier, attempt - 1), maxDelayMs);
      const jitter = Math.random() * jitterMaxMs;
      const delayMs = baseDelay + jitter;
      
      console.log(`🔄 ${service}.${operationName} failed (attempt ${attempt}/${maxAttempts}), retrying in ${Math.round(delayMs)}ms - Error: ${lastError.message.substring(0, 100)}`);
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw new ServiceError(
    `All ${maxAttempts} retry attempts failed for ${service}.${operationName}`,
    service,
    operationName,
    'MAX_RETRIES_EXCEEDED',
    false,
    lastError
  );
}

/**
 * Circuit Breaker Pattern Implementation
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;
  private halfOpenCallCount = 0;

  constructor(
    private readonly service: string,
    private readonly operation: string,
    private readonly config: CircuitBreakerConfig
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new CircuitBreakerError(this.service, this.operation);
      }
      // Transition to HALF_OPEN
      this.state = CircuitBreakerState.HALF_OPEN;
      this.halfOpenCallCount = 0;
      console.log(`🔄 Circuit breaker ${this.service}.${this.operation} transitioning to HALF_OPEN`);
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.halfOpenCallCount >= this.config.halfOpenMaxCalls) {
        throw new CircuitBreakerError(this.service, this.operation);
      }
      this.halfOpenCallCount++;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
      console.log(`✅ Circuit breaker ${this.service}.${this.operation} reset to CLOSED`);
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.resetTimeoutMs;
      console.log(`⚠️ Circuit breaker ${this.service}.${this.operation} opened (half-open failure)`);
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.resetTimeoutMs;
      console.log(`⚠️ Circuit breaker ${this.service}.${this.operation} opened (threshold exceeded: ${this.failureCount})`);
    }
  }

  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  isOpen(): boolean {
    return this.state === CircuitBreakerState.OPEN && Date.now() < this.nextAttemptTime;
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    console.log(`🔄 Circuit breaker ${this.service}.${this.operation} manually reset`);
  }
}

/**
 * Combined operation wrapper with timeout, retry, and circuit breaker
 */
export async function resilientOperation<T>(
  operation: () => Promise<T>,
  options: {
    service: string;
    operation: string;
    timeout?: TimeoutConfig;
    retry?: RetryConfig;
    circuitBreaker?: CircuitBreaker;
  }
): Promise<T> {
  const { service, operation: operationName, timeout, retry, circuitBreaker } = options;

  let wrappedOperation = operation;

  // Apply timeout wrapper if configured
  if (timeout) {
    const originalOperation = wrappedOperation;
    wrappedOperation = () => withTimeout(originalOperation, timeout, service, operationName);
  }

  // Apply retry wrapper if configured
  if (retry) {
    const originalOperation = wrappedOperation;
    wrappedOperation = () => withRetry(originalOperation, retry, service, operationName);
  }

  // Apply circuit breaker if configured
  if (circuitBreaker) {
    return circuitBreaker.execute(wrappedOperation);
  }

  return wrappedOperation();
}

/**
 * Predefined retry conditions for common scenarios
 */
export const RetryConditions = {
  networkErrors: (error: Error): boolean => {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('econnrefused') ||
      message.includes('etimedout')
    );
  },

  rateLimitErrors: (error: Error): boolean => {
    const message = error.message.toLowerCase();
    return (
      message.includes('429') ||
      message.includes('too many requests') ||
      message.includes('rate limit') ||
      message.includes('quota exceeded')
    );
  },

  serverErrors: (error: Error): boolean => {
    const message = error.message;
    // Retry on 5xx server errors but not 4xx client errors
    return /5\d\d/.test(message);
  },

  transientErrors: (error: Error): boolean => {
    return (
      RetryConditions.networkErrors(error) ||
      RetryConditions.rateLimitErrors(error) ||
      RetryConditions.serverErrors(error)
    );
  }
};

/**
 * Predefined configurations for different service types
 */
export const DefaultConfigs = {
  // OpenAI API calls (typically slower, need longer timeouts)
  openAI: {
    timeout: { timeoutMs: 30000 } as TimeoutConfig,
    retry: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      jitterMaxMs: 1000,
      retryCondition: RetryConditions.transientErrors
    } as RetryConfig,
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeoutMs: 60000,
      monitoringPeriodMs: 300000,
      halfOpenMaxCalls: 2
    } as CircuitBreakerConfig
  },

  // ElevenLabs TTS API (moderate timeout, aggressive retry for rate limits)
  elevenLabs: {
    timeout: { timeoutMs: 15000 } as TimeoutConfig,
    retry: {
      maxAttempts: 4,
      baseDelayMs: 1000,
      maxDelayMs: 8000,
      backoffMultiplier: 2,
      jitterMaxMs: 2000,
      retryCondition: RetryConditions.transientErrors
    } as RetryConfig,
    circuitBreaker: {
      failureThreshold: 3,
      resetTimeoutMs: 30000,
      monitoringPeriodMs: 180000,
      halfOpenMaxCalls: 1
    } as CircuitBreakerConfig
  },

  // Database operations (fast timeout, limited retries)
  database: {
    timeout: { timeoutMs: 10000 } as TimeoutConfig,
    retry: {
      maxAttempts: 2,
      baseDelayMs: 500,
      maxDelayMs: 2000,
      backoffMultiplier: 2,
      jitterMaxMs: 500,
      retryCondition: RetryConditions.networkErrors
    } as RetryConfig,
    circuitBreaker: {
      failureThreshold: 10,
      resetTimeoutMs: 5000,
      monitoringPeriodMs: 60000,
      halfOpenMaxCalls: 3
    } as CircuitBreakerConfig
  },

  // Frontend API calls (fast timeout, minimal retries)
  frontend: {
    timeout: { timeoutMs: 8000 } as TimeoutConfig,
    retry: {
      maxAttempts: 2,
      baseDelayMs: 1000,
      maxDelayMs: 3000,
      backoffMultiplier: 2,
      jitterMaxMs: 500,
      retryCondition: RetryConditions.networkErrors
    } as RetryConfig
  }
};

/**
 * User-friendly error message mapper
 */
export function getUserFriendlyErrorMessage(error: Error, context: 'student' | 'teacher' = 'student'): string {
  if (error instanceof CircuitBreakerError) {
    return context === 'student'
      ? "The system is temporarily unavailable. Please try again in a few minutes."
      : `Service ${error.service} is temporarily unavailable due to repeated failures. Will retry automatically.`;
  }

  if (error instanceof TimeoutError) {
    return context === 'student'
      ? "The request is taking longer than expected. Please check your internet connection and try again."
      : `Operation timed out for ${error.service}.${error.operation}. Check network connectivity.`;
  }

  if (error instanceof ServiceError) {
    if (error.code === 'MAX_RETRIES_EXCEEDED') {
      return context === 'student'
        ? "We're having trouble connecting to our services. Please try again later."
        : `Service ${error.service} failed after multiple retry attempts. Check service health.`;
    }

    if (error.message.includes('rate limit') || error.message.includes('429')) {
      return context === 'student'
        ? "The system is busy right now. Please wait a moment and try again."
        : `Rate limit exceeded for ${error.service}. Retrying with backoff.`;
    }
  }

  // Generic fallback messages
  const message = error.message || 'An unexpected error occurred';
  
  if (context === 'student') {
    return "Something went wrong. Please try again or ask your teacher for help.";
  } else {
    return `Error: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`;
  }
}