import { Effect, Console, Duration, Schedule, pipe, Random } from "effect"

// Type aliases
type Fx<A, E = never> = Effect.Effect<A, E>

// ============================================================================
// 1. Basic Schedules
// ============================================================================

/**
 * Fixed delay schedule - waits a fixed duration between attempts
 */
export const fixedDelaySchedule = Schedule.fixed(Duration.millis(100))

/**
 * Exponential backoff - delays grow exponentially
 * 100ms, 200ms, 400ms, 800ms, etc.
 */
export const exponentialSchedule = Schedule.exponential(Duration.millis(100))

/**
 * Spaced schedule - adds a fixed delay after each execution
 */
export const spacedSchedule = Schedule.spaced(Duration.millis(200))

/**
 * Recurs schedule - limits the number of recurrences
 */
export const limitedRecurs = Schedule.recurs(5) // Retry up to 5 times

// ============================================================================
// 2. Jittered Delays
// ============================================================================

/**
 * Full jitter - random delay between 0 and the exponential backoff value
 * This is the most common jitter strategy to avoid thundering herd
 *
 * Example: If backoff is 400ms, actual delay will be random between 0-400ms
 */
export const fullJitterSchedule = Schedule.jittered(
  Schedule.exponential(Duration.millis(100))
)

/**
 * Proportional jitter with custom factor
 * Jitter between (delay * (1 - factor)) and (delay * (1 + factor))
 */
export const proportionalJitterSchedule = (factor: number = 0.5) =>
  Schedule.jittered(
    Schedule.exponential(Duration.millis(100)),
    1 - factor,
    1 + factor
  )

/**
 * Equal jitter - splits the delay 50/50 between base and random jitter
 * delay = base/2 + random(0, base/2)
 */
export const equalJitterSchedule = Schedule.jittered(
  Schedule.exponential(Duration.millis(100)),
  0.5,
  1.0
)

/**
 * Decorrelated jitter - each delay is based on the previous delay
 * More sophisticated jitter that adapts to conditions
 */
export const decorrelatedJitterSchedule = pipe(
  Schedule.exponential(Duration.millis(100), 2.0),
  (schedule) => Schedule.jittered(schedule)
)

// ============================================================================
// 3. Capped and Combined Schedules
// ============================================================================

/**
 * Exponential backoff with jitter, capped at maximum delay
 */
export const cappedJitterSchedule = (
  baseDelayMs: number,
  maxDelayMs: number,
  maxRetries: number
) =>
  pipe(
    Schedule.jittered(Schedule.exponential(Duration.millis(baseDelayMs))),
    Schedule.either(Schedule.spaced(Duration.millis(maxDelayMs))), // Cap at max
    Schedule.compose(Schedule.recurs(maxRetries)) // Limit attempts
  )

/**
 * Fibonacci backoff with jitter
 * Delays: 100ms, 100ms, 200ms, 300ms, 500ms, 800ms...
 */
export const fibonacciJitterSchedule = Schedule.jittered(
  Schedule.fibonacci(Duration.millis(100))
)

/**
 * Linear backoff with jitter
 * Delays grow linearly: 100ms, 200ms, 300ms, 400ms...
 */
export const linearJitterSchedule = Schedule.jittered(
  Schedule.linear(Duration.millis(100))
)

/**
 * Exponential backoff with jitter and timeout
 * Will stop retrying after total elapsed time exceeds limit
 */
export const timedJitterSchedule = (
  baseDelayMs: number,
  maxDurationMs: number
) =>
  pipe(
    Schedule.jittered(Schedule.exponential(Duration.millis(baseDelayMs))),
    Schedule.intersect(Schedule.elapsed),
    Schedule.whileOutput((elapsed) => Duration.lessThan(elapsed, Duration.millis(maxDurationMs)))
  )

// ============================================================================
// 4. Retry with Jittered Delays
// ============================================================================

/**
 * Simulates a flaky API call that fails randomly
 */
export const flakyApiCall = (
  name: string,
  failureRate: number = 0.7
): Fx<string, Error> =>
  pipe(
    Random.next,
    Effect.flatMap((random) => {
      if (random < failureRate) {
        return pipe(
          Console.log(`  ❌ ${name} failed (random: ${random.toFixed(2)})`),
          Effect.flatMap(() =>
            Effect.fail(new Error(`${name} temporary failure`))
          )
        )
      }
      return pipe(
        Console.log(`  ✅ ${name} succeeded (random: ${random.toFixed(2)})`),
        Effect.map(() => `${name} result`)
      )
    })
  )

/**
 * Retry with exponential backoff and full jitter
 */
export const retryWithFullJitter = <A, E>(
  effect: Fx<A, E>,
  maxAttempts: number = 5
) =>
  pipe(
    effect,
    Effect.retry(
      pipe(
        Schedule.jittered(Schedule.exponential(Duration.millis(100))),
        Schedule.compose(Schedule.recurs(maxAttempts - 1))
      )
    )
  )

/**
 * Retry with capped exponential backoff and jitter
 */
export const retryWithCappedJitter = <A, E>(
  effect: Fx<A, E>,
  baseDelayMs: number,
  maxDelayMs: number,
  maxAttempts: number
) =>
  pipe(
    effect,
    Effect.retry(cappedJitterSchedule(baseDelayMs, maxDelayMs, maxAttempts))
  )

/**
 * Retry with logging of each attempt
 */
export const retryWithLogging = <A, E>(
  effect: Fx<A, E>,
  name: string,
  maxAttempts: number = 5
) =>
  pipe(
    effect,
    Effect.retry(
      pipe(
        Schedule.jittered(Schedule.exponential(Duration.millis(100))),
        Schedule.compose(Schedule.recurs(maxAttempts - 1)),
        Schedule.tapOutput((duration, attempt) =>
          Console.log(
            `  ⏱️  ${name} retry attempt ${attempt + 1} after ${Duration.toMillis(duration)}ms`
          )
        )
      )
    ),
    Effect.tap(() => Console.log(`  🎉 ${name} succeeded after retries`))
  )

// ============================================================================
// 5. Scheduled Recurring Tasks
// ============================================================================

/**
 * Repeat a task with jittered delays
 */
export const repeatWithJitter = <A, E>(
  effect: Fx<A, E>,
  times: number
) =>
  pipe(
    effect,
    Effect.repeat(
      pipe(
        Schedule.jittered(Schedule.spaced(Duration.millis(100))),
        Schedule.compose(Schedule.recurs(times - 1))
      )
    )
  )

/**
 * Scheduled task that runs at intervals with jitter to avoid coordination
 */
export const scheduledTaskWithJitter = (
  task: Fx<void>,
  intervalMs: number,
  repetitions: number
) =>
  pipe(
    task,
    Effect.repeat(
      pipe(
        Schedule.jittered(Schedule.spaced(Duration.millis(intervalMs)), 0.8, 1.2), // ±20% jitter
        Schedule.compose(Schedule.recurs(repetitions - 1))
      )
    )
  )

// ============================================================================
// 6. Practical Examples
// ============================================================================

/**
 * Simulate retrying a database connection with exponential backoff and jitter
 */
export const connectToDatabase = (
  connectionId: string,
  failureRate: number = 0.6
) =>
  pipe(
    Console.log(`🔌 Attempting to connect to database (${connectionId})...`),
    Effect.flatMap(() => flakyApiCall(`DB-Connect-${connectionId}`, failureRate)),
    Effect.tap((result) =>
      Console.log(`💾 Database connected: ${result}`)
    ),
    Effect.retry(
      pipe(
        Schedule.jittered(Schedule.exponential(Duration.millis(50), 2.0)),
        Schedule.intersect(Schedule.recurs(5)),
        Schedule.tapOutput((output, attempt) => {
          // intersect returns a tuple [Duration, number], extract the duration
          const duration = Array.isArray(output) ? output[0] : output
          return Console.log(
            `  🔄 Retry ${attempt + 1} scheduled after ${Duration.toMillis(duration)}ms`
          )
        })
      )
    ),
    Effect.catchAll((error) =>
      pipe(
        Console.log(`💥 Failed to connect after all retries: ${error.message}`),
        Effect.flatMap(() => Effect.fail(error))
      )
    )
  )

/**
 * Simulate an API request with retry and jittered backoff
 */
export const fetchWithRetry = <A>(
  url: string,
  operation: Fx<A, Error>,
  maxRetries: number = 3
) =>
  pipe(
    Console.log(`🌐 Fetching: ${url}`),
    Effect.flatMap(() => operation),
    Effect.retry(
      pipe(
        Schedule.jittered(Schedule.exponential(Duration.millis(100))),
        Schedule.compose(Schedule.recurs(maxRetries)),
        Schedule.tapOutput((duration, attempt) =>
          Console.log(
            `  ↻ Retrying ${url} (attempt ${attempt + 1}) after ${Duration.toMillis(duration)}ms`
          )
        )
      )
    )
  )

/**
 * Batch processing with jittered delays to avoid overwhelming a service
 */
export const processBatchWithJitter = (
  items: string[],
  processItem: (item: string) => Fx<void>
) =>
  pipe(
    Effect.forEach(
      items,
      (item, index) =>
        pipe(
          // Add jittered delay before each item (except first)
          index === 0
            ? Effect.void
            : pipe(
                Random.next,
                Effect.flatMap((random) =>
                  Effect.sleep(Duration.millis(50 + random * 100))
                )
              ),
          Effect.flatMap(() => processItem(item))
        ),
      { concurrency: 1 }
    )
  )

/**
 * Circuit breaker pattern with jittered recovery delay
 * Backs off exponentially when detecting failures
 */
export const circuitBreakerExample = (
  operation: Fx<string, Error>,
  maxFailures: number = 3
) =>
  pipe(
    Effect.gen(function* (_) {
      let failures = 0
      let circuitOpen = false

      while (failures < maxFailures) {
        if (circuitOpen) {
          // Wait with jittered backoff before trying again
          const backoffMs = Math.pow(2, failures) * 100
          const jitter = yield* _(Random.next)
          const delayMs = backoffMs * jitter
          yield* _(
            Console.log(
              `⏸️  Circuit open, waiting ${delayMs.toFixed(0)}ms before retry...`
            )
          )
          yield* _(Effect.sleep(Duration.millis(delayMs)))
          circuitOpen = false
        }

        try {
          const result = yield* _(operation)
          yield* _(Console.log("✅ Circuit breaker: Operation succeeded"))
          return result
        } catch (error) {
          failures++
          circuitOpen = true
          yield* _(
            Console.log(`❌ Circuit breaker: Failure ${failures}/${maxFailures}`)
          )
          if (failures >= maxFailures) {
            yield* _(Console.log("🚫 Circuit breaker: Max failures reached"))
            return yield* _(Effect.fail(new Error("Circuit breaker open")))
          }
        }
      }

      return yield* _(Effect.fail(new Error("Circuit breaker open")))
    })
  )

/**
 * Example: Health check with exponential backoff and jitter
 */
export const healthCheckWithRetry = (
  serviceName: string,
  check: Fx<boolean, Error>
) =>
  pipe(
    check,
    Effect.flatMap((healthy) => {
      if (!healthy) {
        return Effect.fail(new Error(`${serviceName} is unhealthy`))
      }
      return Effect.succeed(true)
    }),
    Effect.retry(
      pipe(
        Schedule.jittered(Schedule.exponential(Duration.millis(200))),
        Schedule.compose(Schedule.recurs(3)),
        Schedule.tapOutput((duration, attempt) =>
          Console.log(
            `🏥 Health check for ${serviceName} - retry ${attempt + 1} after ${Duration.toMillis(duration)}ms`
          )
        )
      )
    ),
    Effect.tap(() =>
      Console.log(`✅ ${serviceName} health check passed`)
    ),
    Effect.catchAll(() =>
      pipe(
        Console.log(`❌ ${serviceName} health check failed after all retries`),
        Effect.map(() => false)
      )
    )
  )

// ============================================================================
// 7. Schedule Combinators
// ============================================================================

/**
 * Union of two schedules - continues as long as either schedule wants to
 */
export const unionScheduleExample = pipe(
  Schedule.recurs(5),
  Schedule.union(Schedule.spaced(Duration.millis(1000)))
)

/**
 * Intersection of two schedules - only continues when both agree
 */
export const intersectionScheduleExample = pipe(
  Schedule.exponential(Duration.millis(100)),
  Schedule.intersect(Schedule.recurs(3))
)

/**
 * Custom schedule that tracks and limits total elapsed time
 */
export const elapsedTimeSchedule = (maxDurationMs: number) =>
  pipe(
    Schedule.jittered(Schedule.exponential(Duration.millis(100))),
    Schedule.intersect(Schedule.elapsed),
    Schedule.whileOutput((elapsed) =>
      Duration.lessThan(elapsed, Duration.millis(maxDurationMs))
    )
  )
