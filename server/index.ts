import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { metricsCollector } from "./services/metricsCollector.js";
import { structuredLogger } from "./services/structuredLogger.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Enhanced observability middleware with metrics collection and structured logging
app.use((req: any, res, next) => {
  const start = Date.now();
  const path = req.path;
  const method = req.method;
  
  // Generate correlation ID for request tracing
  const correlationId = structuredLogger.generateCorrelationId();
  req.correlationId = correlationId;
  req.requestStart = start;

  // Extract user context for logging
  const userId = req.user?.claims?.sub;
  const studentId = req.session?.studentId;
  const sessionId = req.session?.id || req.sessionID;
  const userAgent = req.get('user-agent');
  const ipAddress = req.ip || req.connection?.remoteAddress;

  let capturedJsonResponse: Record<string, any> | undefined = undefined;
  let requestBodySize = 0;
  let responseBodySize = 0;

  // Capture request body size
  if (req.headers['content-length']) {
    requestBodySize = parseInt(req.headers['content-length'], 10);
  }

  // Set correlation ID header early, before response is sent
  if (path.startsWith("/api") && correlationId) {
    res.setHeader('X-Correlation-Id', correlationId);
  }

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    // Estimate response size
    responseBodySize = JSON.stringify(bodyJson).length;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", async () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    // Log to console for immediate visibility - PRIVACY: Only log status/timing, never response data
    if (path.startsWith("/api")) {
      // SECURE LOGGING: Only log method, path, status, and timing - no response bodies to protect student privacy
      const logLine = `${method} ${path} ${statusCode} in ${duration}ms`;
      log(logLine);
    }

    // Enhanced observability logging and metrics collection
    if (path.startsWith("/api") && !path.includes("/metrics")) { // Don't track metrics endpoints
      try {
        // Record API performance metrics
        await metricsCollector.recordApiMetric(method, path, statusCode, duration, {
          payloadSize: requestBodySize,
          responseSize: responseBodySize,
          userId,
          studentId,
          correlationId
        });

        // Structured logging for API requests
        // PRIVACY-SANITIZED: Log API requests without sensitive data
        await structuredLogger.logApiRequest(method, path, statusCode, duration, {
          correlationId,
          sessionId: sessionId ? '[REDACTED]' : undefined, // Redact session IDs
          userId: userId ? '[REDACTED]' : undefined, // Redact user IDs
          studentId: studentId ? '[REDACTED]' : undefined, // Redact student IDs
          userAgent: userAgent ? userAgent.substring(0, 50) + '...' : undefined, // Truncate user agent
          ipAddress: '[REDACTED]', // Always redact IP addresses for student privacy
          metadata: {
            requestSize: requestBodySize,
            responseSize: responseBodySize,
            hasRequestBody: requestBodySize > 0,
            hasResponseBody: responseBodySize > 0
          }
        });

        // Log errors with additional context
        if (statusCode >= 400) {
          // PRIVACY-SANITIZED: Log API errors without sensitive data
          await structuredLogger.error(
            `API Error: ${method} ${path} returned ${statusCode}`,
            'api',
            {
              correlationId,
              sessionId: sessionId ? '[REDACTED]' : undefined,
              userId: userId ? '[REDACTED]' : undefined,
              studentId: studentId ? '[REDACTED]' : undefined,
              httpMethod: method,
              httpPath: path,
              httpStatus: statusCode,
              userAgent: userAgent ? userAgent.substring(0, 50) + '...' : undefined,
              ipAddress: '[REDACTED]', // Always redact IP for student privacy
              metadata: {
                responseTime: duration,
                hasErrorResponse: !!capturedJsonResponse,
                errorType: capturedJsonResponse?.message ? 'user_error' : 'system_error'
                // PRIVACY: Never log actual error response content
              }
            }
          );
        }
      } catch (error) {
        console.error('Failed to record observability data:', error);
        // Don't throw - observability should not break requests
      }
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
