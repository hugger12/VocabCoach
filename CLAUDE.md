# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VocabCoach is a dyslexia-friendly vocabulary learning application for children with 2e (twice-exceptional) profiles. The app uses audio-first, low-visual-load practice with spaced-repetition review to help children learn vocabulary words weekly.

**Key Design Principles:**
- Dyslexia-friendly UI (generous spacing, high contrast, large fonts, no timing pressure)
- Audio-centric interaction over text-heavy interfaces
- Multi-user architecture with data isolation between instructors and students
- Production-grade resilience and observability for classroom deployment

## Development Commands

```bash
# Development
npm run dev          # Start development server with hot reload (port 5000)

# Building
npm run build        # Build frontend (Vite) + backend (esbuild)
npm run check        # TypeScript type checking (run before committing)

# Production
npm start            # Start production server (NODE_ENV=production)

# Database
npm run db:push      # Push Drizzle schema changes to database
```

## Architecture Overview

### Tech Stack
- **Frontend**: React + TypeScript, Vite, Wouter (routing), TanStack Query (server state), Shadcn/UI + Radix UI
- **Backend**: Express + TypeScript (ES modules), PostgreSQL (Neon serverless), Drizzle ORM
- **External Services**: OpenAI GPT-4o (content generation, TTS fallback), ElevenLabs (primary TTS)
- **Caching**: Redis (distributed rate limiting, optional), file system + database (audio cache)

### Dual Authentication System

**Critical**: The app has TWO distinct user types with different auth flows:

1. **Instructors** ([server/replitAuth.ts](server/replitAuth.ts))
   - Replit Auth (OpenID Connect) with PostgreSQL session store
   - Routes protected by `isAuthenticated` middleware
   - Full access to dashboard, word management, student progress

2. **Students** ([server/replitAuth.ts](server/replitAuth.ts))
   - 4-digit PIN authentication (no passwords, COPPA-compliant)
   - Routes protected by `isStudentAuthenticated` middleware
   - Access to practice words and quizzes only
   - Session stored in `req.session.studentId`

**Data Isolation**: All database queries MUST filter by `instructorId` or `studentId` to prevent data leakage between users.

### Database Schema ([shared/schema.ts](shared/schema.ts))

**Core entities:**
- `users` - Instructors/parents (Replit Auth)
- `students` - Children with PINs, linked to instructors
- `vocabularyLists` - Named collections of words (one "current" per instructor)
- `words` - Vocabulary words, scoped to instructor + optional list
- `sentences` - Example sentences for words (AI-generated or user-provided)
- `attempts` - Student practice attempts (scoped to student + word)
- `schedule` - Leitner box spaced repetition (scoped to student + word)

**Quiz system:**
- `clozeQuestions` - Dual-sentence fill-in-the-blank questions
- `passageQuestions` + `passageBlanks` - Reading passages with multiple blanks
- `quizCache` + `quizQuestions` - Pre-generated quiz variants for instant loading

**Observability tables:**
- `performanceMetrics` - API response times, cache hits
- `structuredLogs` - Correlation-based request tracing
- `systemHealthMetrics` - Overall system health snapshots
- `studentSessions` - Student session tracking for debugging

**Important indexes:**
- Most tables have composite indexes for common query patterns
- Audio cache has content-based deduplication using SHA-256 hashes
- Always use indexed fields in WHERE clauses for performance

### Service Layer Architecture

All external service calls go through resilience wrappers in [server/services/](server/services/):

- **[ai.ts](server/services/ai.ts)** - OpenAI GPT-4o integration (definitions, sentences, morphology)
- **[tts.ts](server/services/tts.ts)** - ElevenLabs primary, OpenAI fallback
- **[circuitBreakerManager.ts](server/services/circuitBreakerManager.ts)** - Circuit breakers for external services
- **[gracefulDegradation.ts](server/services/gracefulDegradation.ts)** - Fallback strategies when services fail
- **[errorRecovery.ts](server/services/errorRecovery.ts)** - Retry logic and error handling
- **[databaseResilience.ts](server/services/databaseResilience.ts)** - Database connection pooling and health checks
- **[metricsCollector.ts](server/services/metricsCollector.ts)** - Performance metrics collection
- **[structuredLogger.ts](server/services/structuredLogger.ts)** - Privacy-focused logging with correlation IDs
- **[studentSessionManager.ts](server/services/studentSessionManager.ts)** - Student session lifecycle tracking
- **[quizPreGeneration.ts](server/services/quizPreGeneration.ts)** - Background quiz generation for instant loading
- **[rateLimit.ts](server/services/rateLimit.ts)** - Redis-based distributed rate limiting with fallback
- **[scheduler.ts](server/services/scheduler.ts)** - Leitner box spaced repetition algorithm

**Pattern**: When adding new external service integrations, wrap them with circuit breakers and graceful degradation.

### Audio Caching System

Audio is cached in TWO places:
1. **File System**: [server/audio-cache/](server/audio-cache/) - Persistent MP3 files
2. **Database**: `audioCache` table - Metadata, cache keys, content hashes

**Cache key format**: `{provider}:{type}:{contentHash}` where contentHash is SHA-256 of normalized text.

**Deduplication**: Content-based hashing prevents storing duplicate audio for same text across different words/sentences.

**Cleanup**: Track `hitCount` and `lastAccessedAt` for cache eviction policies.

### Quiz Generation & Caching

Quizzes have two modes:
1. **On-demand** (legacy): Generate quiz when student requests it
2. **Pre-generated** (current): Background worker pre-generates 3 variants per list

**Pre-generation benefits:**
- Instant quiz loading (no 10-20s wait)
- Consistent quiz quality
- Reduced API costs (cached, not regenerated)

**Implementation**: [server/services/quizPreGeneration.ts](server/services/quizPreGeneration.ts) generates variants when:
- Instructor creates/updates a vocabulary list
- List is set as "current"
- Cache expires or is invalidated

### Observability System

**Correlation IDs**: Every API request gets a unique `correlationId` for tracing across services/logs.

**Request flow**:
1. Middleware generates `correlationId` ([server/index.ts](server/index.ts))
2. Set in `req.correlationId` and `X-Correlation-Id` header
3. Passed to all service calls
4. Logged in `performanceMetrics` and `structuredLogs` tables

**Privacy**: Logs redact sensitive data (PINs, session IDs, IP addresses) - see [server/index.ts:75-114](server/index.ts#L75-L114).

**Monitoring endpoints** (instructor-only, see [server/routes.ts:41-188](server/routes.ts#L41-L188)):
- `GET /api/health` - Overall system health
- `GET /api/metrics/performance` - API response times, cache effectiveness
- `GET /api/metrics/sessions` - Active student sessions
- `GET /api/metrics/history` - Health trends over time
- `GET /api/metrics/trace/:correlationId` - Request tracing

### Rate Limiting

Student login uses distributed rate limiting to prevent PIN brute-forcing:
- **Default**: 5 attempts per IP per 15 minutes
- **Redis mode**: Shared limits across server instances (production)
- **Fallback mode**: In-memory limits per server (development)

**Configuration**: See [REDIS_DEPLOYMENT.md](REDIS_DEPLOYMENT.md) for Redis setup.

## Key Patterns & Conventions

### Frontend Routing ([client/src/App.tsx](client/src/App.tsx))

```
/ → Landing (unauthenticated) OR InstructorDashboard (authenticated)
/student-login → PIN entry
/student → Student interface (practice/quiz)
/instructor/students → Manage students
/instructor/words → Manage vocabulary
/instructor/progress → View student progress
/monitoring → System observability dashboard
```

### API Middleware Chain

```
Request
  → Correlation ID generation (server/index.ts)
  → Session handling (express-session + Replit Auth)
  → Auth middleware (isAuthenticated / isStudentAuthenticated)
  → Rate limiting (student login only)
  → Route handler
  → Metrics collection
  → Structured logging
Response
```

### Storage Layer ([server/storage.ts](server/storage.ts))

**Pattern**: Database operations abstracted into a `storage` object with methods like:
- `getWordsByInstructor(instructorId)` - Always scoped to instructor
- `getStudentProgress(studentId)` - Always scoped to student
- `createWord(data)` - Validates and inserts

**Critical**: Never write raw Drizzle queries in route handlers. Add storage methods instead.

### Error Handling

- **API errors**: Use structured error responses with `message` field
- **Service failures**: Circuit breakers handle repeated failures, graceful degradation provides fallbacks
- **Database errors**: Retry logic in `databaseResilience` service
- **Logging**: All errors logged with correlation IDs and context

### Privacy & Security

- **Student data**: Never log student responses, only metadata (counts, timings)
- **PINs**: Never log PINs in plaintext
- **IP addresses**: Redacted in logs as `[REDACTED]`
- **Session IDs**: Redacted in logs as `[REDACTED]`
- **COPPA compliance**: School exception model, instructors consent for students <13

## Common Development Workflows

### Adding a New Vocabulary List

1. Instructor creates list via `POST /api/vocabulary-lists`
2. System sets `isCurrent: true` and marks other lists as false
3. Background job pre-generates quiz variants
4. Students see new list automatically

### Adding a New Word

1. **Simple input**: Instructor provides just word text
2. **AI processing**: GPT-4o generates part of speech, definitions, morphemes, syllables
3. **Sentence generation**: GPT-4o creates example sentences
4. **Audio pre-caching**: TTS generates audio for word + sentences
5. **Quiz invalidation**: Quiz cache cleared for affected list

### Student Practice Session

1. Student logs in via PIN (`POST /api/student-login`)
2. Fetch current vocabulary list (`GET /api/vocabulary-lists/current`)
3. Load study session (`GET /api/study/session`) - returns due words
4. For each word:
   - Fetch audio (`POST /api/audio/generate` - hits cache)
   - Student practices
   - Submit attempt (`POST /api/practice/attempt`)
   - Update schedule (Leitner box logic)
5. Logout (`POST /api/student/logout`)

### Taking a Quiz

1. Fetch pre-generated quiz (`GET /api/quiz/cached/:listId`)
2. Display questions (cloze + passage)
3. Student answers
4. Submit answers (tracked in `quizAttempts` table)
5. Show results

## Important Files to Know

- [server/routes.ts](server/routes.ts) - All API endpoints (large file, use grep/search)
- [server/storage.ts](server/storage.ts) - Database query layer
- [shared/schema.ts](shared/schema.ts) - Database schema + types
- [server/replitAuth.ts](server/replitAuth.ts) - Authentication setup and middleware
- [client/src/App.tsx](client/src/App.tsx) - Frontend routing
- [replit.md](replit.md) - Detailed architecture documentation (READ THIS for full context)

## Testing & Debugging

- **Type checking**: Always run `npm run check` before commits
- **Logs**: Check console for correlation IDs, trace requests end-to-end
- **Health checks**: Monitor `/api/health` endpoint during development
- **Rate limiting**: Test student login with multiple rapid requests
- **Audio cache**: Check `/api/audio/cache/stats` for cache hit ratios

## Deployment Notes

- Runs on Replit with Neon PostgreSQL
- Production uses Redis for distributed rate limiting (optional, graceful fallback)
- Audio files stored in persistent file system ([server/audio-cache/](server/audio-cache/))
- Environment variables required: `DATABASE_URL`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`
- Optional: `REDIS_URL` for distributed rate limiting
- Single port (5000) serves both API and frontend
