/**
 * Circuit Breaker Patterns
 *
 * A circuit breaker prevents cascading failures by stopping requests to a failing service,
 * giving it time to recover. This is essential for building resilient distributed systems.
 *
 * ## Circuit Breaker State Machine
 *
 * ```
 *                     ┌─────────┐
 *          ┌──────────┤  CLOSED │◄──────────┐
 *          │          └─────────┘           │
 *          │                │                │
 *          │                │                │
 *     success          failure_threshold     │
 *          │             exceeded         success
 *          │                │                │
 *          │                ▼                │
 *          │          ┌─────────┐            │
 *          └──────────┤  OPEN   │            │
 *                     └─────────┘            │
 *                           │                │
 *                           │                │
 *                     timeout_elapsed        │
 *                           │                │
 *                           ▼                │
 *                     ┌──────────┐           │
 *                     │ HALF_OPEN│───────────┘
 *                     └──────────┘
 *                           │
 *                           │
 *                        failure
 *                           │
 *                           ▼
 *                     (back to OPEN)
 * ```
 *
 * **States Explained**:
 * - **CLOSED**: Normal operation, requests pass through. Failures are counted.
 * - **OPEN**: Circuit is tripped, requests fail fast without calling the service.
 * - **HALF_OPEN**: Testing if service recovered, allows limited requests through.
 *
 * ## When to Use Circuit Breaker vs Simple Retry
 *
 * **Use Circuit Breaker when**:
 * - Calling external services that may experience outages
 * - You want to prevent cascading failures across services
 * - The downstream service needs time to recover (CPU, memory, connection pool exhaustion)
 * - You want to fail fast during outages instead of wasting resources on retries
 * - You need to protect your system from repeatedly calling a broken service
 *
 * **Use Simple Retry when**:
 * - Transient network glitches (connection timeout, packet loss)
 * - Rate limiting errors (can retry after backoff)
 * - Temporary resource unavailability (database connection pool temporarily full)
 * - The failure is unlikely to persist
 * - Quick recovery is expected
 *
 * **Use Both Together when**:
 * - You want retry logic for transient failures (retry 3 times)
 * - But also want protection against sustained failures (circuit breaker after 10 failures)
 * - Example: Retry individual requests, but open circuit if failure rate is too high
 *
 * @example
 * // Transient failure → Use retry
 * Effect.retry({ times: 3, schedule: exponentialBackoff })
 *
 * @example
 * // Sustained failure → Use circuit breaker
 * makeCircuitBreaker(apiCall, { failureThreshold: 5, resetTimeout: 30_000 })
 *
 * @example
 * // Combined: Retry for transient failures, circuit breaker for sustained failures
 * pipe(
 *   apiCall,
 *   Effect.retry({ times: 3 }),
 *   (effect) => makeCircuitBreaker(effect, { failureThreshold: 10, resetTimeout: 60_000 })
 * )
 */

import { Effect, Console, Duration, Schedule, pipe, Ref } from "effect"

// ============================================================================
// Type Definitions
// ============================================================================

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN"

export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures before opening the circuit
   * @default 5
   */
  readonly failureThreshold: number

  /**
   * Number of successful requests in HALF_OPEN state required to close the circuit
   * @default 2
   */
  readonly successThreshold: number

  /**
   * Time in milliseconds to wait before attempting to recover (transition to HALF_OPEN)
   * @default 60000 (1 minute)
   */
  readonly resetTimeout: number

  /**
   * Optional: Maximum number of requests allowed in HALF_OPEN state
   * @default 3
   */
  readonly halfOpenMaxAttempts?: number
}

export interface CircuitBreakerMetrics {
  readonly state: CircuitBreakerState
  readonly failureCount: number
  readonly successCount: number
  readonly consecutiveSuccesses: number
  readonly consecutiveFailures: number
  readonly lastFailureTime: number | null
  readonly lastSuccessTime: number | null
  readonly totalRequests: number
  readonly totalFailures: number
  readonly totalSuccesses: number
  readonly stateTransitions: ReadonlyArray<{
    from: CircuitBreakerState
    to: CircuitBreakerState
    timestamp: number
  }>
}

export class CircuitBreakerOpenError extends Error {
  readonly _tag = "CircuitBreakerOpenError"
  constructor(message: string = "Circuit breaker is open") {
    super(message)
    this.name = "CircuitBreakerOpenError"
  }
}

// ============================================================================
// 1. Basic Circuit Breaker
// ============================================================================

/**
 * Creates a basic circuit breaker that wraps an effect
 *
 * @example
 * ```typescript
 * const protectedCall = makeCircuitBreaker(
 *   riskyApiCall,
 *   {
 *     failureThreshold: 5,
 *     successThreshold: 2,
 *     resetTimeout: 60_000
 *   }
 * )
 *
 * // Use it like any Effect
 * await Effect.runPromise(protectedCall)
 * ```
 */
export const makeCircuitBreaker = <A, E>(
  effect: Effect.Effect<A, E>,
  config: CircuitBreakerConfig
) => {
  const {
    failureThreshold,
    successThreshold,
    resetTimeout,
    halfOpenMaxAttempts = 3
  } = config

  let state: CircuitBreakerState = "CLOSED"
  let failureCount = 0
  let successCount = 0
  let lastFailureTime: number | null = null
  let halfOpenAttempts = 0

  const transitionTo = (newState: CircuitBreakerState) => {
    const oldState = state
    state = newState
    return Console.log(
      `[CIRCUIT BREAKER] State transition: ${oldState} → ${newState}`
    )
  }

  return Effect.suspend(() => {
    const now = Date.now()

    // Check if we should transition from OPEN to HALF_OPEN
    if (
      state === "OPEN" &&
      lastFailureTime !== null &&
      now - lastFailureTime >= resetTimeout
    ) {
      return pipe(
        transitionTo("HALF_OPEN"),
        Effect.flatMap(() => {
          halfOpenAttempts = 0
          successCount = 0
          return executeWithTracking()
        })
      )
    }

    // If circuit is OPEN, fail fast
    if (state === "OPEN") {
      return pipe(
        Console.log(
          `[CIRCUIT BREAKER] Circuit is OPEN, failing fast (${failureCount} failures, last failure ${now - (lastFailureTime ?? now)}ms ago)`
        ),
        Effect.flatMap(() =>
          Effect.fail(new CircuitBreakerOpenError() as E)
        )
      )
    }

    // If in HALF_OPEN, limit the number of attempts
    if (state === "HALF_OPEN" && halfOpenAttempts >= halfOpenMaxAttempts) {
      return pipe(
        Console.log(
          "[CIRCUIT BREAKER] HALF_OPEN attempt limit reached, failing fast"
        ),
        Effect.flatMap(() =>
          Effect.fail(new CircuitBreakerOpenError() as E)
        )
      )
    }

    return executeWithTracking()
  })

  function executeWithTracking(): Effect.Effect<A, E> {
    if (state === "HALF_OPEN") {
      halfOpenAttempts++
    }

    return pipe(
      effect,
      Effect.tap((result) =>
        Effect.suspend(() => {
          failureCount = 0
          successCount++

          if (state === "HALF_OPEN") {
            if (successCount >= successThreshold) {
              return transitionTo("CLOSED")
            }
          }

          return Console.log(
            `[CIRCUIT BREAKER] Request succeeded (state: ${state}, successes: ${successCount})`
          )
        })
      ),
      Effect.tapError((error) =>
        Effect.suspend(() => {
          failureCount++
          successCount = 0
          lastFailureTime = Date.now()

          if (state === "HALF_OPEN") {
            return pipe(
              Console.log(
                "[CIRCUIT BREAKER] Failure in HALF_OPEN, returning to OPEN"
              ),
              Effect.flatMap(() => transitionTo("OPEN"))
            )
          }

          if (state === "CLOSED" && failureCount >= failureThreshold) {
            return pipe(
              Console.log(
                `[CIRCUIT BREAKER] Failure threshold reached (${failureCount}/${failureThreshold})`
              ),
              Effect.flatMap(() => transitionTo("OPEN"))
            )
          }

          return Console.log(
            `[CIRCUIT BREAKER] Request failed (state: ${state}, failures: ${failureCount}/${failureThreshold})`
          )
        })
      )
    )
  }
}

// ============================================================================
// 2. Circuit Breaker with Metrics
// ============================================================================

/**
 * Circuit breaker that tracks detailed metrics
 *
 * @example
 * ```typescript
 * const { execute, getMetrics } = makeCircuitBreakerWithMetrics(
 *   riskyApiCall,
 *   { failureThreshold: 5, successThreshold: 2, resetTimeout: 60_000 }
 * )
 *
 * // Execute requests
 * await Effect.runPromise(execute())
 *
 * // Check metrics
 * const metrics = getMetrics()
 * console.log(`State: ${metrics.state}, Failures: ${metrics.totalFailures}`)
 * ```
 */
export const makeCircuitBreakerWithMetrics = <A, E>(
  effect: Effect.Effect<A, E>,
  config: CircuitBreakerConfig
) => {
  const {
    failureThreshold,
    successThreshold,
    resetTimeout,
    halfOpenMaxAttempts = 3
  } = config

  // Metrics state
  const metrics: {
    state: CircuitBreakerState
    failureCount: number
    successCount: number
    consecutiveSuccesses: number
    consecutiveFailures: number
    lastFailureTime: number | null
    lastSuccessTime: number | null
    totalRequests: number
    totalFailures: number
    totalSuccesses: number
    halfOpenAttempts: number
    stateTransitions: Array<{
      from: CircuitBreakerState
      to: CircuitBreakerState
      timestamp: number
    }>
  } = {
    state: "CLOSED",
    failureCount: 0,
    successCount: 0,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
    lastFailureTime: null,
    lastSuccessTime: null,
    totalRequests: 0,
    totalFailures: 0,
    totalSuccesses: 0,
    halfOpenAttempts: 0,
    stateTransitions: []
  }

  const transitionTo = (newState: CircuitBreakerState) => {
    const oldState = metrics.state
    metrics.state = newState
    metrics.stateTransitions.push({
      from: oldState,
      to: newState,
      timestamp: Date.now()
    })
    return Console.log(
      `[CIRCUIT BREAKER] State transition: ${oldState} → ${newState} (transitions: ${metrics.stateTransitions.length})`
    )
  }

  const execute = (): Effect.Effect<A, E> =>
    Effect.suspend(() => {
      const now = Date.now()
      metrics.totalRequests++

      // Check if we should transition from OPEN to HALF_OPEN
      if (
        metrics.state === "OPEN" &&
        metrics.lastFailureTime !== null &&
        now - metrics.lastFailureTime >= resetTimeout
      ) {
        return pipe(
          transitionTo("HALF_OPEN"),
          Effect.flatMap(() => {
            metrics.halfOpenAttempts = 0
            metrics.successCount = 0
            return executeWithTracking()
          })
        )
      }

      // If circuit is OPEN, fail fast
      if (metrics.state === "OPEN") {
        return pipe(
          Console.log(
            `[CIRCUIT BREAKER] Circuit is OPEN, failing fast (failures: ${metrics.totalFailures}, success rate: ${(
              (metrics.totalSuccesses / metrics.totalRequests) *
              100
            ).toFixed(1)}%)`
          ),
          Effect.flatMap(() =>
            Effect.fail(new CircuitBreakerOpenError() as E)
          )
        )
      }

      // If in HALF_OPEN, limit the number of attempts
      if (
        metrics.state === "HALF_OPEN" &&
        metrics.halfOpenAttempts >= halfOpenMaxAttempts
      ) {
        return pipe(
          Console.log(
            `[CIRCUIT BREAKER] HALF_OPEN attempt limit reached (${metrics.halfOpenAttempts}/${halfOpenMaxAttempts})`
          ),
          Effect.flatMap(() =>
            Effect.fail(new CircuitBreakerOpenError() as E)
          )
        )
      }

      return executeWithTracking()
    })

  function executeWithTracking(): Effect.Effect<A, E> {
    if (metrics.state === "HALF_OPEN") {
      metrics.halfOpenAttempts++
    }

    return pipe(
      effect,
      Effect.tap((result) =>
        Effect.suspend(() => {
          metrics.totalSuccesses++
          metrics.consecutiveSuccesses++
          metrics.consecutiveFailures = 0
          metrics.failureCount = 0
          metrics.successCount++
          metrics.lastSuccessTime = Date.now()

          if (metrics.state === "HALF_OPEN") {
            if (metrics.successCount >= successThreshold) {
              return transitionTo("CLOSED")
            }
          }

          return Console.log(
            `[CIRCUIT BREAKER] ✓ Success (state: ${metrics.state}, consecutive: ${metrics.consecutiveSuccesses}, total: ${metrics.totalSuccesses}/${metrics.totalRequests})`
          )
        })
      ),
      Effect.tapError((error) =>
        Effect.suspend(() => {
          metrics.totalFailures++
          metrics.consecutiveFailures++
          metrics.consecutiveSuccesses = 0
          metrics.failureCount++
          metrics.successCount = 0
          metrics.lastFailureTime = Date.now()

          if (metrics.state === "HALF_OPEN") {
            return pipe(
              Console.log(
                `[CIRCUIT BREAKER] ✗ Failure in HALF_OPEN (consecutive: ${metrics.consecutiveFailures}), returning to OPEN`
              ),
              Effect.flatMap(() => transitionTo("OPEN"))
            )
          }

          if (metrics.state === "CLOSED" && metrics.failureCount >= failureThreshold) {
            return pipe(
              Console.log(
                `[CIRCUIT BREAKER] ✗ Failure threshold reached (${metrics.failureCount}/${failureThreshold}, consecutive: ${metrics.consecutiveFailures})`
              ),
              Effect.flatMap(() => transitionTo("OPEN"))
            )
          }

          return Console.log(
            `[CIRCUIT BREAKER] ✗ Failure (state: ${metrics.state}, failures: ${metrics.failureCount}/${failureThreshold}, consecutive: ${metrics.consecutiveFailures})`
          )
        })
      )
    )
  }

  const getMetrics = (): CircuitBreakerMetrics => ({
    ...metrics,
    stateTransitions: [...metrics.stateTransitions]
  })

  const resetMetrics = (): Effect.Effect<void> =>
    Effect.sync(() => {
      metrics.state = "CLOSED"
      metrics.failureCount = 0
      metrics.successCount = 0
      metrics.consecutiveSuccesses = 0
      metrics.consecutiveFailures = 0
      metrics.lastFailureTime = null
      metrics.lastSuccessTime = null
      metrics.totalRequests = 0
      metrics.totalFailures = 0
      metrics.totalSuccesses = 0
      metrics.halfOpenAttempts = 0
      metrics.stateTransitions = []
    })

  return {
    execute,
    getMetrics,
    resetMetrics
  }
}

// ============================================================================
// 3. Circuit Breaker with Retry Integration
// ============================================================================

/**
 * Combines circuit breaker with retry logic
 * - Retries handle transient failures (network glitches, timeouts)
 * - Circuit breaker handles sustained failures (service outage)
 *
 * @example
 * ```typescript
 * const resilientCall = makeCircuitBreakerWithRetry(
 *   apiCall,
 *   {
 *     circuitBreaker: { failureThreshold: 10, successThreshold: 2, resetTimeout: 60_000 },
 *     retry: { times: 3, schedule: Schedule.exponential(Duration.millis(100)) }
 *   }
 * )
 *
 * await Effect.runPromise(resilientCall)
 * ```
 */
export const makeCircuitBreakerWithRetry = <A, E>(
  effect: Effect.Effect<A, E>,
  config: {
    circuitBreaker: CircuitBreakerConfig
    retry: {
      times: number
      schedule?: Schedule.Schedule<number, unknown, number>
    }
  }
) => {
  const { execute, getMetrics, resetMetrics } = makeCircuitBreakerWithMetrics(
    effect,
    config.circuitBreaker
  )

  const retrySchedule =
    config.retry.schedule ??
    pipe(
      Schedule.exponential(Duration.millis(100)),
      Schedule.compose(Schedule.recurs(config.retry.times - 1))
    )

  const executeWithRetry = () =>
    pipe(
      execute(),
      Effect.retry({
        schedule: retrySchedule,
        while: (error) => {
          // Don't retry if circuit breaker is open
          if (
            error &&
            typeof error === "object" &&
            "_tag" in error &&
            error._tag === "CircuitBreakerOpenError"
          ) {
            return false
          }
          return true
        }
      }),
      Effect.tap(() =>
        Console.log("[CIRCUIT BREAKER + RETRY] Request succeeded after retries")
      ),
      Effect.tapError((error) =>
        Console.log(
          `[CIRCUIT BREAKER + RETRY] Request failed: ${error instanceof Error ? error.message : String(error)}`
        )
      )
    )

  return {
    execute: executeWithRetry,
    getMetrics,
    resetMetrics
  }
}

// ============================================================================
// 4. Circuit Breaker with Custom Monitoring Hooks
// ============================================================================

export interface MonitoringHooks<A, E> {
  onSuccess?: (result: A, metrics: CircuitBreakerMetrics) => Effect.Effect<void>
  onFailure?: (error: E, metrics: CircuitBreakerMetrics) => Effect.Effect<void>
  onStateChange?: (
    from: CircuitBreakerState,
    to: CircuitBreakerState,
    metrics: CircuitBreakerMetrics
  ) => Effect.Effect<void>
  onCircuitOpen?: (metrics: CircuitBreakerMetrics) => Effect.Effect<void>
  onCircuitClosed?: (metrics: CircuitBreakerMetrics) => Effect.Effect<void>
}

/**
 * Circuit breaker with custom monitoring hooks for alerting, logging, metrics
 *
 * @example
 * ```typescript
 * const { execute } = makeMonitoredCircuitBreaker(
 *   apiCall,
 *   { failureThreshold: 5, successThreshold: 2, resetTimeout: 60_000 },
 *   {
 *     onCircuitOpen: (metrics) =>
 *       Effect.flatMap(
 *         Console.log(`🚨 ALERT: Circuit opened! Failure rate: ${metrics.totalFailures}/${metrics.totalRequests}`),
 *         () => sendPagerDutyAlert("Circuit breaker opened")
 *       ),
 *     onStateChange: (from, to, metrics) =>
 *       Effect.flatMap(
 *         Console.log(`📊 State change: ${from} → ${to}`),
 *         () => sendMetricToDatadog("circuit_breaker.state_change", { from, to })
 *       )
 *   }
 * )
 * ```
 */
export const makeMonitoredCircuitBreaker = <A, E>(
  effect: Effect.Effect<A, E>,
  config: CircuitBreakerConfig,
  hooks: MonitoringHooks<A, E> = {}
) => {
  const { execute, getMetrics, resetMetrics } = makeCircuitBreakerWithMetrics(
    effect,
    config
  )

  const monitoredExecute = () =>
    pipe(
      execute(),
      Effect.tap((result) =>
        Effect.suspend(() => {
          const metrics = getMetrics()
          return hooks.onSuccess?.(result, metrics) ?? Effect.void
        })
      ),
      Effect.tapError((error) =>
        Effect.suspend(() => {
          const metrics = getMetrics()
          const errorEffect = hooks.onFailure?.(error, metrics) ?? Effect.void

          // Check if circuit just opened
          if (
            metrics.state === "OPEN" &&
            metrics.stateTransitions.length > 0 &&
            metrics.stateTransitions[metrics.stateTransitions.length - 1].to ===
              "OPEN"
          ) {
            const openEffect = hooks.onCircuitOpen?.(metrics) ?? Effect.void
            return pipe(errorEffect, Effect.flatMap(() => openEffect))
          }

          return errorEffect
        })
      )
    )

  // Wrap to detect state changes
  const monitoredExecuteWithStateTracking = () => {
    const previousState = getMetrics().state
    return pipe(
      monitoredExecute(),
      Effect.tap(() =>
        Effect.suspend(() => {
          const currentMetrics = getMetrics()
          const currentState = currentMetrics.state

          if (previousState !== currentState) {
            const stateChangeEffect =
              hooks.onStateChange?.(previousState, currentState, currentMetrics) ??
              Effect.void

            if (currentState === "CLOSED") {
              const closedEffect =
                hooks.onCircuitClosed?.(currentMetrics) ?? Effect.void
              return pipe(stateChangeEffect, Effect.flatMap(() => closedEffect))
            }

            return stateChangeEffect
          }

          return Effect.void
        })
      )
    )
  }

  return {
    execute: monitoredExecuteWithStateTracking,
    getMetrics,
    resetMetrics
  }
}

// ============================================================================
// 5. Example: Practical Circuit Breaker Usage
// ============================================================================

/**
 * Example: Protecting an external API call
 */
export const createResilientApiClient = <A, E>(
  apiCall: (request: unknown) => Effect.Effect<A, E>
) => {
  const { execute, getMetrics } = makeCircuitBreakerWithRetry(
    apiCall({ action: "fetch" }),
    {
      circuitBreaker: {
        failureThreshold: 5,
        successThreshold: 2,
        resetTimeout: 30_000 // 30 seconds
      },
      retry: {
        times: 3,
        schedule: pipe(
          Schedule.exponential(Duration.millis(100)),
          Schedule.compose(Schedule.recurs(2))
        )
      }
    }
  )

  return {
    call: execute,
    healthCheck: () => {
      const metrics = getMetrics()
      return Effect.succeed({
        healthy: metrics.state !== "OPEN",
        state: metrics.state,
        successRate:
          metrics.totalRequests > 0
            ? (metrics.totalSuccesses / metrics.totalRequests) * 100
            : 100,
        totalRequests: metrics.totalRequests,
        totalFailures: metrics.totalFailures
      })
    },
    getMetrics
  }
}
