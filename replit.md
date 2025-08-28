# Overview

This is a dyslexia-friendly vocabulary learning application designed specifically for a 9-year-old child with a 2e (twice-exceptional) profile. The app helps children learn 12 new vocabulary words each week using audio-first, low-visual-load practice with smart spaced-repetition review. The system prioritizes reducing cognitive load and anxiety while leveraging the child's strengths in verbal comprehension and associational fluency.

# User Preferences

Preferred communication style: Simple, everyday language.

## Branding and Design
- Company: Hugger Digital
- Logo: Bear mascot reading a book with tan/brown color scheme (prominent display on home screen)
- Color theme: Light mode only - warm tan backgrounds with dark brown/black text and accents
- Visual identity: Clean, friendly, educational focus with dyslexia-friendly design principles
- Theme preference: Light mode only, no dark backgrounds - "happy software" with positive, bright interface

# System Architecture

## Authentication Flow
- **Instructor Path**: Landing page → Replit Auth login → Instructor dashboard
- **Student Path**: Landing page → PIN entry → Student interface
- **Session Management**: Instructors use Replit Auth sessions, students use localStorage for session persistence
- **Route Protection**: Instructor routes require authentication, student routes use PIN validation

## Frontend Architecture
- **Framework**: React with TypeScript using Vite for development and build tooling
- **UI Library**: Shadcn/UI components built on Radix UI primitives for accessibility
- **Styling**: Tailwind CSS with custom dyslexia-friendly design tokens and variables
- **State Management**: TanStack Query for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Design Patterns**: Component composition with custom dyslexia-friendly button variants, generous spacing, high contrast themes, and large touch targets

## Backend Architecture
- **Runtime**: Node.js with Express server
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints with consistent JSON responses
- **Error Handling**: Centralized middleware with structured error responses
- **Development**: Hot module replacement via Vite middleware integration

## Data Storage Solutions
- **Database**: PostgreSQL (Neon Database serverless) with Drizzle ORM - IMPLEMENTED
- **Schema Management**: Type-safe schema definitions with Zod validation
- **Multi-User Schema**: Users, students, words, sentences, audio cache, attempts, schedule tables with proper relationships
- **Data Models**: 
  - Users (instructors/parents) with Replit Auth integration
  - Students with PIN authentication and instructor relationships
  - Words scoped to instructors, attempts and schedules scoped to students
- **Persistence**: All data persists across sessions with proper user isolation
- **Status**: Multi-user authentication system successfully implemented

## Authentication and Authorization
- **Instructor Authentication**: Replit Auth (OpenID Connect) with PostgreSQL session store
- **Student Authentication**: Simple 4-digit PIN system managed by instructors
- **Multi-User Architecture**: Instructors can manage multiple students, each with individual progress tracking
- **Data Isolation**: Student progress and attempts are isolated per student, words are scoped to instructors
- **COPPA Compliance**: School exception model - instructors consent for students under 13, with parent override rights

## External Service Integrations
- **Text-to-Speech**: Primary integration with ElevenLabs API for high-quality child-friendly voice synthesis, with OpenAI TTS as fallback
- **AI Services**: OpenAI GPT-4o for definition simplification, sentence generation, and morphological analysis
- **Audio Caching**: Local caching system for TTS-generated audio files to reduce API costs and improve performance

## Key Design Decisions
- **Accessibility-First**: All UI components follow dyslexia-friendly design principles including generous spacing, high contrast, large fonts, and no timing pressure
- **Audio-Centric**: Prioritizes audio feedback and interaction over text-heavy interfaces
- **Spaced Repetition**: Implements Leitner box system for intelligent review scheduling
- **Progressive Enhancement**: Works without JavaScript for core functionality
- **Performance**: Aggressive caching strategies for audio content and API responses
- **Minimal Parent Data Entry**: Parents only enter word text - AI automatically generates part of speech, definitions, morphological analysis, and example sentences
- **Bulk Processing**: Supports both single word entry and bulk word processing with comma-separated input

# External Dependencies

## Core Services
- **Neon Database**: Serverless PostgreSQL hosting for production data storage
- **ElevenLabs**: Primary TTS provider with child-friendly voice options and natural prosody
- **OpenAI**: GPT-4o model for content generation, definition simplification, and TTS fallback

## Development Tools
- **Replit**: Development environment with integrated deployment
- **Vite**: Frontend build tooling with HMR and optimization
- **Drizzle Kit**: Database schema management and migrations

## UI and Styling
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first CSS framework with custom dyslexia-friendly configuration
- **Lucide React**: Icon library for consistent visual elements

## Runtime Dependencies
- **TanStack Query**: Server state management and caching
- **React Hook Form**: Form handling with validation
- **Zod**: Runtime type validation and schema definition
- **Date-fns**: Date manipulation utilities for scheduling