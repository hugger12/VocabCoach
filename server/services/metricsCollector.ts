/**
 * Performance Metrics Collection Service
 * Provides comprehensive monitoring for classroom deployment readiness
 */

import { storage } from "../storage.js";
import { randomUUID } from "crypto";
import type { InsertPerformanceMetric, InsertStructuredLog, InsertSystemHealthMetric, InsertStudentSession } from "@shared/schema.js";
import { circuitBreakerManager } from "./circuitBreakerManager.js";
import { errorRecoveryService } from "./errorRecovery.js";
import { databaseResilienceService } from "./databaseResilience.js";

export class MetricsCollector {
  private static instance: MetricsCollector;
  private currentCorrelations: Map<string, { startTime: number; metadata: any }> = new Map();
  private systemHealthInterval: NodeJS.Timeout | null = null;
  private readonly SYSTEM_HEALTH_INTERVAL_MS = 60000; // 1 minute

  private constructor() {
    this.startSystemHealthCollection();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Generate a unique correlation ID for request tracing
   */
  generateCorrelationId(): string {
    return randomUUID();
  }

  /**
   * Start tracking an operation for performance metrics
   */
  startOperation(correlationId: string, metadata: any = {}): void {
    this.currentCorrelations.set(correlationId, {
      startTime: Date.now(),
      metadata
    });
  }

  /**
   * End tracking an operation and record performance metrics
   */
  async endOperation(
    correlationId: string,
    metricType: string,
    operation: string,
    status: 'success' | 'error' | 'timeout',
    options: {
      payloadSize?: number;
      cacheHit?: boolean;
      errorType?: string;
      userId?: string;
      studentId?: string;
      additionalMetadata?: any;
    } = {}
  ): Promise<void> {
    const operationData = this.currentCorrelations.get(correlationId);
    if (!operationData) {
      console.warn(`No operation data found for correlation ID: ${correlationId}`);
      return;
    }

    const durationMs = Date.now() - operationData.startTime;
    this.currentCorrelations.delete(correlationId);

    const metric: InsertPerformanceMetric = {
      metricType,
      operation,
      durationMs,
      status,
      payloadSize: options.payloadSize,
      cacheHit: options.cacheHit,
      userId: options.userId,
      studentId: options.studentId,
      correlationId,
      errorType: options.errorType,
      metadata: {
        ...operationData.metadata,
        ...options.additionalMetadata
      }
    };

    try {
      await storage.createPerformanceMetric(metric);
    } catch (error) {
      console.error('Failed to record performance metric:', error);
      // Don't throw - metrics collection should not break the main operation
    }
  }

  /**
   * Record API endpoint performance
   */
  async recordApiMetric(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
    options: {
      payloadSize?: number;
      userId?: string;
      studentId?: string;
      correlationId?: string;
      responseSize?: number;
    } = {}
  ): Promise<void> {
    const status = statusCode >= 400 ? 'error' : 'success';
    const errorType = statusCode >= 400 ? `http_${statusCode}` : undefined;

    const metric: InsertPerformanceMetric = {
      metricType: 'api_endpoint',
      operation: `${method} ${path}`,
      durationMs,
      status,
      payloadSize: options.payloadSize,
      userId: options.userId,
      studentId: options.studentId,
      correlationId: options.correlationId || this.generateCorrelationId(),
      errorType,
      metadata: {
        httpMethod: method,
        httpPath: path,
        httpStatus: statusCode,
        responseSize: options.responseSize
      }
    };

    try {
      await storage.createPerformanceMetric(metric);
    } catch (error) {
      console.error('Failed to record API metric:', error);
    }
  }

  /**
   * Record audio generation performance
   */
  async recordAudioMetric(
    provider: string,
    textLength: number,
    durationMs: number,
    cacheHit: boolean,
    status: 'success' | 'error' | 'timeout',
    options: {
      audioSize?: number;
      errorType?: string;
      correlationId?: string;
      studentId?: string;
    } = {}
  ): Promise<void> {
    const metric: InsertPerformanceMetric = {
      metricType: 'audio_generation',
      operation: `${provider}_tts`,
      durationMs,
      status,
      payloadSize: options.audioSize,
      cacheHit,
      studentId: options.studentId,
      correlationId: options.correlationId || this.generateCorrelationId(),
      errorType: options.errorType,
      metadata: {
        provider,
        textLength,
        cacheHit
      }
    };

    try {
      await storage.createPerformanceMetric(metric);
    } catch (error) {
      console.error('Failed to record audio metric:', error);
    }
  }

  /**
   * Record quiz generation performance
   */
  async recordQuizMetric(
    quizType: 'cloze' | 'passage' | 'comprehensive',
    wordCount: number,
    durationMs: number,
    status: 'success' | 'error' | 'timeout',
    options: {
      cacheHit?: boolean;
      payloadSize?: number;
      errorType?: string;
      correlationId?: string;
      studentId?: string;
    } = {}
  ): Promise<void> {
    const metric: InsertPerformanceMetric = {
      metricType: 'quiz_generation',
      operation: `${quizType}_quiz`,
      durationMs,
      status,
      payloadSize: options.payloadSize,
      cacheHit: options.cacheHit,
      studentId: options.studentId,
      correlationId: options.correlationId || this.generateCorrelationId(),
      errorType: options.errorType,
      metadata: {
        quizType,
        wordCount,
        cacheHit: options.cacheHit
      }
    };

    try {
      await storage.createPerformanceMetric(metric);
    } catch (error) {
      console.error('Failed to record quiz metric:', error);
    }
  }

  /**
   * Record database query performance
   */
  async recordDatabaseMetric(
    operation: string,
    durationMs: number,
    status: 'success' | 'error' | 'timeout',
    options: {
      errorType?: string;
      correlationId?: string;
      rowCount?: number;
    } = {}
  ): Promise<void> {
    const metric: InsertPerformanceMetric = {
      metricType: 'database_query',
      operation,
      durationMs,
      status,
      correlationId: options.correlationId || this.generateCorrelationId(),
      errorType: options.errorType,
      metadata: {
        rowCount: options.rowCount
      }
    };

    try {
      await storage.createPerformanceMetric(metric);
    } catch (error) {
      console.error('Failed to record database metric:', error);
    }
  }

  /**
   * Get current system performance statistics
   */
  async getSystemPerformanceStats(timeRangeMinutes: number = 60): Promise<{
    apiStats: any;
    audioStats: any;
    quizStats: any;
    databaseStats: any;
    overallHealth: string;
  }> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - timeRangeMinutes * 60 * 1000);

    try {
      const [apiMetrics, audioMetrics, quizMetrics, dbMetrics] = await Promise.all([
        storage.getPerformanceMetrics({
          metricType: 'api_endpoint',
          startTime,
          endTime,
          limit: 1000
        }),
        storage.getPerformanceMetrics({
          metricType: 'audio_generation',
          startTime,
          endTime,
          limit: 1000
        }),
        storage.getPerformanceMetrics({
          metricType: 'quiz_generation',
          startTime,
          endTime,
          limit: 1000
        }),
        storage.getPerformanceMetrics({
          metricType: 'database_query',
          startTime,
          endTime,
          limit: 1000
        })
      ]);

      const apiStats = this.calculateMetricStats(apiMetrics, 'API');
      const audioStats = this.calculateMetricStats(audioMetrics, 'Audio');
      const quizStats = this.calculateMetricStats(quizMetrics, 'Quiz');
      const databaseStats = this.calculateMetricStats(dbMetrics, 'Database');

      // Determine overall health based on error rates and response times
      let overallHealth = 'healthy';
      if (apiStats.errorRate > 5 || audioStats.errorRate > 10 || apiStats.avgResponseTime > 2000) {
        overallHealth = 'degraded';
      }
      if (apiStats.errorRate > 15 || audioStats.errorRate > 25 || apiStats.avgResponseTime > 5000) {
        overallHealth = 'critical';
      }

      return {
        apiStats,
        audioStats,
        quizStats,
        databaseStats,
        overallHealth
      };
    } catch (error) {
      console.error('Failed to get system performance stats:', error);
      return {
        apiStats: { errorRate: 0, avgResponseTime: 0, requestCount: 0 },
        audioStats: { errorRate: 0, avgResponseTime: 0, requestCount: 0 },
        quizStats: { errorRate: 0, avgResponseTime: 0, requestCount: 0 },
        databaseStats: { errorRate: 0, avgResponseTime: 0, requestCount: 0 },
        overallHealth: 'unknown'
      };
    }
  }

  private calculateMetricStats(metrics: any[], type: string) {
    if (metrics.length === 0) {
      return {
        errorRate: 0,
        avgResponseTime: 0,
        requestCount: 0,
        cacheHitRatio: 0,
        slowestOperations: []
      };
    }

    const errorCount = metrics.filter(m => m.status === 'error').length;
    const errorRate = Math.round((errorCount / metrics.length) * 100);
    
    const avgResponseTime = Math.round(
      metrics.reduce((sum, m) => sum + m.durationMs, 0) / metrics.length
    );

    const cacheableMetrics = metrics.filter(m => m.cacheHit !== null);
    const cacheHits = cacheableMetrics.filter(m => m.cacheHit).length;
    const cacheHitRatio = cacheableMetrics.length > 0 
      ? Math.round((cacheHits / cacheableMetrics.length) * 100) 
      : 0;

    // Group by operation and find slowest
    const operationStats = metrics.reduce((acc, m) => {
      if (!acc[m.operation]) {
        acc[m.operation] = { durations: [], count: 0 };
      }
      acc[m.operation].durations.push(m.durationMs);
      acc[m.operation].count++;
      return acc;
    }, {} as Record<string, { durations: number[]; count: number }>);

    const slowestOperations = Object.entries(operationStats)
      .map(([operation, stats]) => ({
        operation,
        avgDuration: Math.round(stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length),
        count: stats.count
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 3);

    return {
      errorRate,
      avgResponseTime,
      requestCount: metrics.length,
      cacheHitRatio,
      slowestOperations
    };
  }

  /**
   * Start periodic system health collection
   */
  private startSystemHealthCollection(): void {
    if (this.systemHealthInterval) {
      clearInterval(this.systemHealthInterval);
    }

    this.systemHealthInterval = setInterval(async () => {
      try {
        await this.collectSystemHealthMetrics();
      } catch (error) {
        console.error('Failed to collect system health metrics:', error);
      }
    }, this.SYSTEM_HEALTH_INTERVAL_MS);

    console.log('📊 Started system health metrics collection');
  }

  /**
   * Collect comprehensive system health metrics
   */
  private async collectSystemHealthMetrics(): Promise<void> {
    try {
      const [performanceStats, sessionStats, circuitBreakerStatus, serviceStatus] = await Promise.all([
        this.getSystemPerformanceStats(5), // Last 5 minutes
        storage.getSessionStats(),
        circuitBreakerManager.getHealthStatus(),
        errorRecoveryService.getHealthStatus()
      ]);

      const healthMetric: InsertSystemHealthMetric = {
        overallHealth: performanceStats.overallHealth as 'healthy' | 'degraded' | 'critical',
        activeStudents: sessionStats.activeStudents,
        activeSessions: sessionStats.activeSessions,
        apiResponseTime: performanceStats.apiStats.avgResponseTime,
        databaseResponseTime: performanceStats.databaseStats.avgResponseTime,
        audioGenerationTime: performanceStats.audioStats.avgResponseTime,
        quizGenerationTime: performanceStats.quizStats.avgResponseTime,
        cacheHitRatio: Math.round((
          performanceStats.audioStats.cacheHitRatio + 
          performanceStats.quizStats.cacheHitRatio
        ) / 2),
        errorRate: Math.max(
          performanceStats.apiStats.errorRate,
          performanceStats.audioStats.errorRate
        ),
        circuitBreakerStatus,
        serviceStatus,
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
        cpuUsage: 0 // Would need additional monitoring for CPU
      };

      await storage.createSystemHealthMetric(healthMetric);
    } catch (error) {
      console.error('Failed to collect system health metrics:', error);
    }
  }

  /**
   * Stop system health collection
   */
  stopSystemHealthCollection(): void {
    if (this.systemHealthInterval) {
      clearInterval(this.systemHealthInterval);
      this.systemHealthInterval = null;
      console.log('📊 Stopped system health metrics collection');
    }
  }

  /**
   * Get cache effectiveness metrics
   */
  async getCacheEffectiveness(timeRangeMinutes: number = 60): Promise<{
    audioCache: { hitRatio: number; totalRequests: number; avgGenerationTime: number };
    quizCache: { hitRatio: number; totalRequests: number; avgGenerationTime: number };
  }> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - timeRangeMinutes * 60 * 1000);

    try {
      const [audioMetrics, quizMetrics] = await Promise.all([
        storage.getPerformanceMetrics({
          metricType: 'audio_generation',
          startTime,
          endTime,
          limit: 1000
        }),
        storage.getPerformanceMetrics({
          metricType: 'quiz_generation',
          startTime,
          endTime,
          limit: 1000
        })
      ]);

      const audioCache = this.calculateCacheStats(audioMetrics);
      const quizCache = this.calculateCacheStats(quizMetrics);

      return { audioCache, quizCache };
    } catch (error) {
      console.error('Failed to get cache effectiveness:', error);
      return {
        audioCache: { hitRatio: 0, totalRequests: 0, avgGenerationTime: 0 },
        quizCache: { hitRatio: 0, totalRequests: 0, avgGenerationTime: 0 }
      };
    }
  }

  private calculateCacheStats(metrics: any[]) {
    const cacheableMetrics = metrics.filter(m => m.cacheHit !== null);
    const cacheHits = cacheableMetrics.filter(m => m.cacheHit).length;
    const hitRatio = cacheableMetrics.length > 0 
      ? Math.round((cacheHits / cacheableMetrics.length) * 100) 
      : 0;

    const avgGenerationTime = metrics.length > 0
      ? Math.round(metrics.reduce((sum, m) => sum + m.durationMs, 0) / metrics.length)
      : 0;

    return {
      hitRatio,
      totalRequests: cacheableMetrics.length,
      avgGenerationTime
    };
  }
}

// Export singleton instance
export const metricsCollector = MetricsCollector.getInstance();