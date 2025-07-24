// Type definitions
export interface ApiErrorResponse {
  message?: string;
  error?: string;
  detail?: string;
}

export interface HttpErrorResponse {
  response?: {
    data?: ApiErrorResponse;
    statusText?: string;
  };
  message?: string;
}

export type ErrorType = HttpErrorResponse | Error | string | unknown;

/**
 * Parses error messages from various error formats
 * @param error - The error object, string, or unknown type
 * @param fallbackMessage - Custom fallback message (optional)
 * @returns Parsed error message string
 */
export const parseErrorMessage = (
  error: ErrorType,
  fallbackMessage: string = "Failed to fetch data"
): string => {
  // Check common error response patterns
  const patterns: (string | null | undefined)[] = [
    // API response error patterns
    (error as HttpErrorResponse)?.response?.data?.message,
    (error as HttpErrorResponse)?.response?.data?.error,
    (error as HttpErrorResponse)?.response?.data?.detail,

    // HTTP response patterns
    (error as HttpErrorResponse)?.response?.statusText,

    // Standard Error object
    (error as Error)?.message,

    // toString method fallback
    (error as any)?.toString?.(),

    // Direct string error
    typeof error === "string" ? error : null,
  ];

  // Return the first non-empty message found
  const foundMessage = patterns.find(
    (msg) => msg && typeof msg === "string" && msg.trim().length > 0
  );

  return foundMessage || fallbackMessage;
};
