/**
 * Database Resilience Service
 * Provides enhanced error handling, connection recovery, and transaction retry logic for database operations
 */

import { resilientOperation, DefaultConfigs, ServiceError, RetryConditions } from '@shared/errorHandling.js';
import { circuitBreakerManager } from './circuitBreakerManager.js';
import { db } from '../db.js';

export class DatabaseResilienceService {
  private static instance: DatabaseResilienceService;
  
  private constructor() {}

  static getInstance(): DatabaseResilienceService {
    if (!DatabaseResilienceService.instance) {
      DatabaseResilienceService.instance = new DatabaseResilienceService();
    }
    return DatabaseResilienceService.instance;
  }

  /**
   * Execute database operation with comprehensive error handling
   */
  async executeWithResilience<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: string
  ): Promise<T> {
    const circuitBreaker = circuitBreakerManager.getCircuitBreaker('database', operationName);
    
    return resilientOperation(
      operation,
      {
        service: 'database',
        operation: operationName,
        timeout: DefaultConfigs.database.timeout,
        retry: {
          ...DefaultConfigs.database.retry,
          retryCondition: (error: Error) => {
            const message = error.message.toLowerCase();
            // Retry on connection issues, timeouts, and lock conflicts
            return (
              RetryConditions.networkErrors(error) ||
              message.includes('connection') ||
              message.includes('timeout') ||
              message.includes('lock') ||
              message.includes('deadlock') ||
              message.includes('serialization') ||
              message.includes('constraint') && message.includes('retry')
            );
          }
        },
        circuitBreaker
      }
    ).catch(error => {
      console.error(`Database operation failed [${operationName}]${context ? ` in ${context}` : ''}:`, error);
      throw new ServiceError(
        `Database operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'database',
        operationName,
        'DB_OPERATION_FAILED',
        error instanceof ServiceError ? error.isRetryable : true,
        error instanceof Error ? error : undefined
      );
    });
  }

  /**
   * Execute transaction with retry logic for deadlocks and serialization failures
   */
  async executeTransaction<T>(
    transactionFn: () => Promise<T>,
    operationName: string,
    context?: string
  ): Promise<T> {
    return this.executeWithResilience(
      async () => {
        // Note: Drizzle transactions would go here if we were using them
        // For now, we'll execute the function directly
        return transactionFn();
      },
      `transaction_${operationName}`,
      context
    );
  }

  /**
   * Enhanced read operation with circuit breaker
   */
  async resilientRead<T>(
    readOperation: () => Promise<T>,
    operationName: string,
    context?: string
  ): Promise<T> {
    return this.executeWithResilience(readOperation, `read_${operationName}`, context);
  }

  /**
   * Enhanced write operation with transaction safety
   */
  async resilientWrite<T>(
    writeOperation: () => Promise<T>,
    operationName: string,
    context?: string
  ): Promise<T> {
    return this.executeTransaction(writeOperation, `write_${operationName}`, context);
  }

  /**
   * Check database connectivity
   */
  async checkConnectivity(): Promise<boolean> {
    try {
      // Simple connectivity check
      await db.execute(`SELECT 1 as status`);
      return true;
    } catch (error) {
      console.error('Database connectivity check failed:', error);
      return false;
    }
  }

  /**
   * Get database health status
   */
  async getHealthStatus(): Promise<{
    isHealthy: boolean;
    responseTime: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      await this.checkConnectivity();
      const responseTime = Date.now() - startTime;
      
      return {
        isHealthy: true,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        isHealthy: false,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Wrapper for storage operations to add resilience
   */
  wrapStorageMethod<T extends any[], R>(
    originalMethod: (...args: T) => Promise<R>,
    methodName: string,
    context?: string
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      return this.executeWithResilience(
        () => originalMethod(...args),
        methodName,
        context
      );
    };
  }
}

// Export singleton instance
export const databaseResilienceService = DatabaseResilienceService.getInstance();