/**
 * Error Recovery and Service Health Monitoring System
 * Provides automatic service recovery detection and graceful degradation patterns
 */

import { circuitBreakerManager } from './circuitBreakerManager.js';
import { EventEmitter } from 'events';

export interface ServiceHealthStatus {
  serviceName: string;
  isHealthy: boolean;
  lastChecked: Date;
  consecutiveFailures: number;
  lastError?: string;
  responseTime?: number;
}

export interface GracefulDegradationOptions {
  fallbackEnabled: boolean;
  fallbackMessage: string;
  retryAfterMs: number;
  notifyUsers: boolean;
}

export class ErrorRecoveryService extends EventEmitter {
  private static instance: ErrorRecoveryService;
  private serviceHealth: Map<string, ServiceHealthStatus> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  private constructor() {
    super();
    this.startHealthMonitoring();
  }

  static getInstance(): ErrorRecoveryService {
    if (!ErrorRecoveryService.instance) {
      ErrorRecoveryService.instance = new ErrorRecoveryService();
    }
    return ErrorRecoveryService.instance;
  }

  /**
   * Register a service for health monitoring
   */
  registerService(serviceName: string): void {
    if (!this.serviceHealth.has(serviceName)) {
      this.serviceHealth.set(serviceName, {
        serviceName,
        isHealthy: true,
        lastChecked: new Date(),
        consecutiveFailures: 0,
      });
      console.log(`🔍 Registered service for health monitoring: ${serviceName}`);
    }
  }

  /**
   * Record a service failure
   */
  recordFailure(serviceName: string, error?: string): void {
    this.registerService(serviceName); // Ensure service is registered
    
    const health = this.serviceHealth.get(serviceName)!;
    health.consecutiveFailures++;
    health.lastError = error;
    health.lastChecked = new Date();
    
    // Mark as unhealthy if too many consecutive failures
    if (health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES && health.isHealthy) {
      health.isHealthy = false;
      console.log(`⚠️ Service marked as unhealthy: ${serviceName} (${health.consecutiveFailures} consecutive failures)`);
      
      // Emit service down event
      this.emit('serviceDown', { serviceName, error });
    }
    
    this.serviceHealth.set(serviceName, health);
  }

  /**
   * Record a service success (recovery)
   */
  recordSuccess(serviceName: string, responseTime?: number): void {
    this.registerService(serviceName); // Ensure service is registered
    
    const health = this.serviceHealth.get(serviceName)!;
    const wasUnhealthy = !health.isHealthy;
    
    // Reset failure count and mark as healthy
    health.consecutiveFailures = 0;
    health.isHealthy = true;
    health.lastChecked = new Date();
    health.responseTime = responseTime;
    health.lastError = undefined;
    
    if (wasUnhealthy) {
      console.log(`✅ Service recovered: ${serviceName}`);
      
      // Reset circuit breaker if it exists
      const breakerReset = circuitBreakerManager.resetCircuitBreaker(serviceName, 'generateAudio') ||
                          circuitBreakerManager.resetCircuitBreaker(serviceName, 'generateSentences') ||
                          circuitBreakerManager.resetCircuitBreaker(serviceName, 'analyzeWord');
      
      if (breakerReset) {
        console.log(`🔄 Reset circuit breaker for recovered service: ${serviceName}`);
      }
      
      // Emit service recovered event
      this.emit('serviceRecovered', { serviceName });
    }
    
    this.serviceHealth.set(serviceName, health);
  }

  /**
   * Get current health status of all services
   */
  getHealthStatus(): Record<string, ServiceHealthStatus> {
    const status: Record<string, ServiceHealthStatus> = {};
    Array.from(this.serviceHealth.entries()).forEach(([name, health]) => {
      status[name] = { ...health };
    });
    return status;
  }

  /**
   * Check if a specific service is healthy
   */
  isServiceHealthy(serviceName: string): boolean {
    const health = this.serviceHealth.get(serviceName);
    return health ? health.isHealthy : true; // Default to healthy if unknown
  }

  /**
   * Get list of unhealthy services
   */
  getUnhealthyServices(): string[] {
    return Array.from(this.serviceHealth.values())
      .filter(health => !health.isHealthy)
      .map(health => health.serviceName);
  }

  /**
   * Force health check for a specific service
   */
  async checkServiceHealth(serviceName: string): Promise<boolean> {
    try {
      const startTime = Date.now();
      let isHealthy = false;

      // Perform basic health checks based on service type
      switch (serviceName.toLowerCase()) {
        case 'openai':
          // Simple health check for OpenAI
          if (process.env.OPENAI_API_KEY || process.env.OPENAI_KEY) {
            isHealthy = true; // We can't really ping OpenAI API without making a real request
          }
          break;
          
        case 'elevenlabs':
          // Simple health check for ElevenLabs
          if (process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_WORD_WIZARD || process.env.ELEVEN_LABS_KEY) {
            isHealthy = true; // We can't really ping ElevenLabs API without making a real request
          }
          break;
          
        default:
          isHealthy = true; // Default to healthy for unknown services
      }

      const responseTime = Date.now() - startTime;
      
      if (isHealthy) {
        this.recordSuccess(serviceName, responseTime);
      } else {
        this.recordFailure(serviceName, 'Health check failed');
      }
      
      return isHealthy;
    } catch (error) {
      this.recordFailure(serviceName, error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      console.log('🔍 Running periodic health checks...');
      
      // Check circuit breaker status
      const breakerStatus = circuitBreakerManager.getCriticalServicesStatus();
      
      if (!breakerStatus.allHealthy) {
        console.log(`⚠️ Circuit breakers detected down services: ${breakerStatus.downServices.join(', ')}`);
        
        // Mark services as unhealthy based on circuit breaker status
        for (const service of breakerStatus.downServices) {
          const [serviceName] = service.split('.');
          this.recordFailure(serviceName, 'Circuit breaker open');
        }
      }
      
      // Check configuration-based health
      const services = ['openai', 'elevenlabs'];
      for (const service of services) {
        await this.checkServiceHealth(service);
      }
      
    }, this.HEALTH_CHECK_INTERVAL_MS);

    console.log(`🔍 Started health monitoring (interval: ${this.HEALTH_CHECK_INTERVAL_MS}ms)`);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('🔍 Stopped health monitoring');
    }
  }

  /**
   * Get graceful degradation options for a service
   */
  getGracefulDegradationOptions(serviceName: string): GracefulDegradationOptions {
    const isHealthy = this.isServiceHealthy(serviceName);
    
    if (isHealthy) {
      return {
        fallbackEnabled: false,
        fallbackMessage: '',
        retryAfterMs: 0,
        notifyUsers: false,
      };
    }

    // Define fallback strategies for different services
    switch (serviceName.toLowerCase()) {
      case 'openai':
        return {
          fallbackEnabled: true,
          fallbackMessage: 'AI features temporarily unavailable. Using basic word analysis.',
          retryAfterMs: 60000, // 1 minute
          notifyUsers: true,
        };
        
      case 'elevenlabs':
        return {
          fallbackEnabled: true,
          fallbackMessage: 'Audio generation temporarily unavailable. Text content still available.',
          retryAfterMs: 30000, // 30 seconds
          notifyUsers: true,
        };
        
      default:
        return {
          fallbackEnabled: true,
          fallbackMessage: 'Some features temporarily unavailable. Please try again later.',
          retryAfterMs: 60000, // 1 minute
          notifyUsers: true,
        };
    }
  }

  /**
   * Get system-wide health summary for dashboards
   */
  getSystemHealthSummary(): {
    overallHealth: 'healthy' | 'degraded' | 'critical';
    healthyServices: number;
    unhealthyServices: number;
    totalServices: number;
    criticalIssues: string[];
  } {
    const unhealthyServices = this.getUnhealthyServices();
    const totalServices = this.serviceHealth.size;
    const healthyServices = totalServices - unhealthyServices.length;

    let overallHealth: 'healthy' | 'degraded' | 'critical';
    if (unhealthyServices.length === 0) {
      overallHealth = 'healthy';
    } else if (unhealthyServices.length < totalServices / 2) {
      overallHealth = 'degraded';
    } else {
      overallHealth = 'critical';
    }

    return {
      overallHealth,
      healthyServices,
      unhealthyServices: unhealthyServices.length,
      totalServices,
      criticalIssues: unhealthyServices,
    };
  }
}

// Export singleton instance
export const errorRecoveryService = ErrorRecoveryService.getInstance();