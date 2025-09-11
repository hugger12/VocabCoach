import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    name: 'sessionId', // Don't use default connect.sid name
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Secure in production, allow HTTP in dev
      sameSite: 'strict', // CSRF protection
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  for (const domain of process.env
    .REPLIT_DOMAINS!.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

// Student authentication middleware - validates server-side student sessions
export const isStudentAuthenticated: RequestHandler = async (req, res, next) => {
  try {
    const session = req.session as any;
    
    // Check if student session exists and has required data
    if (!session?.student || !session?.studentId) {
      return res.status(401).json({ message: "Student authentication required" });
    }

    // Validate that the student record is still active
    const student = await storage.getStudent(session.studentId);
    if (!student || !student.isActive) {
      // Clear invalid session
      delete session.student;
      delete session.studentId;
      return res.status(401).json({ message: "Student account inactive or not found" });
    }

    // Attach validated student data to request for downstream use
    (req as any).student = student;
    (req as any).instructorId = student.instructorId;
    
    return next();
  } catch (error) {
    console.error("Student authentication error:", error);
    return res.status(500).json({ message: "Authentication failed" });
  }
};

// Combined middleware for routes that can be accessed by both instructors and students
export const isInstructorOrStudentAuthenticated: RequestHandler = async (req, res, next) => {
  // Try instructor authentication first
  if (req.isAuthenticated() && req.user) {
    const user = req.user as any;
    if (user.expires_at) {
      const now = Math.floor(Date.now() / 1000);
      if (now <= user.expires_at) {
        // Valid instructor session
        (req as any).userType = 'instructor';
        (req as any).instructorId = user.claims.sub;
        return next();
      }
      
      // Try to refresh instructor token
      const refreshToken = user.refresh_token;
      if (refreshToken) {
        try {
          const config = await getOidcConfig();
          const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
          updateUserSession(user, tokenResponse);
          (req as any).userType = 'instructor';
          (req as any).instructorId = user.claims.sub;
          return next();
        } catch (error) {
          // Fall through to try student authentication
        }
      }
    }
  }

  // Try student authentication
  try {
    const session = req.session as any;
    if (session?.student && session?.studentId) {
      const student = await storage.getStudent(session.studentId);
      if (student && student.isActive) {
        (req as any).userType = 'student';
        (req as any).student = student;
        (req as any).instructorId = student.instructorId;
        return next();
      }
    }
  } catch (error) {
    console.error("Authentication error:", error);
  }

  return res.status(401).json({ message: "Authentication required" });
};