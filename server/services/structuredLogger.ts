/**
 * Structured Logging Framework
 * Provides comprehensive logging with correlation IDs and context tracking
 * for classroom deployment debugging
 */

import { storage } from "../storage.js";
import { randomUUID } from "crypto";
import type { InsertStructuredLog } from "@shared/schema.js";

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';
export type LogService = 'api' | 'audio' | 'quiz' | 'database' | 'auth' | 'session' | 'system';

export interface LogContext {
  correlationId?: string;
  sessionId?: string;
  userId?: string;
  studentId?: string;
  httpMethod?: string;
  httpPath?: string;
  httpStatus?: number;
  userAgent?: string;
  ipAddress?: string;
  operation?: string;
  metadata?: Record<string, any>;
}

export class StructuredLogger {
  private static instance: StructuredLogger;
  private logQueue: InsertStructuredLog[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL_MS = 5000; // 5 seconds
  private readonly MAX_QUEUE_SIZE = 100;

  private constructor() {
    this.startLogFlushing();
  }

  static getInstance(): StructuredLogger {
    if (!StructuredLogger.instance) {
      StructuredLogger.instance = new StructuredLogger();
    }
    return StructuredLogger.instance;
  }

  /**
   * Generate a unique correlation ID for request tracing
   */
  generateCorrelationId(): string {
    return randomUUID();
  }

  /**
   * Log a debug message
   */
  async debug(
    message: string,
    service: LogService,
    context: LogContext = {}
  ): Promise<void> {
    await this.log('debug', message, service, context);
  }

  /**
   * Log an info message
   */
  async info(
    message: string,
    service: LogService,
    context: LogContext = {}
  ): Promise<void> {
    await this.log('info', message, service, context);
  }

  /**
   * Log a warning message
   */
  async warn(
    message: string,
    service: LogService,
    context: LogContext = {}
  ): Promise<void> {
    await this.log('warn', message, service, context);
  }

  /**
   * Log an error message
   */
  async error(
    message: string,
    service: LogService,
    context: LogContext = {},
    error?: Error
  ): Promise<void> {
    const enhancedContext = {
      ...context,
      metadata: {
        ...context.metadata,
        errorName: error?.name,
        errorMessage: error?.message
      }
    };

    await this.log('error', message, service, enhancedContext, error?.stack);
  }

  /**
   * Log a critical error message
   */
  async critical(
    message: string,
    service: LogService,
    context: LogContext = {},
    error?: Error
  ): Promise<void> {
    const enhancedContext = {
      ...context,
      metadata: {
        ...context.metadata,
        errorName: error?.name,
        errorMessage: error?.message
      }
    };

    await this.log('critical', message, service, enhancedContext, error?.stack);
    
    // For critical errors, also log to console immediately
    console.error(`🚨 CRITICAL [${service}]: ${message}`, {
      context: enhancedContext,
      stack: error?.stack
    });
  }

  /**
   * Log a student session event
   */
  async logStudentSession(
    event: 'login' | 'logout' | 'activity' | 'error',
    studentId: string,
    sessionId: string,
    context: LogContext = {}
  ): Promise<void> {
    const message = `Student ${event}: ${studentId}`;
    const enhancedContext = {
      ...context,
      studentId,
      sessionId,
      metadata: {
        ...context.metadata,
        sessionEvent: event
      }
    };

    await this.log('info', message, 'session', enhancedContext);
  }

  /**
   * Log API request/response
   */
  async logApiRequest(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
    context: LogContext = {}
  ): Promise<void> {
    const level: LogLevel = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'info';
    const message = `${method} ${path} ${statusCode} (${durationMs}ms)`;
    
    const enhancedContext = {
      ...context,
      httpMethod: method,
      httpPath: path,
      httpStatus: statusCode,
      metadata: {
        ...context.metadata,
        responseTime: durationMs
      }
    };

    await this.log(level, message, 'api', enhancedContext);
  }

  /**
   * Log audio generation events
   */
  async logAudioGeneration(
    provider: string,
    text: string,
    success: boolean,
    durationMs: number,
    cacheHit: boolean,
    context: LogContext = {}
  ): Promise<void> {
    const level: LogLevel = success ? 'info' : 'error';
    const cacheStatus = cacheHit ? 'cache hit' : 'generated';
    const message = `Audio ${success ? 'generated' : 'failed'} via ${provider} (${durationMs}ms, ${cacheStatus})`;
    
    const enhancedContext = {
      ...context,
      metadata: {
        ...context.metadata,
        provider,
        textLength: text.length,
        textPreview: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
        durationMs,
        cacheHit,
        success
      }
    };

    await this.log(level, message, 'audio', enhancedContext);
  }

  /**
   * Log quiz generation events
   */
  async logQuizGeneration(
    quizType: string,
    wordCount: number,
    success: boolean,
    durationMs: number,
    context: LogContext = {}
  ): Promise<void> {
    const level: LogLevel = success ? 'info' : 'error';
    const message = `${quizType} quiz ${success ? 'generated' : 'failed'} for ${wordCount} words (${durationMs}ms)`;
    
    const enhancedContext = {
      ...context,
      metadata: {
        ...context.metadata,
        quizType,
        wordCount,
        durationMs,
        success
      }
    };

    await this.log(level, message, 'quiz', enhancedContext);
  }

  /**
   * Log database operations
   */
  async logDatabaseOperation(
    operation: string,
    success: boolean,
    durationMs: number,
    rowCount?: number,
    context: LogContext = {}
  ): Promise<void> {
    const level: LogLevel = success ? 'debug' : 'error';
    const message = `DB ${operation} ${success ? 'completed' : 'failed'} (${durationMs}ms${rowCount ? `, ${rowCount} rows` : ''})`;
    
    const enhancedContext = {
      ...context,
      operation,
      metadata: {
        ...context.metadata,
        databaseOperation: operation,
        durationMs,
        rowCount,
        success
      }
    };

    await this.log(level, message, 'database', enhancedContext);
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(
    event: 'login' | 'logout' | 'failed_login' | 'session_created' | 'session_expired',
    userId?: string,
    studentId?: string,
    context: LogContext = {}
  ): Promise<void> {
    const level: LogLevel = event === 'failed_login' ? 'warn' : 'info';
    const subject = studentId ? `student ${studentId}` : userId ? `user ${userId}` : 'unknown user';
    const message = `Auth ${event} for ${subject}`;
    
    const enhancedContext = {
      ...context,
      userId,
      studentId,
      metadata: {
        ...context.metadata,
        authEvent: event
      }
    };

    await this.log(level, message, 'auth', enhancedContext);
  }

  /**
   * Core logging method
   */
  private async log(
    level: LogLevel,
    message: string,
    service: LogService,
    context: LogContext = {},
    errorStack?: string
  ): Promise<void> {
    const logEntry: InsertStructuredLog = {
      level,
      message,
      service,
      operation: context.operation,
      correlationId: context.correlationId,
      sessionId: context.sessionId,
      userId: context.userId,
      studentId: context.studentId,
      context: context.metadata,
      errorStack,
      httpMethod: context.httpMethod,
      httpPath: context.httpPath,
      httpStatus: context.httpStatus,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress
    };

    // Add to queue for batch processing
    this.logQueue.push(logEntry);

    // For critical errors, flush immediately
    if (level === 'critical') {
      await this.flushLogs();
    }
    
    // Flush if queue is getting too large
    if (this.logQueue.length >= this.MAX_QUEUE_SIZE) {
      await this.flushLogs();
    }

    // Also log to console for immediate visibility
    if (level === 'error' || level === 'critical' || level === 'warn') {
      console.log(`[${level.toUpperCase()}] ${service}: ${message}`, context);
    }
  }

  /**
   * Start periodic log flushing
   */
  private startLogFlushing(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    this.flushInterval = setInterval(async () => {
      await this.flushLogs();
    }, this.FLUSH_INTERVAL_MS);

    console.log('📝 Started structured logging with periodic flushing');
  }

  /**
   * Flush all queued logs to database
   */
  private async flushLogs(): Promise<void> {
    if (this.logQueue.length === 0) {
      return;
    }

    const logsToFlush = [...this.logQueue];
    this.logQueue = [];

    try {
      // Process logs in batches to avoid overwhelming the database
      const batchSize = 50;
      for (let i = 0; i < logsToFlush.length; i += batchSize) {
        const batch = logsToFlush.slice(i, i + batchSize);
        await Promise.all(
          batch.map(log => storage.createStructuredLog(log).catch(error => {
            console.error('Failed to save log entry:', error);
            // Re-queue failed logs for retry (with limit to prevent infinite growth)
            if (this.logQueue.length < this.MAX_QUEUE_SIZE * 2) {
              this.logQueue.push(log);
            }
          }))
        );
      }
    } catch (error) {
      console.error('Failed to flush logs:', error);
      // Re-queue logs for retry
      this.logQueue.unshift(...logsToFlush.slice(0, this.MAX_QUEUE_SIZE));
    }
  }

  /**
   * Get recent error logs for debugging
   */
  async getRecentErrorLogs(limit: number = 50): Promise<any[]> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    try {
      return await storage.getErrorLogs({ startTime: oneHourAgo, endTime: new Date() }, limit);
    } catch (error) {
      console.error('Failed to get recent error logs:', error);
      return [];
    }
  }

  /**
   * Get logs by correlation ID for request tracing
   */
  async getLogsByCorrelationId(correlationId: string): Promise<any[]> {
    try {
      return await storage.getStructuredLogs({ correlationId, limit: 100 });
    } catch (error) {
      console.error('Failed to get logs by correlation ID:', error);
      return [];
    }
  }

  /**
   * Get logs by session ID for student debugging
   */
  async getLogsBySessionId(sessionId: string): Promise<any[]> {
    try {
      return await storage.getStructuredLogs({ sessionId, limit: 200 });
    } catch (error) {
      console.error('Failed to get logs by session ID:', error);
      return [];
    }
  }

  /**
   * Stop log flushing and flush remaining logs
   */
  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    await this.flushLogs();
    console.log('📝 Stopped structured logging');
  }
}

// Export singleton instance
export const structuredLogger = StructuredLogger.getInstance();