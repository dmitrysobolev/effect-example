/**
 * Scheduling Basics - Retry and Backoff Patterns
 *
 * This example demonstrates:
 * - Basic retry patterns
 * - Exponential backoff strategies
 * - Jitter for avoiding thundering herd
 * - Scheduled recurring tasks
 * - Combining schedules
 * - Practical retry scenarios
 */

import { Effect, Console, Schedule, Duration, pipe, Random } from "effect"

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Simulates a flaky operation that fails randomly
 */
const flakyOperation = (name: string, successRate: number = 0.3) =>
  pipe(
    Random.next,
    Effect.flatMap((random) => {
      if (random < successRate) {
        return pipe(
          Console.log(`✅ ${name} succeeded (${random.toFixed(2)})`),
          Effect.map(() => `${name} result`)
        )
      }
      return pipe(
        Console.log(`❌ ${name} failed (${random.toFixed(2)})`),
        Effect.flatMap(() =>
          Effect.fail(new Error(`${name} temporary failure`))
        )
      )
    })
  )

/**
 * Logs with timestamp
 */
const logWithTime = (message: string) =>
  Effect.sync(() => {
    const time = new Date().toISOString().slice(14, 23)
    console.log(`[${time}] ${message}`)
  })

// ============================================================================
// 1. Basic Retry Patterns
// ============================================================================

/**
 * Simple retry - tries up to N times immediately
 */
const simpleRetry = Effect.gen(function* () {
  yield* Console.log("Simple retry (up to 3 times)...")

  const result = yield* pipe(
    flakyOperation("SimpleAPI", 0.3),
    Effect.retry({ times: 2 }) // Total 3 attempts (1 initial + 2 retries)
  )

  yield* Console.log(`Success: ${result}`)
  return result
})

/**
 * Retry with fixed delay between attempts
 */
const retryWithFixedDelay = Effect.gen(function* () {
  yield* Console.log("Retry with fixed 100ms delay...")

  const result = yield* pipe(
    flakyOperation("FixedDelayAPI", 0.3),
    Effect.retry(
      pipe(
        Schedule.fixed(Duration.millis(100)),
        Schedule.compose(Schedule.recurs(3))
      )
    ),
    Effect.tap(() => Console.log("✅ Operation succeeded"))
  )

  return result
})

// ============================================================================
// 2. Exponential Backoff
// ============================================================================

/**
 * Exponential backoff - delays grow exponentially
 * 100ms, 200ms, 400ms, 800ms...
 */
const exponentialBackoff = Effect.gen(function* () {
  yield* Console.log("Exponential backoff (100ms base)...")

  const result = yield* pipe(
    flakyOperation("ExponentialAPI", 0.2),
    Effect.retry(
      pipe(
        Schedule.exponential(Duration.millis(100)),
        Schedule.compose(Schedule.recurs(4)),
        Schedule.tapOutput((duration, attempt) =>
          Console.log(`  ⏱️  Retry ${attempt + 1} after ${Duration.toMillis(duration)}ms`)
        )
      )
    )
  )

  return result
})

/**
 * Capped exponential backoff - max delay limit
 */
const cappedBackoff = Effect.gen(function* () {
  yield* Console.log("Capped exponential backoff (max 500ms)...")

  const result = yield* pipe(
    flakyOperation("CappedAPI", 0.2),
    Effect.retry(
      pipe(
        Schedule.exponential(Duration.millis(100)),
        Schedule.either(Schedule.spaced(Duration.millis(500))), // Cap at 500ms
        Schedule.compose(Schedule.recurs(5)),
        Schedule.tapOutput((duration, attempt) =>
          Console.log(`  ⏱️  Retry ${attempt + 1} after ${Duration.toMillis(duration)}ms`)
        )
      )
    )
  )

  return result
})

// ============================================================================
// 3. Jittered Backoff (Avoid Thundering Herd)
// ============================================================================

/**
 * Full jitter - random delay between 0 and exponential backoff
 * Prevents all clients from retrying at the same time
 */
const fullJitterBackoff = Effect.gen(function* () {
  yield* Console.log("Full jitter exponential backoff...")

  const result = yield* pipe(
    flakyOperation("JitteredAPI", 0.2),
    Effect.retry(
      pipe(
        Schedule.jittered(Schedule.exponential(Duration.millis(100))),
        Schedule.compose(Schedule.recurs(5)),
        Schedule.tapOutput((duration, attempt) =>
          Console.log(`  ⏱️  Retry ${attempt + 1} after ${Duration.toMillis(duration).toFixed(0)}ms (jittered)`)
        )
      )
    )
  )

  return result
})

/**
 * Equal jitter - splits delay 50/50 between base and random
 */
const equalJitterBackoff = Effect.gen(function* () {
  yield* Console.log("Equal jitter backoff (base/2 + random(0, base/2))...")

  const result = yield* pipe(
    flakyOperation("EqualJitterAPI", 0.2),
    Effect.retry(
      pipe(
        Schedule.jittered(
          Schedule.exponential(Duration.millis(100)),
          0.5,  // min factor (50% of delay)
          1.0   // max factor (100% of delay)
        ),
        Schedule.compose(Schedule.recurs(4)),
        Schedule.tapOutput((duration, attempt) =>
          Console.log(`  ⏱️  Retry ${attempt + 1} after ${Duration.toMillis(duration).toFixed(0)}ms`)
        )
      )
    )
  )

  return result
})

// ============================================================================
// 4. Alternative Backoff Strategies
// ============================================================================

/**
 * Linear backoff - delays grow linearly
 * 100ms, 200ms, 300ms, 400ms...
 */
const linearBackoff = Effect.gen(function* () {
  yield* Console.log("Linear backoff...")

  const result = yield* pipe(
    flakyOperation("LinearAPI", 0.3),
    Effect.retry(
      pipe(
        Schedule.linear(Duration.millis(100)),
        Schedule.compose(Schedule.recurs(3)),
        Schedule.tapOutput((duration, attempt) =>
          Console.log(`  ⏱️  Retry ${attempt + 1} after ${Duration.toMillis(duration)}ms`)
        )
      )
    )
  )

  return result
})

/**
 * Fibonacci backoff - delays follow fibonacci sequence
 * 100ms, 100ms, 200ms, 300ms, 500ms...
 */
const fibonacciBackoff = Effect.gen(function* () {
  yield* Console.log("Fibonacci backoff...")

  const result = yield* pipe(
    flakyOperation("FibonacciAPI", 0.3),
    Effect.retry(
      pipe(
        Schedule.fibonacci(Duration.millis(100)),
        Schedule.compose(Schedule.recurs(4)),
        Schedule.tapOutput((duration, attempt) =>
          Console.log(`  ⏱️  Retry ${attempt + 1} after ${Duration.toMillis(duration)}ms`)
        )
      )
    )
  )

  return result
})

// ============================================================================
// 5. Scheduled Recurring Tasks
// ============================================================================

/**
 * Repeat a task multiple times with delays
 */
const repeatTask = Effect.gen(function* () {
  yield* Console.log("Repeating task 3 times with 100ms spacing...")

  let count = 0
  const task = Effect.sync(() => {
    count++
    console.log(`  Execution #${count}`)
    return count
  })

  const finalCount = yield* pipe(
    task,
    Effect.repeat(
      pipe(
        Schedule.spaced(Duration.millis(100)),
        Schedule.compose(Schedule.recurs(2)) // Repeat 2 more times (3 total)
      )
    )
  )

  yield* Console.log(`Total executions: ${finalCount}`)
  return finalCount
})

/**
 * Repeat with jitter to avoid coordination
 */
const repeatWithJitter = Effect.gen(function* () {
  yield* Console.log("Repeating with jittered delays...")

  let count = 0
  const task = pipe(
    Effect.sync(() => {
      count++
      return count
    }),
    Effect.tap(() => logWithTime(`Execution #${count}`))
  )

  const finalCount = yield* pipe(
    task,
    Effect.repeat(
      pipe(
        Schedule.jittered(Schedule.spaced(Duration.millis(100))),
        Schedule.compose(Schedule.recurs(3))
      )
    )
  )

  return finalCount
})

// ============================================================================
// 6. Time-Based Scheduling
// ============================================================================

/**
 * Retry with total time limit (elapsed time)
 */
const retryWithTimeLimit = Effect.gen(function* () {
  yield* Console.log("Retry with 500ms time limit...")

  try {
    const result = yield* pipe(
      flakyOperation("TimeLimitAPI", 0.1),
      Effect.retry(
        pipe(
          Schedule.jittered(Schedule.exponential(Duration.millis(50))),
          Schedule.intersect(Schedule.elapsed),
          Schedule.whileOutput((elapsed) =>
            Duration.lessThan(elapsed, Duration.millis(500))
          ),
          Schedule.tapOutput((duration, attempt) =>
            Console.log(`  ⏱️  Retry ${attempt + 1} after ${Duration.toMillis(duration).toFixed(0)}ms`)
          )
        )
      )
    )
    return result
  } catch (error) {
    yield* Console.log("⏰ Time limit exceeded")
    throw error
  }
})

// ============================================================================
// 7. Practical Examples
// ============================================================================

/**
 * Database connection retry
 */
const connectToDatabase = (dbName: string, successRate: number = 0.3) =>
  Effect.gen(function* () {
    yield* Console.log(`🔌 Connecting to database: ${dbName}...`)

    const result = yield* pipe(
      flakyOperation(`DB-${dbName}`, successRate),
      Effect.retry(
        pipe(
          Schedule.jittered(Schedule.exponential(Duration.millis(100), 2.0)),
          Schedule.compose(Schedule.recurs(4)),
          Schedule.tapOutput((duration, attempt) =>
            Console.log(`  🔄 Retry ${attempt + 1} after ${Duration.toMillis(duration).toFixed(0)}ms`)
          )
        )
      ),
      Effect.tap(() => Console.log(`💾 Connected to ${dbName}`))
    )

    return result
  })

/**
 * API call with retry and fallback
 */
const fetchWithRetryAndFallback = (url: string) =>
  Effect.gen(function* () {
    yield* Console.log(`🌐 Fetching: ${url}...`)

    const result = yield* pipe(
      flakyOperation(url, 0.3),
      Effect.retry(
        pipe(
          Schedule.jittered(Schedule.exponential(Duration.millis(100))),
          Schedule.compose(Schedule.recurs(2)),
          Schedule.tapOutput((duration, attempt) =>
            Console.log(`  ↻ Retry ${attempt + 1} after ${Duration.toMillis(duration).toFixed(0)}ms`)
          )
        )
      ),
      Effect.catchAll((_error) =>
        Effect.gen(function* () {
          yield* Console.log(`  ⚠️  All retries failed, using cached data`)
          return "cached-data"
        })
      )
    )

    return result
  })

/**
 * Health check with periodic retries
 */
const healthCheck = (serviceName: string) =>
  Effect.gen(function* () {
    yield* Console.log(`🏥 Health check: ${serviceName}...`)

    const result = yield* pipe(
      flakyOperation(`HealthCheck-${serviceName}`, 0.4),
      Effect.retry(
        pipe(
          Schedule.jittered(Schedule.exponential(Duration.millis(200))),
          Schedule.compose(Schedule.recurs(3)),
          Schedule.tapOutput((duration, attempt) =>
            Console.log(`  🔄 Retry ${attempt + 1} after ${Duration.toMillis(duration).toFixed(0)}ms`)
          )
        )
      ),
      Effect.tap(() => Console.log(`✅ ${serviceName} is healthy`)),
      Effect.catchAll(() =>
        Effect.gen(function* () {
          yield* Console.log(`❌ ${serviceName} is unhealthy`)
          return "unhealthy"
        })
      )
    )

    return result
  })

// ============================================================================
// 8. Conditional Retry
// ============================================================================

/**
 * Retry only on specific conditions
 */
const conditionalRetry = Effect.gen(function* () {
  yield* Console.log("Conditional retry (only retry on 'temporary' errors)...")

  let attemptCount = 0
  const conditionalOperation = Effect.gen(function* () {
    attemptCount++
    const random = yield* Random.next

    if (attemptCount === 1) {
      yield* Console.log("❌ Temporary error (will retry)")
      return yield* Effect.fail(new Error("temporary"))
    }

    if (random > 0.5) {
      yield* Console.log("✅ Success")
      return "success"
    }

    yield* Console.log("❌ Permanent error (won't retry)")
    return yield* Effect.fail(new Error("permanent"))
  })

  try {
    const result = yield* pipe(
      conditionalOperation,
      Effect.retry({
        while: (error) => error.message === "temporary",
        times: 3
      })
    )
    return result
  } catch (error) {
    yield* Console.log(`Final error: ${(error as Error).message}`)
    return "failed"
  }
})

// ============================================================================
// Main Example Runner
// ============================================================================

async function main() {
  console.log("=== Scheduling Basics Examples ===\n")

  console.log("1. Simple retry:")
  try {
    await Effect.runPromise(simpleRetry)
  } catch {
    console.log("Failed after all retries")
  }
  console.log()

  console.log("2. Retry with fixed delay:")
  try {
    await Effect.runPromise(retryWithFixedDelay)
  } catch {
    console.log("Failed after all retries")
  }
  console.log()

  console.log("3. Exponential backoff:")
  try {
    await Effect.runPromise(exponentialBackoff)
  } catch {
    console.log("Failed after all retries")
  }
  console.log()

  console.log("4. Full jitter backoff:")
  try {
    await Effect.runPromise(fullJitterBackoff)
  } catch {
    console.log("Failed after all retries")
  }
  console.log()

  console.log("5. Linear backoff:")
  try {
    await Effect.runPromise(linearBackoff)
  } catch {
    console.log("Failed after all retries")
  }
  console.log()

  console.log("6. Repeat task:")
  await Effect.runPromise(repeatTask)
  console.log()

  console.log("7. Database connection:")
  try {
    await Effect.runPromise(connectToDatabase("production", 0.3))
  } catch {
    console.log("Connection failed")
  }
  console.log()

  console.log("8. API with retry and fallback:")
  await Effect.runPromise(fetchWithRetryAndFallback("api/users"))
  console.log()

  console.log("9. Health check:")
  await Effect.runPromise(healthCheck("auth-service"))
  console.log()

  console.log("10. Conditional retry:")
  await Effect.runPromise(conditionalRetry)
  console.log()
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error)
}

/**
 * Expected Output:
 * ================
 *
 * This example demonstrates:
 * - Simple retry attempts the operation multiple times
 * - Fixed delay waits a constant time between retries
 * - Exponential backoff increases delay exponentially (100ms, 200ms, 400ms...)
 * - Jitter adds randomness to avoid thundering herd problem
 * - Linear and Fibonacci provide alternative backoff strategies
 * - Repeat executes tasks multiple times with spacing
 * - Time limits stop retrying after elapsed time threshold
 * - Conditional retry only retries on specific error types
 *
 * Key Takeaways:
 * - Effect.retry adds retry logic to any effect
 * - Schedules define the timing and count of retries
 * - Exponential backoff with jitter is best for most cases
 * - Use Schedule.compose to combine retry count and timing
 * - Schedule.tapOutput logs retry attempts
 * - Effect.repeat runs tasks multiple times
 * - Conditional retry (while) filters which errors to retry
 *
 * When to Use:
 * - Exponential backoff: Network calls, API requests
 * - Jitter: Multiple clients accessing same resource
 * - Linear: Predictable retry intervals needed
 * - Fixed: Simple scenarios with known recovery time
 * - Time limits: Prevent indefinite retries
 * - Conditional: Different handling for different errors
 */
