import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Enhanced error types for better error handling
export class APIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly isNetworkError: boolean = false,
    public readonly isRetryable: boolean = true
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export class NetworkError extends APIError {
  constructor(message: string = 'Network connection failed') {
    super(message, 0, 'Network Error', true, true);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends APIError {
  constructor(message: string = 'Request timed out') {
    super(message, 408, 'Timeout', false, true);
    this.name = 'TimeoutError';
  }
}

// Enhanced throwIfResNotOk with graceful degradation support
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let responseData: any;
    const text = (await res.text()) || res.statusText;
    
    // Try to parse JSON response for degradation info
    try {
      responseData = JSON.parse(text);
    } catch {
      responseData = { message: text };
    }
    
    const isRetryable = res.status >= 500 || res.status === 429 || res.status === 408;
    
    // Create enhanced APIError with degradation information
    const error = new APIError(
      responseData.message || text,
      res.status,
      res.statusText,
      false,
      isRetryable
    );
    
    // Attach degradation metadata if available
    if (responseData.degraded) {
      (error as any).degraded = true;
      (error as any).fallbackMessage = responseData.fallbackMessage;
      (error as any).retryAfter = responseData.retryAfter;
      (error as any).audioUnavailable = responseData.audioUnavailable;
    }
    
    throw error;
  }
}

// Enhanced apiRequest with timeout and better error handling
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  timeoutMs: number = 8000 // Default 8 second timeout for frontend requests
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TimeoutError(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new NetworkError(`Network error for ${url}: ${error.message}`);
    }
    
    throw error;
  }
}

// Retry condition for React Query
function shouldRetry(failureCount: number, error: unknown): boolean {
  // Don't retry more than 3 times
  if (failureCount >= 3) return false;
  
  // Don't retry 4xx errors (except 408 timeout and 429 rate limit)
  if (error instanceof APIError) {
    return error.isRetryable;
  }
  
  // Retry network errors and timeout errors
  if (error instanceof NetworkError || error instanceof TimeoutError) {
    return true;
  }
  
  return false;
}

// Enhanced retry delay with exponential backoff
function getRetryDelay(failureCount: number): number {
  const baseDelay = 1000; // 1 second base delay
  const maxDelay = 5000; // Maximum 5 seconds
  const jitter = Math.random() * 500; // Add up to 500ms jitter
  
  return Math.min(baseDelay * Math.pow(2, failureCount - 1) + jitter, maxDelay);
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
  timeoutMs?: number;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior, timeoutMs = 8000 }) =>
  async ({ queryKey }) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(queryKey.join("/") as string, {
        credentials: "include",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TimeoutError(`Query ${queryKey.join("/")} timed out after ${timeoutMs}ms`);
      }
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new NetworkError(`Network error for query ${queryKey.join("/")}: ${error.message}`);
      }
      
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true, // Refetch when user switches back to the app
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: shouldRetry,
      retryDelay: getRetryDelay,
      // Enhanced error handling for better UX
      refetchOnReconnect: true,
      networkMode: 'online', // Only run queries when online
    },
    mutations: {
      retry: shouldRetry,
      retryDelay: getRetryDelay,
      networkMode: 'online',
    },
  },
});
