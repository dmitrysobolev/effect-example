import { describe, it, expect } from "vitest"
import { Effect, Duration, Schedule, pipe } from "effect"
import {
  fixedDelaySchedule,
  exponentialSchedule,
  spacedSchedule,
  limitedRecurs,
  fullJitterSchedule,
  proportionalJitterSchedule,
  equalJitterSchedule,
  decorrelatedJitterSchedule,
  cappedJitterSchedule,
  fibonacciJitterSchedule,
  linearJitterSchedule,
  timedJitterSchedule,
  retryWithFullJitter,
  retryWithCappedJitter,
  retryWithLogging,
  flakyApiCall,
  repeatWithJitter,
  scheduledTaskWithJitter,
  connectToDatabase,
  fetchWithRetry,
  processBatchWithJitter,
  circuitBreakerExample,
  healthCheckWithRetry,
  unionScheduleExample,
  intersectionScheduleExample,
  elapsedTimeSchedule,
} from "./scheduling"

describe("Scheduling and Jittered Delays", () => {
  // ============================================================================
  // 1. Basic Schedules
  // ============================================================================

  describe("Basic Schedules", () => {
    it("should retry with fixed delay schedule", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 3) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("success")
      })

      const result = await Effect.runPromise(
        pipe(effect, Effect.retry(fixedDelaySchedule))
      )

      expect(result).toBe("success")
      expect(attempts).toBe(3)
    })

    it("should retry with exponential backoff schedule", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 4) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("exponential success")
      })

      const result = await Effect.runPromise(
        pipe(effect, Effect.retry(exponentialSchedule))
      )

      expect(result).toBe("exponential success")
      expect(attempts).toBe(4)
    })

    it("should respect spaced schedule delays", async () => {
      let executions = 0
      const task = Effect.sync(() => {
        executions++
        return executions
      })

      const startTime = Date.now()
      await Effect.runPromise(
        pipe(
          task,
          Effect.repeat(pipe(spacedSchedule, Schedule.compose(Schedule.recurs(2))))
        )
      )
      const duration = Date.now() - startTime

      expect(executions).toBe(3) // Initial + 2 repeats
      // Should take at least 2 * 200ms = 400ms for spaced delays
      expect(duration).toBeGreaterThanOrEqual(350)
    })

    it("should limit retries with recurs schedule", async () => {
      let attempts = 0
      const alwaysFailing = Effect.suspend(() => {
        attempts++
        return Effect.fail(new Error("Always fails"))
      })

      try {
        await Effect.runPromise(
          pipe(alwaysFailing, Effect.retry(limitedRecurs))
        )
        expect.fail("Should have failed after max retries")
      } catch (error) {
        // Should attempt initial + 5 retries = 6 total
        expect(attempts).toBe(6)
      }
    })
  })

  // ============================================================================
  // 2. Jittered Delays
  // ============================================================================

  describe("Jittered Delays", () => {
    it("should apply full jitter to schedule", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 3) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("jittered success")
      })

      const result = await Effect.runPromise(
        pipe(effect, Effect.retry(fullJitterSchedule))
      )

      expect(result).toBe("jittered success")
      expect(attempts).toBe(3)
    })

    it("should apply proportional jitter with custom factor", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 3) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("proportional jitter success")
      })

      const result = await Effect.runPromise(
        pipe(effect, Effect.retry(proportionalJitterSchedule(0.3)))
      )

      expect(result).toBe("proportional jitter success")
      expect(attempts).toBe(3)
    })

    it("should apply equal jitter strategy", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 2) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("equal jitter success")
      })

      const result = await Effect.runPromise(
        pipe(effect, Effect.retry(equalJitterSchedule))
      )

      expect(result).toBe("equal jitter success")
      expect(attempts).toBe(2)
    })

    it("should apply decorrelated jitter strategy", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 3) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("decorrelated jitter success")
      })

      const result = await Effect.runPromise(
        pipe(effect, Effect.retry(decorrelatedJitterSchedule))
      )

      expect(result).toBe("decorrelated jitter success")
      expect(attempts).toBe(3)
    })
  })

  // ============================================================================
  // 3. Fibonacci and Linear Schedules
  // ============================================================================

  describe("Fibonacci and Linear Schedules", () => {
    it("should retry with fibonacci backoff and jitter", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 4) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("fibonacci success")
      })

      const result = await Effect.runPromise(
        pipe(effect, Effect.retry(fibonacciJitterSchedule))
      )

      expect(result).toBe("fibonacci success")
      expect(attempts).toBe(4)
    })

    it("should retry with linear backoff and jitter", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 3) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("linear success")
      })

      const result = await Effect.runPromise(
        pipe(effect, Effect.retry(linearJitterSchedule))
      )

      expect(result).toBe("linear success")
      expect(attempts).toBe(3)
    })

    it("should demonstrate fibonacci delay progression", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 5) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("fib progression")
      })

      const startTime = Date.now()
      const result = await Effect.runPromise(
        pipe(
          effect,
          Effect.retry(
            pipe(
              Schedule.fibonacci(Duration.millis(50)),
              Schedule.compose(Schedule.recurs(5))
            )
          )
        )
      )
      const duration = Date.now() - startTime

      expect(result).toBe("fib progression")
      // Fibonacci delays: 50, 50, 100, 150 = ~350ms minimum
      expect(duration).toBeGreaterThanOrEqual(300)
    })

    it("should demonstrate linear delay progression", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 4) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("linear progression")
      })

      const startTime = Date.now()
      const result = await Effect.runPromise(
        pipe(
          effect,
          Effect.retry(
            pipe(
              Schedule.linear(Duration.millis(50)),
              Schedule.compose(Schedule.recurs(4))
            )
          )
        )
      )
      const duration = Date.now() - startTime

      expect(result).toBe("linear progression")
      // Linear delays: 50, 100, 150 = ~300ms minimum
      expect(duration).toBeGreaterThanOrEqual(250)
    })
  })

  // ============================================================================
  // 4. Capped and Combined Schedules
  // ============================================================================

  describe("Capped and Combined Schedules", () => {
    it("should cap delays at maximum value", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 5) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("capped success")
      })

      const result = await Effect.runPromise(
        pipe(effect, Effect.retry(cappedJitterSchedule(50, 200, 10)))
      )

      expect(result).toBe("capped success")
      expect(attempts).toBe(5)
    })

    it("should respect maximum retry limit in capped schedule", async () => {
      let attempts = 0
      const alwaysFailing = Effect.suspend(() => {
        attempts++
        return Effect.fail(new Error("Always fails"))
      })

      try {
        await Effect.runPromise(
          pipe(alwaysFailing, Effect.retry(cappedJitterSchedule(50, 200, 3)))
        )
        expect.fail("Should have failed after max retries")
      } catch (error) {
        // Initial attempt + 3 retries = 4 total
        expect(attempts).toBe(4)
      }
    })

    it("should timeout based on elapsed time", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        return Effect.fail(new Error("Retry"))
      })

      const startTime = Date.now()
      try {
        await Effect.runPromise(
          pipe(effect, Effect.retry(timedJitterSchedule(50, 500)))
        )
        expect.fail("Should have timed out")
      } catch (error) {
        const duration = Date.now() - startTime
        // Should stop after ~500ms
        expect(duration).toBeLessThan(800)
        expect(attempts).toBeGreaterThanOrEqual(1)
      }
    })
  })

  // ============================================================================
  // 5. Retry with Jittered Delays
  // ============================================================================

  describe("Retry with Jitter", () => {
    it("should eventually succeed with flaky operation", async () => {
      // Low failure rate to ensure eventual success within retries
      const result = await Effect.runPromise(
        retryWithLogging(flakyApiCall("TestAPI", 0.2), "TestAPI", 10)
      )

      expect(result).toBe("TestAPI result")
    }, 15000)

    it("should retry failing operation and eventually succeed", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 3) {
          return Effect.fail(new Error("Retry me"))
        }
        return Effect.succeed("success")
      })

      const result = await Effect.runPromise(retryWithFullJitter(effect, 5))

      expect(result).toBe("success")
      expect(attempts).toBe(3)
    })

    it("should retry with capped jitter", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 3) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("capped jitter success")
      })

      const result = await Effect.runPromise(
        retryWithCappedJitter(effect, 50, 200, 5)
      )

      expect(result).toBe("capped jitter success")
      expect(attempts).toBe(3)
    })

    it("should log retry attempts", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 2) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("logged success")
      })

      const result = await Effect.runPromise(
        retryWithLogging(effect, "LoggedOperation", 5)
      )

      expect(result).toBe("logged success")
      expect(attempts).toBe(2)
    })
  })

  // ============================================================================
  // 6. Scheduled Recurring Tasks
  // ============================================================================

  describe("Recurring Tasks", () => {
    it("should repeat task multiple times", async () => {
      let executions = 0
      const task = Effect.sync(() => {
        executions++
        return executions
      })

      await Effect.runPromise(repeatWithJitter(task, 3))

      // Effect.repeat executes once initially, then repeats (times - 1) more
      expect(executions).toBe(3)
    })

    it("should schedule tasks with jittered intervals", async () => {
      let executions = 0
      const task = Effect.sync(() => {
        executions++
      })

      const startTime = Date.now()
      await Effect.runPromise(scheduledTaskWithJitter(task, 100, 3))
      const duration = Date.now() - startTime

      expect(executions).toBe(3)
      // With ±20% jitter on 100ms intervals, expect 2 intervals (200ms ± jitter)
      expect(duration).toBeGreaterThanOrEqual(150)
      expect(duration).toBeLessThan(400)
    })

    it("should handle task failures in recurring schedule", async () => {
      let executions = 0
      const task = Effect.suspend(() => {
        executions++
        if (executions === 2) {
          return Effect.fail(new Error("Temporary failure"))
        }
        return Effect.void
      })

      try {
        await Effect.runPromise(repeatWithJitter(task, 3))
        expect.fail("Should have failed on second execution")
      } catch (error: any) {
        expect(error.message).toBe("Temporary failure")
        expect(executions).toBe(2)
      }
    })
  })

  // ============================================================================
  // 7. Practical Examples
  // ============================================================================

  describe("Circuit Breaker with Jitter", () => {
    it("should demonstrate circuit breaker pattern", async () => {
      let attempts = 0
      const successfulOperation = Effect.suspend(() => {
        attempts++
        return Effect.succeed("success")
      })

      const result = await Effect.runPromise(
        circuitBreakerExample(successfulOperation, 3)
      )

      expect(result).toBe("success")
      expect(attempts).toBe(1)
    })

    it("should handle immediate success", async () => {
      const operation = Effect.succeed("immediate result")

      const result = await Effect.runPromise(
        circuitBreakerExample(operation, 5)
      )

      expect(result).toBe("immediate result")
    })
  })

  describe("Batch Processing with Retry", () => {
    it("should process batch items with jittered delays", async () => {
      const items = ["item1", "item2", "item3", "item4"]
      const processed: string[] = []

      const processItem = (item: string) =>
        Effect.sync(() => {
          processed.push(item)
        })

      const startTime = Date.now()
      await Effect.runPromise(processBatchWithJitter(items, processItem))
      const duration = Date.now() - startTime

      expect(processed).toEqual(items)
      // Should have delays between items (except first)
      expect(duration).toBeGreaterThanOrEqual(100)
    })

    it("should handle errors in batch processing", async () => {
      const items = ["item1", "item2", "item3"]
      const processed: string[] = []

      const processItem = (item: string) =>
        Effect.suspend(() => {
          if (item === "item2") {
            return Effect.fail(new Error("Processing failed"))
          }
          processed.push(item)
          return Effect.void
        })

      try {
        await Effect.runPromise(processBatchWithJitter(items, processItem))
        expect.fail("Should have failed on item2")
      } catch (error: any) {
        expect(error.message).toBe("Processing failed")
        expect(processed).toEqual(["item1"])
      }
    })
  })

  describe("Health Check Monitoring", () => {
    it("should pass when health check succeeds", async () => {
      const healthyService = Effect.succeed(true)

      const result = await Effect.runPromise(
        healthCheckWithRetry("MyService", healthyService)
      )

      expect(result).toBe(true)
    })

    it("should retry unhealthy service and eventually succeed", async () => {
      let checks = 0
      const recoveringService = Effect.suspend(() => {
        checks++
        return Effect.succeed(checks >= 3)
      })

      const result = await Effect.runPromise(
        healthCheckWithRetry("RecoveringService", recoveringService)
      )

      expect(result).toBe(true)
      expect(checks).toBe(3)
    })

    it("should fail after max retries if service remains unhealthy", async () => {
      const unhealthyService = Effect.succeed(false)

      const result = await Effect.runPromise(
        healthCheckWithRetry("UnhealthyService", unhealthyService)
      )

      // catchAll returns false instead of throwing
      expect(result).toBe(false)
    })

    it("should handle health check errors", async () => {
      let attempts = 0
      const errorService = Effect.suspend(() => {
        attempts++
        if (attempts < 2) {
          return Effect.fail(new Error("Connection refused"))
        }
        return Effect.succeed(true)
      })

      const result = await Effect.runPromise(
        healthCheckWithRetry("ErrorService", errorService)
      )

      expect(result).toBe(true)
      expect(attempts).toBe(2)
    })
  })

  describe("Database Connection with Retry", () => {
    it("should connect to database after retries", async () => {
      // Use low failure rate to ensure connection succeeds
      const result = await Effect.runPromise(connectToDatabase("test-db", 0.3))

      expect(result).toContain("DB-Connect-test-db")
    }, 10000)

    it("should fail after exhausting retries", async () => {
      // High failure rate to ensure all retries fail
      try {
        await Effect.runPromise(connectToDatabase("failing-db", 0.99))
        expect.fail("Should have failed after all retries")
      } catch (error: any) {
        // Should fail with the flaky API error
        expect(error.message).toBeTruthy()
      }
    }, 10000)
  })

  describe("Fetch with Retry", () => {
    it("should fetch successfully after retries", async () => {
      let attempts = 0
      const operation = Effect.suspend(() => {
        attempts++
        if (attempts < 2) {
          return Effect.fail(new Error("Network error"))
        }
        return Effect.succeed({ data: "fetched" })
      })

      const result = await Effect.runPromise(
        fetchWithRetry("https://api.example.com/data", operation, 5)
      )

      expect(result).toEqual({ data: "fetched" })
      expect(attempts).toBe(2)
    })

    it("should respect max retries in fetch", async () => {
      const alwaysFailing = Effect.fail(new Error("Network error"))

      try {
        await Effect.runPromise(
          fetchWithRetry("https://api.example.com/data", alwaysFailing, 3)
        )
        expect.fail("Should have failed after max retries")
      } catch (error: any) {
        expect(error.message).toBe("Network error")
      }
    })
  })

  // ============================================================================
  // 8. Schedule Combinators
  // ============================================================================

  describe("Schedule Combinators", () => {
    it("should combine schedules with union", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 4) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("union success")
      })

      const result = await Effect.runPromise(
        pipe(effect, Effect.retry(unionScheduleExample))
      )

      expect(result).toBe("union success")
      expect(attempts).toBe(4)
    })

    it("should combine schedules with intersection", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 3) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("intersection success")
      })

      const result = await Effect.runPromise(
        pipe(effect, Effect.retry(intersectionScheduleExample))
      )

      expect(result).toBe("intersection success")
      expect(attempts).toBe(3)
    })

    it("should limit by intersection - retries", async () => {
      let attempts = 0
      const alwaysFailing = Effect.suspend(() => {
        attempts++
        return Effect.fail(new Error("Always fails"))
      })

      try {
        await Effect.runPromise(
          pipe(alwaysFailing, Effect.retry(intersectionScheduleExample))
        )
        expect.fail("Should have failed after intersect limit")
      } catch (error) {
        // Intersection with recurs(3) means max 3 retries + 1 initial = 4 total
        expect(attempts).toBe(4)
      }
    })

    it("should track elapsed time schedule", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        return Effect.fail(new Error("Retry"))
      })

      const startTime = Date.now()
      try {
        await Effect.runPromise(
          pipe(effect, Effect.retry(elapsedTimeSchedule(400)))
        )
        expect.fail("Should have stopped due to elapsed time")
      } catch (error) {
        const duration = Date.now() - startTime
        // Should stop around 400ms
        expect(duration).toBeLessThan(700)
        expect(attempts).toBeGreaterThanOrEqual(1)
      }
    })
  })

  // ============================================================================
  // 9. Timing and Jitter Distribution
  // ============================================================================

  describe("Timing Assertions and Jitter Distribution", () => {
    it("should verify jitter adds randomness to delays", async () => {
      const delays: number[] = []
      let attempts = 0

      const effect = Effect.suspend(() => {
        const now = Date.now()
        if (attempts > 0) {
          delays.push(now - lastTime)
        }
        lastTime = now
        attempts++
        if (attempts < 5) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("done")
      })

      let lastTime = Date.now()
      await Effect.runPromise(
        pipe(effect, Effect.retry(fullJitterSchedule))
      )

      // With jitter, delays should vary
      expect(delays.length).toBe(4)
      // Check that not all delays are identical (jitter creates variance)
      const uniqueDelays = new Set(delays.map((d) => Math.floor(d / 10)))
      expect(uniqueDelays.size).toBeGreaterThan(1)
    })

    it("should verify exponential growth in delays", async () => {
      const delays: number[] = []
      let attempts = 0

      const effect = Effect.suspend(() => {
        const now = Date.now()
        if (attempts > 0) {
          delays.push(now - lastTime)
        }
        lastTime = now
        attempts++
        if (attempts < 4) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("done")
      })

      let lastTime = Date.now()
      await Effect.runPromise(
        pipe(
          effect,
          Effect.retry(
            pipe(
              Schedule.exponential(Duration.millis(100)),
              Schedule.compose(Schedule.recurs(5))
            )
          )
        )
      )

      expect(delays.length).toBe(3)
      // Exponential: ~100ms, ~200ms, ~400ms
      expect(delays[0]).toBeGreaterThanOrEqual(80)
      expect(delays[0]).toBeLessThan(150)
      expect(delays[1]).toBeGreaterThanOrEqual(150)
      expect(delays[1]).toBeLessThan(250)
      expect(delays[2]).toBeGreaterThanOrEqual(300)
    })

    it("should verify fixed delays are consistent", async () => {
      const delays: number[] = []
      let attempts = 0

      const effect = Effect.suspend(() => {
        const now = Date.now()
        if (attempts > 0) {
          delays.push(now - lastTime)
        }
        lastTime = now
        attempts++
        if (attempts < 4) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("done")
      })

      let lastTime = Date.now()
      await Effect.runPromise(
        pipe(
          effect,
          Effect.retry(
            pipe(
              Schedule.fixed(Duration.millis(100)),
              Schedule.compose(Schedule.recurs(5))
            )
          )
        )
      )

      expect(delays.length).toBe(3)
      // All delays should be approximately 100ms
      delays.forEach((delay) => {
        expect(delay).toBeGreaterThanOrEqual(80)
        expect(delay).toBeLessThan(150)
      })
    })
  })
})
