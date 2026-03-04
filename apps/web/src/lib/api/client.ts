/**
 * API Client
 * 
 * Single entrypoint for all API calls to Gateway.
 * Handles:
 * - Bearer token attachment
 * - Request ID pass-through
 * - Auto-refresh on 401
 * - Standardized error parsing
 */

import type { ApiResponse } from '@/types/api';

// Token storage (in-memory for security)
let accessToken: string | null = null;

// API base URL from env
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Request ID header pass-through
function getRequestId(): string {
  if (typeof window !== 'undefined') {
    return (window as any).__requestId || crypto.randomUUID();
  }
  return crypto.randomUUID();
}

/**
 * Set access token (called after login/refresh)
 */
export function setAccessToken(token: string | null) {
  accessToken = token;
}

/**
 * Get current access token
 */
export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * API Error class
 */
export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, any>;
  requestId: string;

  constructor(
    status: number,
    code: string,
    message: string,
    requestId: string,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

/**
 * Parse API error response
 */
function parseError(response: Response, data: any, requestId: string): ApiError {
  const status = response.status;
  const code = data?.error?.code || `HTTP_${status}`;
  const message = data?.error?.message || response.statusText || 'Unknown error';
  const details = data?.error?.details;

  return new ApiError(status, code, message, requestId, details);
}

/**
 * Refresh access token
 * Returns true if refresh succeeded
 */
async function refreshToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // HttpOnly cookie
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': getRequestId(),
      },
    });

    if (!response.ok) {
      return false;
    }

    const data: ApiResponse<{ access_token: string }> = await response.json();

    if (data.success && data.data?.access_token) {
      setAccessToken(data.data.access_token);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Core fetch wrapper with retry logic
 */
async function apiFetch<T>(
  method: string,
  path: string,
  body?: any,
  options?: {
    skipAuth?: boolean;
    retries?: number;
  }
): Promise<T> {
  const { skipAuth = false, retries = 1 } = options || {};
  const requestId = getRequestId();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
  };

  // Attach bearer token if available
  if (!skipAuth && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    credentials: 'include', // For refresh token cookie
  };

  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  let response = await fetch(`${API_BASE_URL}${path}`, fetchOptions);

  // Handle 401 - try refresh once
  if (response.status === 401 && retries > 0 && !skipAuth) {
    const refreshed = await refreshToken();

    if (refreshed && accessToken) {
      // Retry with new token
      headers['Authorization'] = `Bearer ${accessToken}`;
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...fetchOptions,
        headers,
      });
    } else {
      // Refresh failed - clear token and throw
      setAccessToken(null);
      throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired. Please login again.', requestId);
    }
  }

  // Parse response
  const data: ApiResponse<T> = await response.json();

  // Handle error responses
  if (!response.ok || !data.success) {
    throw parseError(response, data, requestId);
  }

  return data.data as T;
}

/**
 * GET request
 */
export async function apiGet<T>(path: string, params?: Record<string, any>): Promise<T> {
  let url = path;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  return apiFetch<T>('GET', url);
}

/**
 * POST request
 */
export async function apiPost<T>(path: string, body?: any): Promise<T> {
  return apiFetch<T>('POST', path, body);
}

/**
 * PUT request
 */
export async function apiPut<T>(path: string, body?: any, options?: { ifMatch?: number }): Promise<T> {
  const headers: Record<string, string> = {};
  if (options?.ifMatch !== undefined) {
    // For optimistic concurrency
  }
  return apiFetch<T>('PUT', path, body);
}

/**
 * DELETE request
 */
export async function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>('DELETE', path);
}

/**
 * Login helper
 */
export async function login(email: string, password: string): Promise<{ user: any; access_token: string }> {
  const response = await apiPost<{ user: any; access_token: string }>('/auth/login', {
    email,
    password,
  });
  
  return response;
}

/**
 * Logout helper
 */
export async function logout(): Promise<void> {
  try {
    await apiPost('/auth/logout');
  } finally {
    setAccessToken(null);
  }
}

/**
 * Get current user
 */
export async function getCurrentUser(): Promise<any> {
  return apiGet('/auth/me');
}

// Export error class for components
export { ApiError as default };
