/**
 * Student Session Manager
 * Tracks and manages student sessions for classroom deployment monitoring
 */

import { storage } from "../storage.js";
import { structuredLogger } from "./structuredLogger.js";
import type { InsertStudentSession, StudentSession } from "@shared/schema.js";
import { randomUUID } from "crypto";

export class StudentSessionManager {
  private static instance: StudentSessionManager;
  private sessionHeartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
  private readonly SESSION_TIMEOUT_MS = 300000; // 5 minutes

  private constructor() {
    this.startSessionHeartbeat();
  }

  static getInstance(): StudentSessionManager {
    if (!StudentSessionManager.instance) {
      StudentSessionManager.instance = new StudentSessionManager();
    }
    return StudentSessionManager.instance;
  }

  /**
   * Create a new student session
   */
  async createSession(
    studentId: string,
    instructorId: string,
    sessionId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<StudentSession> {
    try {
      const deviceInfo = this.parseUserAgent(userAgent);

      const sessionData: InsertStudentSession = {
        sessionId,
        studentId,
        instructorId,
        status: 'active',
        loginTime: new Date(),
        lastActivity: new Date(),
        ipAddress,
        userAgent,
        deviceInfo,
        activityCount: 0,
        wordsStudied: 0,
        quizzesCompleted: 0,
        audioPlayed: 0,
        totalDurationMs: 0,
        errors: 0
      };

      const session = await storage.createStudentSession(sessionData);

      await structuredLogger.logStudentSession('login', studentId, sessionId, {
        userId: instructorId,
        ipAddress,
        userAgent,
        metadata: {
          deviceInfo,
          sessionCreated: true
        }
      });

      console.log(`👨‍🎓 Student session created: ${studentId} (${sessionId})`);
      return session;
    } catch (error) {
      await structuredLogger.error(
        `Failed to create student session for ${studentId}`,
        'session',
        { studentId, sessionId },
        error as Error
      );
      throw error;
    }
  }

  /**
   * Update student session activity
   */
  async updateActivity(
    sessionId: string,
    activity: {
      wordsStudied?: number;
      quizzesCompleted?: number;
      audioPlayed?: number;
      errors?: number;
    }
  ): Promise<void> {
    try {
      const session = await storage.getStudentSession(sessionId);
      if (!session) {
        console.warn(`Session not found: ${sessionId}`);
        return;
      }

      const now = new Date();
      const sessionDuration = now.getTime() - session.loginTime.getTime();

      const updates: Partial<StudentSession> = {
        lastActivity: now,
        activityCount: session.activityCount + 1,
        totalDurationMs: sessionDuration,
        wordsStudied: session.wordsStudied + (activity.wordsStudied || 0),
        quizzesCompleted: session.quizzesCompleted + (activity.quizzesCompleted || 0),
        audioPlayed: session.audioPlayed + (activity.audioPlayed || 0),
        errors: session.errors + (activity.errors || 0)
      };

      await storage.updateStudentSession(sessionId, updates);

      // Log activity if significant
      if (activity.wordsStudied || activity.quizzesCompleted) {
        await structuredLogger.logStudentSession('activity', session.studentId, sessionId, {
          userId: session.instructorId,
          metadata: {
            activity,
            sessionDuration,
            totalActivities: session.activityCount + 1
          }
        });
      }
    } catch (error) {
      await structuredLogger.error(
        `Failed to update session activity: ${sessionId}`,
        'session',
        { sessionId },
        error as Error
      );
    }
  }

  /**
   * End student session
   */
  async endSession(sessionId: string, reason: 'logout' | 'timeout' | 'error' = 'logout'): Promise<void> {
    try {
      const session = await storage.getStudentSession(sessionId);
      if (!session) {
        console.warn(`Session not found for ending: ${sessionId}`);
        return;
      }

      await storage.endStudentSession(sessionId);

      await structuredLogger.logStudentSession('logout', session.studentId, sessionId, {
        userId: session.instructorId,
        metadata: {
          reason,
          sessionDuration: Date.now() - session.loginTime.getTime(),
          activitiesPerformed: session.activityCount,
          wordsStudied: session.wordsStudied,
          quizzesCompleted: session.quizzesCompleted
        }
      });

      console.log(`👨‍🎓 Student session ended: ${session.studentId} (${reason})`);
    } catch (error) {
      await structuredLogger.error(
        `Failed to end session: ${sessionId}`,
        'session',
        { sessionId },
        error as Error
      );
    }
  }

  /**
   * Get active student sessions for monitoring
   */
  async getActiveSessions(): Promise<StudentSession[]> {
    try {
      return await storage.getActiveStudentSessions();
    } catch (error) {
      await structuredLogger.error(
        'Failed to get active sessions',
        'session',
        {},
        error as Error
      );
      return [];
    }
  }

  /**
   * Get session statistics for dashboard
   */
  async getSessionStatistics(): Promise<{
    activeSessions: number;
    activeStudents: number;
    avgSessionDuration: number;
    totalSessions: number;
  }> {
    try {
      return await storage.getSessionStats();
    } catch (error) {
      await structuredLogger.error(
        'Failed to get session statistics',
        'session',
        {},
        error as Error
      );
      return {
        activeSessions: 0,
        activeStudents: 0,
        avgSessionDuration: 0,
        totalSessions: 0
      };
    }
  }

  /**
   * Start periodic session heartbeat monitoring
   */
  private startSessionHeartbeat(): void {
    if (this.sessionHeartbeatInterval) {
      clearInterval(this.sessionHeartbeatInterval);
    }

    this.sessionHeartbeatInterval = setInterval(async () => {
      await this.checkSessionTimeouts();
    }, this.HEARTBEAT_INTERVAL_MS);

    console.log('💓 Started student session heartbeat monitoring');
  }

  /**
   * Check for timed-out sessions and clean them up
   */
  private async checkSessionTimeouts(): Promise<void> {
    try {
      const activeSessions = await storage.getActiveStudentSessions();
      const now = Date.now();

      for (const session of activeSessions) {
        const lastActivity = new Date(session.lastActivity).getTime();
        const timeSinceActivity = now - lastActivity;

        if (timeSinceActivity > this.SESSION_TIMEOUT_MS) {
          await this.endSession(session.sessionId, 'timeout');
          
          await structuredLogger.warn(
            `Session timeout for student ${session.studentId}`,
            'session',
            {
              sessionId: session.sessionId,
              studentId: session.studentId,
              metadata: {
                timeSinceActivity,
                sessionDuration: now - new Date(session.loginTime).getTime()
              }
            }
          );
        }
      }
    } catch (error) {
      await structuredLogger.error(
        'Failed to check session timeouts',
        'session',
        {},
        error as Error
      );
    }
  }

  /**
   * Parse user agent string for device information
   */
  private parseUserAgent(userAgent?: string): any {
    if (!userAgent) return null;

    // Simple user agent parsing for classroom deployment monitoring
    const info = {
      browser: 'unknown',
      os: 'unknown',
      device: 'unknown',
      mobile: false
    };

    // Detect browser
    if (userAgent.includes('Chrome')) info.browser = 'Chrome';
    else if (userAgent.includes('Firefox')) info.browser = 'Firefox';
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) info.browser = 'Safari';
    else if (userAgent.includes('Edge')) info.browser = 'Edge';

    // Detect OS
    if (userAgent.includes('Windows')) info.os = 'Windows';
    else if (userAgent.includes('Macintosh')) info.os = 'macOS';
    else if (userAgent.includes('Linux')) info.os = 'Linux';
    else if (userAgent.includes('Android')) info.os = 'Android';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) info.os = 'iOS';

    // Detect device type
    if (userAgent.includes('Mobile') || userAgent.includes('Android')) {
      info.device = 'mobile';
      info.mobile = true;
    } else if (userAgent.includes('iPad') || userAgent.includes('Tablet')) {
      info.device = 'tablet';
      info.mobile = true;
    } else {
      info.device = 'desktop';
    }

    return info;
  }

  /**
   * Stop session monitoring
   */
  stop(): void {
    if (this.sessionHeartbeatInterval) {
      clearInterval(this.sessionHeartbeatInterval);
      this.sessionHeartbeatInterval = null;
      console.log('💓 Stopped student session monitoring');
    }
  }
}

// Export singleton instance
export const studentSessionManager = StudentSessionManager.getInstance();