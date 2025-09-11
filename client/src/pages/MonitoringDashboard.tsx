/**
 * Real-time Monitoring Dashboard for IT Administrators
 * Provides comprehensive system visibility for classroom deployment
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Users, 
  Database, 
  Wifi, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  RefreshCw,
  Download
} from 'lucide-react';

interface SystemHealth {
  timestamp: string;
  overall: 'healthy' | 'degraded' | 'critical';
  services: any;
  systemMetrics: any;
  classroomReady: boolean;
}

interface PerformanceStats {
  timestamp: string;
  timeRangeMinutes: number;
  performance: any;
  cache: any;
  classroomOptimal: boolean;
}

interface SessionStats {
  timestamp: string;
  stats: any;
  activeSessions: any[];
  classroomActivity: any;
}

export default function MonitoringDashboard() {
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [recentErrors, setRecentErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchSystemHealth = async () => {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      setSystemHealth(data);
    } catch (error) {
      console.error('Failed to fetch system health:', error);
    }
  };

  const fetchPerformanceStats = async () => {
    try {
      const response = await fetch('/api/metrics/performance?timeRange=30');
      const data = await response.json();
      setPerformanceStats(data);
    } catch (error) {
      console.error('Failed to fetch performance stats:', error);
    }
  };

  const fetchSessionStats = async () => {
    try {
      const response = await fetch('/api/metrics/sessions');
      const data = await response.json();
      setSessionStats(data);
    } catch (error) {
      console.error('Failed to fetch session stats:', error);
    }
  };

  const fetchRecentErrors = async () => {
    try {
      const response = await fetch('/api/metrics/errors?hours=1&limit=10');
      const data = await response.json();
      setRecentErrors(data.errors || []);
    } catch (error) {
      console.error('Failed to fetch recent errors:', error);
    }
  };

  const refreshData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchSystemHealth(),
        fetchPerformanceStats(),
        fetchSessionStats(),
        fetchRecentErrors()
      ]);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to refresh data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(refreshData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const getHealthBadgeColor = (health: string) => {
    switch (health) {
      case 'healthy': return 'bg-green-500';
      case 'degraded': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'healthy': return <CheckCircle className="h-4 w-4" />;
      case 'degraded': return <AlertTriangle className="h-4 w-4" />;
      case 'critical': return <XCircle className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  if (loading && !systemHealth) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading monitoring dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6" data-testid="monitoring-dashboard">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              WordWizard Classroom Monitoring
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Real-time system health and performance monitoring for classroom deployment
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-500">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </div>
            <Button
              onClick={refreshData}
              disabled={loading}
              variant="outline"
              size="sm"
              data-testid="refresh-button"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={() => setAutoRefresh(!autoRefresh)}
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              data-testid="auto-refresh-toggle"
            >
              <Activity className="h-4 w-4 mr-2" />
              Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
            </Button>
          </div>
        </div>

        {/* System Status Overview */}
        {systemHealth && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <Card data-testid="overall-health-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overall Health</CardTitle>
                {getHealthIcon(systemHealth.overall)}
              </CardHeader>
              <CardContent>
                <Badge className={getHealthBadgeColor(systemHealth.overall)} data-testid="health-badge">
                  {systemHealth.overall.toUpperCase()}
                </Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  {systemHealth.classroomReady ? '✅ Classroom Ready' : '❌ Not Classroom Ready'}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="active-students-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Students</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="active-students-count">
                  {sessionStats?.stats.activeStudents || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {sessionStats?.stats.activeSessions || 0} active sessions
                </p>
              </CardContent>
            </Card>

            <Card data-testid="database-status-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Database</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <Badge className={systemHealth.services.database.isHealthy ? 'bg-green-500' : 'bg-red-500'}>
                  {systemHealth.services.database.isHealthy ? 'Healthy' : 'Error'}
                </Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  {systemHealth.services.database.responseTime}ms response
                </p>
              </CardContent>
            </Card>

            <Card data-testid="performance-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Performance</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <Badge className={performanceStats?.classroomOptimal ? 'bg-green-500' : 'bg-yellow-500'}>
                  {performanceStats?.classroomOptimal ? 'Optimal' : 'Suboptimal'}
                </Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  {performanceStats?.performance.apiStats.avgResponseTime}ms avg API
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Critical Alerts */}
        {systemHealth?.overall === 'critical' && (
          <Alert className="mb-6 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Critical System Alert</AlertTitle>
            <AlertDescription>
              The system is experiencing critical issues that may impact classroom functionality. 
              Please check service status and recent errors below.
            </AlertDescription>
          </Alert>
        )}

        {/* Main Dashboard Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="sessions">Student Sessions</TabsTrigger>
            <TabsTrigger value="errors">Recent Errors</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Service Status */}
              <Card data-testid="service-status-card">
                <CardHeader>
                  <CardTitle>Service Status</CardTitle>
                  <CardDescription>External service health monitoring</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {systemHealth && Object.entries(systemHealth.services.circuitBreakers.status || {}).map(([service, status]: [string, any]) => (
                    <div key={service} className="flex items-center justify-between">
                      <span className="text-sm font-medium">{service}</span>
                      <Badge className={status.state === 'CLOSED' ? 'bg-green-500' : 'bg-red-500'}>
                        {status.state}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Cache Performance */}
              <Card data-testid="cache-performance-card">
                <CardHeader>
                  <CardTitle>Cache Performance</CardTitle>
                  <CardDescription>Audio and quiz caching effectiveness</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {performanceStats && (
                    <>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Audio Cache Hit Ratio</span>
                          <span className="text-sm">{performanceStats.cache.audioCache.hitRatio}%</span>
                        </div>
                        <Progress value={performanceStats.cache.audioCache.hitRatio} />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Quiz Cache Hit Ratio</span>
                          <span className="text-sm">{performanceStats.cache.quizCache.hitRatio}%</span>
                        </div>
                        <Progress value={performanceStats.cache.quizCache.hitRatio} />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            {performanceStats && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card data-testid="api-performance-card">
                  <CardHeader>
                    <CardTitle>API Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Avg Response Time:</span>
                        <span className="font-mono">{performanceStats.performance.apiStats.avgResponseTime}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Error Rate:</span>
                        <span className="font-mono">{performanceStats.performance.apiStats.errorRate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Requests:</span>
                        <span className="font-mono">{performanceStats.performance.apiStats.requestCount}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="audio-performance-card">
                  <CardHeader>
                    <CardTitle>Audio Generation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Avg Generation Time:</span>
                        <span className="font-mono">{performanceStats.performance.audioStats.avgResponseTime}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Error Rate:</span>
                        <span className="font-mono">{performanceStats.performance.audioStats.errorRate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cache Hit Ratio:</span>
                        <span className="font-mono">{performanceStats.cache.audioCache.hitRatio}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="quiz-performance-card">
                  <CardHeader>
                    <CardTitle>Quiz Generation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Avg Generation Time:</span>
                        <span className="font-mono">{performanceStats.performance.quizStats.avgResponseTime}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Error Rate:</span>
                        <span className="font-mono">{performanceStats.performance.quizStats.errorRate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cache Hit Ratio:</span>
                        <span className="font-mono">{performanceStats.cache.quizCache.hitRatio}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="sessions" className="space-y-4">
            {sessionStats && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card data-testid="session-summary-card">
                    <CardHeader>
                      <CardTitle>Session Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Active Sessions:</span>
                          <span className="font-mono">{sessionStats.stats.activeSessions}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Active Students:</span>
                          <span className="font-mono">{sessionStats.stats.activeStudents}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Avg Session Duration:</span>
                          <span className="font-mono">{Math.round(sessionStats.stats.avgSessionDuration / 60000)}min</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="classroom-activity-card">
                    <CardHeader>
                      <CardTitle>Classroom Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>High Activity Sessions:</span>
                          <span className="font-mono">{sessionStats.classroomActivity.highActivity}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Sessions with Errors:</span>
                          <span className="font-mono">{sessionStats.classroomActivity.recentErrors}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Long Sessions (30min+):</span>
                          <span className="font-mono">{sessionStats.classroomActivity.longSessions}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="session-health-card">
                    <CardHeader>
                      <CardTitle>Session Health</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Healthy Sessions:</span>
                          <span className="font-mono text-green-600">
                            {sessionStats.activeSessions.filter((s: any) => s.errors === 0).length}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Sessions with Issues:</span>
                          <span className="font-mono text-yellow-600">
                            {sessionStats.activeSessions.filter((s: any) => s.errors > 0).length}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Active Sessions List */}
                <Card data-testid="active-sessions-list">
                  <CardHeader>
                    <CardTitle>Active Student Sessions</CardTitle>
                    <CardDescription>Real-time session monitoring for classroom debugging</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {sessionStats.activeSessions.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">No active student sessions</p>
                    ) : (
                      <div className="space-y-2">
                        {sessionStats.activeSessions.map((session: any) => (
                          <div key={session.sessionId} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center space-x-4">
                              <Users className="h-4 w-4" />
                              <div>
                                <div className="font-medium">Student {session.studentId}</div>
                                <div className="text-sm text-muted-foreground">
                                  Active for {Math.round((Date.now() - new Date(session.loginTime).getTime()) / 60000)}min
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm">
                                Activities: {session.activityCount}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Errors: {session.errors}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="errors" className="space-y-4">
            <Card data-testid="recent-errors-card">
              <CardHeader>
                <CardTitle>Recent Errors (Last Hour)</CardTitle>
                <CardDescription>Error logs for classroom debugging</CardDescription>
              </CardHeader>
              <CardContent>
                {recentErrors.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">No recent errors 🎉</p>
                ) : (
                  <div className="space-y-2">
                    {recentErrors.map((error: any, index: number) => (
                      <div key={index} className="p-3 border rounded-lg bg-red-50 dark:bg-red-900/10">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <Badge variant="destructive">{error.level}</Badge>
                              <span className="text-sm font-medium">{error.service}</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(error.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-sm mt-1">{error.message}</p>
                            {error.operation && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Operation: {error.operation}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}