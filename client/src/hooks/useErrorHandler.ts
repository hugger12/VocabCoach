/**
 * Enhanced Error Handling Hook for User-Friendly Error Messages
 * Provides comprehensive error handling with appropriate messages for students vs teachers
 */

import { useToast } from '@/hooks/use-toast';
import { APIError, NetworkError, TimeoutError } from '@/lib/queryClient';

export type UserRole = 'student' | 'teacher';

export interface ErrorHandlerOptions {
  role?: UserRole;
  showToast?: boolean;
  customMessage?: string;
  context?: string;
}

export function useErrorHandler() {
  const { toast } = useToast();

  const getErrorMessage = (error: unknown, role: UserRole = 'student'): string => {
    // Handle our custom error types
    if (error instanceof TimeoutError) {
      return role === 'student'
        ? "The request is taking longer than expected. Please check your internet connection and try again."
        : `Request timed out. Check network connectivity and try again.`;
    }

    if (error instanceof NetworkError) {
      return role === 'student'
        ? "Having trouble connecting. Please check your internet and try again."
        : `Network error: ${error.message}. Check internet connection.`;
    }

    if (error instanceof APIError) {
      // Handle specific HTTP status codes
      switch (error.status) {
        case 401:
          return "Please log in again to continue.";
        case 403:
          return role === 'student'
            ? "You don't have permission for this action. Please ask your teacher for help."
            : "Access denied. Check your permissions.";
        case 429:
          return role === 'student'
            ? "The system is busy right now. Please wait a moment and try again."
            : "Rate limit exceeded. Please wait before trying again.";
        case 500:
        case 502:
        case 503:
        case 504:
          return role === 'student'
            ? "We're having technical difficulties. Please try again in a few minutes."
            : `Server error (${error.status}): ${error.message}`;
        default:
          return role === 'student'
            ? "Something went wrong. Please try again or ask your teacher for help."
            : `Error (${error.status}): ${error.message}`;
      }
    }

    // Handle generic errors
    const message = error instanceof Error ? error.message : String(error);
    
    // Handle degraded service responses with specific user-friendly messages
    if ((error as any).degraded && (error as any).fallbackMessage) {
      const fallbackMessage = (error as any).fallbackMessage;
      return role === 'student' ? fallbackMessage : `Service degraded: ${fallbackMessage}`;
    }
    
    // Check for common error patterns
    if (message.includes('circuit breaker') || message.includes('service unavailable')) {
      return role === 'student'
        ? "Some features are temporarily unavailable. Please try again later."
        : "External service unavailable. Circuit breaker activated.";
    }

    if (message.includes('rate limit') || message.includes('too many requests')) {
      return role === 'student'
        ? "Please wait a moment before trying again."
        : "Rate limit exceeded. Retrying with backoff.";
    }

    // Generic fallback
    return role === 'student'
      ? "Something went wrong. Please try again or ask your teacher for help."
      : `Error: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`;
  };

  const handleError = (error: unknown, options: ErrorHandlerOptions = {}) => {
    const {
      role = 'student',
      showToast = true,
      customMessage,
      context = ''
    } = options;

    const errorMessage = customMessage || getErrorMessage(error, role);
    
    // Log error for debugging (in development)
    if (process.env.NODE_ENV === 'development') {
      console.error(`Error ${context ? `in ${context}` : ''}:`, error);
    }

    // Show toast notification if requested
    if (showToast) {
      // Check for degraded services
      const isDegraded = (error as any).degraded;
      const audioUnavailable = (error as any).audioUnavailable;
      
      toast({
        title: isDegraded ? "Service Notice" : (role === 'student' ? "Oops!" : "Error"),
        description: errorMessage,
        variant: isDegraded ? "default" : "destructive", // Less severe styling for degraded services
        duration: isDegraded ? 5000 : undefined, // Longer duration for service notices
      });
      
      // Log degradation info for debugging
      if (isDegraded) {
        console.log('Service degraded:', {
          errorMessage,
          audioUnavailable,
          retryAfter: (error as any).retryAfter
        });
      }
    }

    return errorMessage;
  };

  const isRetryableError = (error: unknown): boolean => {
    if (error instanceof APIError || error instanceof NetworkError || error instanceof TimeoutError) {
      return error.isRetryable;
    }
    
    // Default to retryable for unknown errors
    return true;
  };

  const getRetryMessage = (error: unknown, role: UserRole = 'student'): string => {
    if (!isRetryableError(error)) {
      return role === 'student'
        ? "This error cannot be automatically retried. Please ask your teacher for help."
        : "Error is not retryable. Manual intervention required.";
    }

    return role === 'student'
      ? "We'll keep trying to fix this automatically."
      : "Error is retryable. Automatic retry in progress.";
  };

  return {
    handleError,
    getErrorMessage,
    isRetryableError,
    getRetryMessage
  };
}