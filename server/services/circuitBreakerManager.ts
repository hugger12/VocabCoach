/**
 * Circuit Breaker Manager for External API Services
 * Manages circuit breakers for OpenAI, ElevenLabs, and other external services
 */

import { CircuitBreaker, DefaultConfigs, CircuitBreakerConfig } from '@shared/errorHandling.js';

export class CircuitBreakerManager {
  private static instance: CircuitBreakerManager;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  private constructor() {}

  static getInstance(): CircuitBreakerManager {
    if (!CircuitBreakerManager.instance) {
      CircuitBreakerManager.instance = new CircuitBreakerManager();
    }
    return CircuitBreakerManager.instance;
  }

  /**
   * Get or create a circuit breaker for a specific service operation
   */
  getCircuitBreaker(service: string, operation: string, config?: CircuitBreakerConfig): CircuitBreaker {
    const key = `${service}.${operation}`;
    
    if (!this.circuitBreakers.has(key)) {
      let circuitBreakerConfig = config;
      
      // Use default configs if not provided
      if (!circuitBreakerConfig) {
        switch (service.toLowerCase()) {
          case 'openai':
            circuitBreakerConfig = DefaultConfigs.openAI.circuitBreaker;
            break;
          case 'elevenlabs':
            circuitBreakerConfig = DefaultConfigs.elevenLabs.circuitBreaker;
            break;
          case 'database':
            circuitBreakerConfig = DefaultConfigs.database.circuitBreaker;
            break;
          default:
            circuitBreakerConfig = DefaultConfigs.openAI.circuitBreaker; // Safe default
        }
      }
      
      this.circuitBreakers.set(key, new CircuitBreaker(service, operation, circuitBreakerConfig));
      console.log(`🔧 Created circuit breaker for ${key}`);
    }
    
    return this.circuitBreakers.get(key)!;
  }

  /**
   * Get health status of all circuit breakers
   */
  getHealthStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    Array.from(this.circuitBreakers.entries()).forEach(([key, breaker]) => {
      status[key] = breaker.getStatus();
    });
    
    return status;
  }

  /**
   * Reset a specific circuit breaker
   */
  resetCircuitBreaker(service: string, operation: string): boolean {
    const key = `${service}.${operation}`;
    const breaker = this.circuitBreakers.get(key);
    
    if (breaker) {
      breaker.reset();
      console.log(`🔄 Reset circuit breaker for ${key}`);
      return true;
    }
    
    return false;
  }

  /**
   * Reset all circuit breakers (useful for manual recovery)
   */
  resetAllCircuitBreakers(): void {
    Array.from(this.circuitBreakers.entries()).forEach(([key, breaker]) => {
      breaker.reset();
    });
    console.log('🔄 Reset all circuit breakers');
  }

  /**
   * Check if any critical services are down
   */
  getCriticalServicesStatus(): { allHealthy: boolean; downServices: string[] } {
    const downServices: string[] = [];
    
    Array.from(this.circuitBreakers.entries()).forEach(([key, breaker]) => {
      if (breaker.isOpen()) {
        downServices.push(key);
      }
    });
    
    return {
      allHealthy: downServices.length === 0,
      downServices
    };
  }

  /**
   * Get statistics for monitoring dashboard
   */
  getStatistics(): {
    totalBreakers: number;
    openBreakers: number;
    totalFailures: number;
    averageFailures: number;
  } {
    const statuses = Object.values(this.getHealthStatus());
    
    return {
      totalBreakers: statuses.length,
      openBreakers: statuses.filter(s => s.state === 'OPEN').length,
      totalFailures: statuses.reduce((sum, s) => sum + s.failureCount, 0),
      averageFailures: statuses.length > 0 
        ? statuses.reduce((sum, s) => sum + s.failureCount, 0) / statuses.length 
        : 0
    };
  }
}

// Export singleton instance
export const circuitBreakerManager = CircuitBreakerManager.getInstance();