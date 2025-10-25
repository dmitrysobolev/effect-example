/**
 * Enhanced Error Handling Patterns
 *
 * This module demonstrates advanced error handling patterns in Effect:
 * - Error logging with tapError
 * - Error recovery strategies beyond fail-fast
 * - Error aggregation in concurrent operations
 * - Error context enrichment
 * - Timeout error handling patterns
 */

import { Effect, Console, pipe, Duration, Data, Exit } from "effect"

// ============================================================================
// Error Type Definitions
// ============================================================================

export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly message: string
  readonly statusCode?: number
  readonly retryable: boolean
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string
  readonly field?: string
  readonly value?: unknown
}> {}

export class TimeoutError extends Data.TaggedError("TimeoutError")<{
  readonly message: string
  readonly timeoutMs: number
  readonly operation: string
}> {}

export class AggregateError extends Data.TaggedError("AggregateError")<{
  readonly message: string
  readonly errors: ReadonlyArray<Error>
  readonly successCount: number
  readonly failureCount: number
}> {}

// ============================================================================
// 1. Error Logging with tapError
// ============================================================================

/**
 * Logs errors without modifying the error channel
 * Useful for monitoring and debugging while preserving error flow
 */
export const logError = <E extends { _tag: string; message: string }>(
  context: string
) => (error: E): Effect.Effect<void> =>
  Console.log(`[ERROR] ${context}: ${error._tag} - ${error.message}`)

/**
 * Example: Fetch operation with comprehensive error logging
 */
export const fetchWithLogging = (url: string): Effect.Effect<string, NetworkError> =>
  pipe(
    simulateApiCall(url),
    Effect.tap((data) => Console.log(`Successfully fetched: ${url}`)),
    Effect.tapError((error) =>
      Console.log(`[ERROR] Failed to fetch ${url}: ${error.message} (Status: ${error.statusCode})`)
    ),
    Effect.tapError((error) =>
      // Could send to error tracking service here
      Console.log(`[TELEMETRY] Logging error to monitoring service...`)
    )
  )

/**
 * Detailed error logging with cause information
 */
export const fetchWithDetailedLogging = (url: string): Effect.Effect<string, NetworkError> =>
  pipe(
    simulateApiCall(url),
    Effect.tapErrorCause((cause) =>
      Console.log(`[DETAILED ERROR] Cause: ${JSON.stringify(cause)}`)
    ),
    Effect.tapError((error) =>
      Effect.sync(() => {
        // Could integrate with external logging service
        const errorLog = {
          timestamp: new Date().toISOString(),
          url,
          error: error._tag,
          message: error.message,
          statusCode: error.statusCode,
          retryable: error.retryable
        }
        console.log('[STRUCTURED LOG]', JSON.stringify(errorLog))
      })
    )
  )

// ============================================================================
// 2. Error Recovery Strategies Beyond Fail-Fast
// ============================================================================

/**
 * Fallback Chain: Try multiple strategies in order until one succeeds
 */
export const fetchWithFallbackChain = <E>(
  url: string
): Effect.Effect<string, E> =>
  pipe(
    // Try primary source
    simulateApiCall(url),
    // Fallback 1: Try cache
    Effect.orElse(() =>
      pipe(
        Console.log("Primary failed, trying cache..."),
        Effect.flatMap(() => fetchFromCache(url))
      )
    ),
    // Fallback 2: Try backup server
    Effect.orElse(() =>
      pipe(
        Console.log("Cache failed, trying backup server..."),
        Effect.flatMap(() => simulateApiCall(`backup.${url}`))
      )
    ),
    // Fallback 3: Return default data
    Effect.orElse(() =>
      Effect.gen(function* () {
        yield* Console.log("All sources failed, using default data")
        return "Default fallback data"
      })
    )
  )

/**
 * Partial Success Strategy: Continue processing even if some operations fail
 * Returns both successful results and failures
 */
export const fetchMultipleWithPartialSuccess = (
  urls: ReadonlyArray<string>
): Effect.Effect<{
  successes: ReadonlyArray<{ url: string; data: string }>
  failures: ReadonlyArray<{ url: string; error: NetworkError }>
}, never> =>
  pipe(
    Effect.forEach(
      urls,
      (url) =>
        pipe(
          simulateApiCall(url),
          Effect.map((data) => ({ url, data, success: true as const })),
          Effect.catchAll((error) =>
            Effect.succeed({ url, error, success: false as const })
          )
        ),
      { concurrency: "unbounded" }
    ),
    Effect.map((results) => ({
      successes: results.filter((r) => r.success).map(r => ({ url: r.url, data: (r as any).data })),
      failures: results.filter((r) => !r.success).map(r => ({ url: r.url, error: (r as any).error }))
    }))
  )

/**
 * Retry with Degraded Mode: After retries exhausted, switch to degraded functionality
 */
export const fetchWithDegradedMode = (
  url: string
): Effect.Effect<{ data: string; mode: "full" | "degraded" }, never> =>
  pipe(
    simulateApiCall(url),
    Effect.retry({ times: 3 }),
    Effect.map((data) => ({ data, mode: "full" as const })),
    Effect.catchAll((error) =>
      pipe(
        Console.log(`All retries failed: ${error.message}. Entering degraded mode.`),
        Effect.flatMap(() =>
          Effect.succeed({
            data: "Cached/Limited data",
            mode: "degraded" as const
          })
        )
      )
    )
  )

/**
 * Circuit Breaker Pattern: Stop trying after repeated failures
 */
export const makeCircuitBreaker = <A, E>(
  effect: Effect.Effect<A, E>,
  threshold: number,
  resetAfter: Duration.Duration
) => {
  let failureCount = 0
  let lastFailureTime = 0
  let isOpen = false

  return Effect.suspend(() => {
    const now = Date.now()

    // Reset circuit if enough time has passed
    if (isOpen && now - lastFailureTime > Duration.toMillis(resetAfter)) {
      isOpen = false
      failureCount = 0
      return pipe(
        Console.log("[CIRCUIT BREAKER] Half-open, attempting request..."),
        Effect.flatMap(() => effect),
        Effect.tap(() => Effect.sync(() => { failureCount = 0 })),
        Effect.tapError(() =>
          Effect.sync(() => {
            failureCount++
            lastFailureTime = now
            if (failureCount >= threshold) {
              isOpen = true
            }
          })
        )
      )
    }

    // Circuit is open, fail fast
    if (isOpen) {
      return pipe(
        Console.log("[CIRCUIT BREAKER] Circuit open, failing fast"),
        Effect.flatMap(() =>
          Effect.fail(
            new NetworkError({
              message: "Circuit breaker is open",
              statusCode: 503,
              retryable: false
            }) as E
          )
        )
      )
    }

    // Circuit is closed, try the operation
    return pipe(
      effect,
      Effect.tap(() => Effect.sync(() => { failureCount = 0 })),
      Effect.tapError(() =>
        Effect.sync(() => {
          failureCount++
          lastFailureTime = now
          if (failureCount >= threshold) {
            isOpen = true
          }
        })
      )
    )
  })
}

// ============================================================================
// 3. Error Aggregation in Concurrent Operations
// ============================================================================

/**
 * Collect All Errors: When processing multiple items, collect all errors
 * instead of failing on the first one
 */
export const validateAllWithAggregation = (
  items: ReadonlyArray<{ id: number; value: string }>
): Effect.Effect<
  ReadonlyArray<{ id: number; value: string }>,
  AggregateError
> =>
  pipe(
    Effect.forEach(
      items,
      (item) =>
        pipe(
          validateItem(item),
          Effect.map((validItem) => ({ result: validItem, error: null })),
          Effect.catchAll((error) =>
            Effect.succeed({ result: null, error })
          )
        ),
      { concurrency: "unbounded" }
    ),
    Effect.flatMap((results) => {
      const successes = results.filter((r) => r.result !== null).map((r) => r.result!)
      const failures = results.filter((r) => r.error !== null).map((r) => r.error!)

      if (failures.length > 0) {
        return Effect.fail(
          new AggregateError({
            message: `Validation failed for ${failures.length} items`,
            errors: failures,
            successCount: successes.length,
            failureCount: failures.length
          })
        )
      }

      return Effect.succeed(successes)
    })
  )

/**
 * First N Successes: Continue until we get N successful results
 * Useful when you need at least some results but not all
 */
export const fetchFirstNSuccesses = (
  urls: ReadonlyArray<string>,
  requiredSuccesses: number
): Effect.Effect<
  ReadonlyArray<string>,
  AggregateError
> =>
  pipe(
    Effect.forEach(
      urls,
      (url) =>
        pipe(
          simulateApiCall(url),
          Effect.either // Convert to Exit to capture both success and failure
        ),
      { concurrency: "unbounded" }
    ),
    Effect.flatMap((results) => {
      const successes = results
        .filter((r): r is typeof r & { _tag: "Right" } => r._tag === "Right")
        .map((r) => r.right)
      const failures = results
        .filter((r): r is typeof r & { _tag: "Left" } => r._tag === "Left")
        .map((r) => r.left)

      if (successes.length >= requiredSuccesses) {
        return Effect.succeed(successes.slice(0, requiredSuccesses))
      }

      return Effect.fail(
        new AggregateError({
          message: `Only got ${successes.length} successes, needed ${requiredSuccesses}`,
          errors: failures as Error[],
          successCount: successes.length,
          failureCount: failures.length
        })
      )
    })
  )

/**
 * Error Summary: Aggregate errors and provide a summary
 */
export const fetchAllWithErrorSummary = (
  urls: ReadonlyArray<string>
): Effect.Effect<
  ReadonlyArray<string>,
  { summary: string; errors: ReadonlyArray<NetworkError> }
> =>
  pipe(
    Effect.all(
      urls.map((url) => simulateApiCall(url)),
      { concurrency: "unbounded", mode: "either" }
    ),
    Effect.flatMap((results) => {
      const successes: string[] = []
      const failures: NetworkError[] = []

      results.forEach((result) => {
        if (result._tag === "Right") {
          successes.push(result.right)
        } else {
          failures.push(result.left)
        }
      })

      if (failures.length > 0) {
        const summary = `${failures.length} out of ${urls.length} requests failed. ` +
          `Status codes: ${failures.map((e) => e.statusCode).join(", ")}`

        return Effect.fail({ summary, errors: failures })
      }

      return Effect.succeed(successes)
    })
  )

// ============================================================================
// 4. Error Context Enrichment
// ============================================================================

/**
 * Add contextual information to errors as they propagate up the call stack
 */
export const enrichErrorContext = <A, E extends { message: string }>(
  effect: Effect.Effect<A, E>,
  context: {
    operation: string
    userId?: string
    requestId?: string
    metadata?: Record<string, unknown>
  }
) =>
  pipe(
    effect,
    Effect.mapError((error) => ({
      ...error,
      context: {
        ...context,
        timestamp: new Date().toISOString(),
        originalError: error.message
      }
    }))
  )

/**
 * Example: Nested operations with context enrichment
 */
export const fetchUserProfile = (
  userId: string
): Effect.Effect<{ name: string; email: string }, any> =>
  pipe(
    simulateApiCall(`/users/${userId}`),
    Effect.map((data) => ({ name: `User ${userId}`, email: `${userId}@example.com` })),
    (effect) => enrichErrorContext(effect, {
      operation: "fetchUserProfile",
      userId,
      requestId: `req-${Date.now()}`
    })
  )

export const fetchUserSettings = (
  userId: string
): Effect.Effect<{ theme: string }, any> =>
  pipe(
    simulateApiCall(`/users/${userId}/settings`),
    Effect.map(() => ({ theme: "dark" })),
    (effect) => enrichErrorContext(effect, {
      operation: "fetchUserSettings",
      userId,
      metadata: { section: "settings" }
    })
  )

export const loadFullUserData = (userId: string) =>
  pipe(
    Effect.all({
      profile: fetchUserProfile(userId),
      settings: fetchUserSettings(userId)
    }),
    (effect) => enrichErrorContext(effect, {
      operation: "loadFullUserData",
      userId,
      metadata: { composite: true }
    })
  )

/**
 * Add stack trace and call context to errors
 */
export const withStackTrace = <A, E>(
  effect: Effect.Effect<A, E>,
  label: string
) =>
  pipe(
    effect,
    Effect.mapError((error) => ({
      ...error,
      stackTrace: new Error().stack,
      functionLabel: label,
      capturedAt: new Date().toISOString()
    }))
  )

// ============================================================================
// 5. Timeout Error Handling Patterns
// ============================================================================

/**
 * Timeout with custom error
 */
export const withTimeout = <A, E>(
  effect: Effect.Effect<A, E>,
  timeoutMs: number,
  operation: string
): Effect.Effect<A, E | TimeoutError> =>
  pipe(
    effect,
    Effect.timeoutFail({
      duration: Duration.millis(timeoutMs),
      onTimeout: () => new TimeoutError({
        message: `Operation timed out after ${timeoutMs}ms`,
        timeoutMs,
        operation
      })
    })
  )

/**
 * Timeout with fallback value
 */
export const withTimeoutFallback = <A, E>(
  effect: Effect.Effect<A, E>,
  timeoutMs: number,
  fallback: A
): Effect.Effect<A, never> =>
  pipe(
    effect,
    Effect.timeout(Duration.millis(timeoutMs)),
    Effect.map((option) => (option._tag === "None" ? fallback : option.value)),
    Effect.catchAll(() => Effect.succeed(fallback))
  )

/**
 * Timeout with retry on timeout
 */
export const withTimeoutRetry = <A, E>(
  effect: Effect.Effect<A, E>,
  timeoutMs: number,
  maxRetries: number,
  operation: string
): Effect.Effect<A, E | TimeoutError> => {
  const attemptWithTimeout = pipe(
    effect,
    Effect.timeoutFail({
      duration: Duration.millis(timeoutMs),
      onTimeout: () => new TimeoutError({
        message: `Timeout after ${timeoutMs}ms`,
        timeoutMs,
        operation
      })
    })
  )

  return pipe(
    attemptWithTimeout,
    Effect.retry({
      while: (error): error is TimeoutError => {
        if (typeof error === 'object' && error !== null && '_tag' in error) {
          return error._tag === "TimeoutError"
        }
        return false
      },
      times: maxRetries
    }),
    Effect.tapError((error) =>
      Console.log(`Failed after ${maxRetries} timeout retries: ${error}`)
    )
  )
}

/**
 * Progressive timeout: Increase timeout on each retry
 */
export const withProgressiveTimeout = <A, E>(
  effect: Effect.Effect<A, E>,
  baseTimeoutMs: number,
  maxRetries: number,
  operation: string
): Effect.Effect<A, E | TimeoutError> => {
  const attemptWithTimeout = (attemptNumber: number) =>
    pipe(
      effect,
      Effect.timeoutFail({
        duration: Duration.millis(baseTimeoutMs * Math.pow(2, attemptNumber)),
        onTimeout: () => new TimeoutError({
          message: `Timeout after ${baseTimeoutMs * Math.pow(2, attemptNumber)}ms (attempt ${attemptNumber + 1})`,
          timeoutMs: baseTimeoutMs * Math.pow(2, attemptNumber),
          operation
        })
      })
    )

  return Effect.suspend(() => {
    let attempt = 0
    const retry: Effect.Effect<A, E | TimeoutError> = pipe(
      attemptWithTimeout(attempt),
      Effect.catchTag("TimeoutError", (error) => {
        attempt++
        if (attempt <= maxRetries) {
          return pipe(
            Console.log(`Timeout on attempt ${attempt}, retrying with longer timeout...`),
            Effect.flatMap(() => retry)
          )
        }
        return Effect.fail(error)
      })
    )
    return retry
  })
}

/**
 * Timeout with partial results
 * Useful for batch operations where some results are better than none
 */
export const fetchMultipleWithTimeout = (
  urls: ReadonlyArray<string>,
  timeoutMs: number
): Effect.Effect<
  ReadonlyArray<string>,
  { timedOut: boolean; partialResults: ReadonlyArray<string> }
> =>
  pipe(
    Effect.forEach(
      urls,
      (url) =>
        pipe(
          simulateApiCall(url),
          Effect.timeout(Duration.millis(timeoutMs)),
          Effect.map((option) =>
            option._tag === "None" ? null : option.value
          )
        ),
      { concurrency: "unbounded" }
    ),
    Effect.flatMap((results) => {
      const successes = results.filter((r): r is string => r !== null)
      const timedOut = results.some((r) => r === null)

      if (timedOut && successes.length > 0) {
        // Return partial results
        return Effect.succeed(successes)
      } else if (timedOut) {
        // All timed out
        return Effect.fail({
          timedOut: true,
          partialResults: []
        })
      } else {
        // All succeeded
        return Effect.succeed(successes)
      }
    })
  )

// ============================================================================
// Helper Functions (Simulations)
// ============================================================================

const simulateApiCall = (url: string): Effect.Effect<string, NetworkError> =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(Math.random() * 100))

    // Simulate random failures
    if (Math.random() > 0.7) {
      return yield* Effect.fail(
        new NetworkError({
          message: `Failed to fetch ${url}`,
          statusCode: Math.random() > 0.5 ? 500 : 503,
          retryable: true
        })
      )
    }

    return `Data from ${url}`
  })

const fetchFromCache = (url: string): Effect.Effect<string, NetworkError> =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(10))

    if (Math.random() > 0.5) {
      return `Cached data for ${url}`
    }

    return yield* Effect.fail(
      new NetworkError({
        message: "Cache miss",
        statusCode: 404,
        retryable: false
      })
    )
  })

const validateItem = (item: {
  id: number
  value: string
}): Effect.Effect<{ id: number; value: string }, ValidationError> =>
  Effect.gen(function* () {
    if (item.value.length < 3) {
      return yield* Effect.fail(
        new ValidationError({
          message: "Value too short",
          field: "value",
          value: item.value
        })
      )
    }

    return item
  })
