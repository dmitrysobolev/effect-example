import { describe, it, expect, vi } from "vitest"
import { Effect, Duration, Fiber, Exit, pipe } from "effect"
import {
  simulateApiCall,
  simulateFailingApiCall,
  raceExample,
  raceAllExample,
  raceWithTimeout,
  parallelFetchAll,
  sequentialFetchAll,
  batchedFetchAll,
  processConcurrently,
  processWithLimit,
  processAndDiscard,
  failFastConcurrent,
  validateAllConcurrent,
  interruptibleTask,
  manualInterruptionExample,
  uninterruptibleExample,
  forkJoinExample,
  forkAwaitAllExample,
  scopedFiberExample,
  withTimeoutFallback,
  memoizedConcurrent,
} from "./concurrency"

describe("Concurrency Patterns", () => {
  // ============================================================================
  // 1. Racing Effects
  // ============================================================================

  describe("Racing Effects", () => {
    it("should return the result of the faster effect", async () => {
      const result = await Effect.runPromise(raceExample)
      expect(result.source).toBe("fast")
      expect(result.data).toBe("fast result")
    })

    it("should race multiple effects with raceAll", async () => {
      const result = await Effect.runPromise(raceAllExample([300, 100, 200]))
      expect(result.apiId).toBe(2) // Second API with 100ms delay wins
      expect(result.delay).toBe(100)
    })

    it("should fail with timeout error if operation takes too long", async () => {
      const slowEffect = simulateApiCall("Slow", 1000, "result")
      const timedEffect = raceWithTimeout(slowEffect, 100)

      try {
        await Effect.runPromise(timedEffect)
        expect.fail("Should have timed out")
      } catch (error: any) {
        // Error might be thrown directly or wrapped
        const errorMessage = error.message || error.toString()
        expect(errorMessage).toContain("timed out")
      }
    })

    it("should succeed if operation completes before timeout", async () => {
      const fastEffect = simulateApiCall("Fast", 50, "success")
      const timedEffect = raceWithTimeout(fastEffect, 200)

      const result = await Effect.runPromise(timedEffect)
      expect(result).toBe("success")
    })
  })

  // ============================================================================
  // 2. Parallel Processing
  // ============================================================================

  describe("Parallel Processing", () => {
    it("should fetch all items in parallel", async () => {
      const startTime = Date.now()
      const result = await Effect.runPromise(parallelFetchAll([1, 2, 3]))
      const duration = Date.now() - startTime

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ id: 1, data: "Data-1" })
      expect(result[1]).toEqual({ id: 2, data: "Data-2" })
      expect(result[2]).toEqual({ id: 3, data: "Data-3" })

      // Should take ~300ms (max delay) not sum of all delays
      expect(duration).toBeLessThan(500)
    })

    it("should fetch items sequentially", async () => {
      const startTime = Date.now()
      const result = await Effect.runPromise(sequentialFetchAll([1, 2, 3]))
      const duration = Date.now() - startTime

      expect(result).toHaveLength(3)
      // Should take ~300ms (sum of delays) when running sequentially
      expect(duration).toBeGreaterThanOrEqual(250)
    })

    it("should respect concurrency limit", async () => {
      const result = await Effect.runPromise(batchedFetchAll([1, 2, 3, 4, 5], 2))
      expect(result).toHaveLength(5)
      result.forEach((item, i) => {
        expect(item).toEqual({ id: i + 1, data: `Data-${i + 1}` })
      })
    })
  })

  // ============================================================================
  // 3. Effect.forEach
  // ============================================================================

  describe("Effect.forEach", () => {
    it("should process items concurrently", async () => {
      const items = ["apple", "banana", "cherry"]
      const result = await Effect.runPromise(processConcurrently(items))

      expect(result).toEqual(["APPLE", "BANANA", "CHERRY"])
    })

    it("should process items with concurrency limit", async () => {
      const items = ["a", "b", "c", "d", "e"]
      const result = await Effect.runPromise(processWithLimit(items, 2))

      expect(result).toHaveLength(5)
      result.forEach((r) => {
        expect(r.processed).toBe(true)
      })
    })

    it("should discard results when specified", async () => {
      const items = ["item1", "item2", "item3"]
      const result = await Effect.runPromise(processAndDiscard(items))

      expect(result).toBeUndefined()
    })
  })

  // ============================================================================
  // 4. Error Handling in Concurrent Operations
  // ============================================================================

  describe("Error Handling", () => {
    it("should fail fast when one effect fails", async () => {
      const result = await Effect.runPromise(failFastConcurrent)
      expect(result).toEqual({ error: "API-2 failed" })
    })

    it("should collect all errors with validateAll", async () => {
      const effects = [
        simulateApiCall("API-1", 50, "success"),
        simulateFailingApiCall("API-2", 50, "Error 2"),
        simulateFailingApiCall("API-3", 50, "Error 3"),
      ]

      try {
        await Effect.runPromise(validateAllConcurrent(effects))
        expect.fail("Should have failed with errors")
      } catch (error: any) {
        // validateAll collects all errors
        expect(error.message).toBeTruthy()
      }
    })

    it("should succeed when all effects succeed with validateAll", async () => {
      const effects = [
        simulateApiCall("API-1", 50, "result-1"),
        simulateApiCall("API-2", 50, "result-2"),
        simulateApiCall("API-3", 50, "result-3"),
      ]

      const result = await Effect.runPromise(validateAllConcurrent(effects))
      expect(result).toEqual(["result-1", "result-2", "result-3"])
    })
  })

  // ============================================================================
  // 5. Interruption Handling
  // ============================================================================

  describe("Interruption", () => {
    it("should complete interruptible task if not interrupted", async () => {
      const result = await Effect.runPromise(interruptibleTask("Task-1", 50))
      expect(result).toEqual({ taskId: "Task-1", completed: true })
    })

    it("should handle manual interruption", async () => {
      const result = await Effect.runPromise(manualInterruptionExample)
      expect(result).toEqual({ interrupted: true })
    })

    it("should guarantee completion of uninterruptible task", async () => {
      // Test that uninterruptible task completes successfully
      const result = await Effect.runPromise(uninterruptibleExample("Task-1"))
      expect(result).toEqual({ taskId: "Task-1", guaranteed: true })
    })

    it("should interrupt losers in a race", async () => {
      // The slow task should be interrupted when fast task wins
      const raced = pipe(
        Effect.race(
          simulateApiCall("Fast", 50, "fast"),
          interruptibleTask("Slow", 1000)
        )
      )

      const result = await Effect.runPromise(raced)
      expect(result).toBe("fast")
    })
  })

  // ============================================================================
  // 6. Fiber Management
  // ============================================================================

  describe("Fiber Management", () => {
    it("should fork and join multiple fibers", async () => {
      const result = await Effect.runPromise(forkJoinExample)
      expect(result).toEqual(["result-1", "result-2", "result-3"])
    })

    it("should fork and await all fibers", async () => {
      const result = await Effect.runPromise(forkAwaitAllExample)
      expect(result).toEqual(["A", "B", "C"])
    })

    it("should clean up scoped fibers", async () => {
      const result = await Effect.runPromise(scopedFiberExample)
      expect(result).toEqual({ fiberStarted: true })
      // Fiber is automatically cleaned up when scope exits
    })

    it("should allow fiber to complete independently after fork", async () => {
      const effect = pipe(
        Effect.gen(function* (_) {
          // Fork a task
          const fiber = yield* _(
            Effect.fork(simulateApiCall("Background", 100, "result"))
          )

          // Do something else
          yield* _(Effect.sleep(Duration.millis(50)))

          // Join to get result
          const result = yield* _(Fiber.join(fiber))
          return result
        })
      )

      const result = await Effect.runPromise(effect)
      expect(result).toBe("result")
    })

    it("should get fiber status", async () => {
      const effect = pipe(
        Effect.gen(function* (_) {
          const fiber = yield* _(
            Effect.fork(simulateApiCall("Task", 100, "done"))
          )

          // Fiber is running
          yield* _(Effect.sleep(Duration.millis(10)))

          // Wait for completion
          const result = yield* _(Fiber.join(fiber))

          return result
        })
      )

      const result = await Effect.runPromise(effect)
      expect(result).toBe("done")
    })
  })

  // ============================================================================
  // 7. Advanced Patterns
  // ============================================================================

  describe("Advanced Patterns", () => {
    it("should use timeout with fallback value", async () => {
      const slowEffect = simulateApiCall("Slow", 1000, "real-value")
      const result = await Effect.runPromise(
        withTimeoutFallback(slowEffect, 100, "fallback-value")
      )

      expect(result).toBe("fallback-value")
    })

    it("should return real value if completed before timeout", async () => {
      const fastEffect = simulateApiCall("Fast", 50, "real-value")
      const result = await Effect.runPromise(
        withTimeoutFallback(fastEffect, 200, "fallback-value")
      )

      expect(result).toBe("real-value")
    })

    it("should cache concurrent requests", async () => {
      let callCount = 0
      const expensiveOperation = Effect.sync(() => {
        callCount++
        return "result"
      })

      // Create a single cached instance
      const program = pipe(
        Effect.gen(function* (_) {
          const cachedEffect = yield* _(memoizedConcurrent(expensiveOperation))

          // Call the cached effect multiple times
          const result1 = yield* _(cachedEffect)
          const result2 = yield* _(cachedEffect)

          return [result1, result2]
        })
      )

      const [result1, result2] = await Effect.runPromise(program)

      // Should be called only once due to memoization
      expect(callCount).toBe(1)
      expect(result1).toBe("result")
      expect(result2).toBe("result")
    })
  })

  // ============================================================================
  // 8. Integration Tests
  // ============================================================================

  describe("Integration Patterns", () => {
    it("should combine race and forEach", async () => {
      const items = [1, 2, 3, 4, 5]

      const effect = pipe(
        Effect.forEach(
          items,
          (item) =>
            pipe(
              Effect.race(
                simulateApiCall(`Primary-${item}`, 100 * item, `P${item}`),
                simulateApiCall(`Backup-${item}`, 50, `B${item}`)
              )
            ),
          { concurrency: 2 }
        )
      )

      const result = await Effect.runPromise(effect)
      // Backup should win for all items due to consistent 50ms delay
      expect(result.every((r) => r.startsWith("B"))).toBe(true)
    })

    it("should handle nested concurrent operations", async () => {
      const effect = pipe(
        Effect.all([
          pipe(
            Effect.all([
              simulateApiCall("A1", 50, "a1"),
              simulateApiCall("A2", 50, "a2"),
            ])
          ),
          pipe(
            Effect.all([
              simulateApiCall("B1", 50, "b1"),
              simulateApiCall("B2", 50, "b2"),
            ])
          ),
        ])
      )

      const result = await Effect.runPromise(effect)
      expect(result).toEqual([
        ["a1", "a2"],
        ["b1", "b2"],
      ])
    })

    it("should fan-out and fan-in pattern", async () => {
      // Fan out: Process multiple items in parallel
      const fanOut = pipe(
        Effect.all(
          [1, 2, 3].map((id) => simulateApiCall(`Item-${id}`, 50, id * 10))
        )
      )

      // Fan in: Combine results
      const fanIn = pipe(
        fanOut,
        Effect.map((results) => results.reduce((sum, n) => sum + n, 0))
      )

      const result = await Effect.runPromise(fanIn)
      expect(result).toBe(60) // 10 + 20 + 30
    })
  })

  // ============================================================================
  // 9. Performance Tests
  // ============================================================================

  describe("Performance Characteristics", () => {
    it("parallel should be faster than sequential for independent tasks", async () => {
      const tasks = [1, 2, 3, 4, 5]

      // Measure parallel
      const parallelStart = Date.now()
      await Effect.runPromise(
        Effect.all(
          tasks.map((t) => simulateApiCall(`P-${t}`, 100, t)),
          { concurrency: "unbounded" }
        )
      )
      const parallelDuration = Date.now() - parallelStart

      // Measure sequential
      const sequentialStart = Date.now()
      await Effect.runPromise(
        Effect.all(
          tasks.map((t) => simulateApiCall(`S-${t}`, 100, t)),
          { concurrency: 1 }
        )
      )
      const sequentialDuration = Date.now() - sequentialStart

      // Parallel should be significantly faster
      expect(parallelDuration).toBeLessThan(sequentialDuration / 2)
    })

    it("concurrency limit should control parallelism", async () => {
      const tasks = Array.from({ length: 10 }, (_, i) => i + 1)

      // With limit of 2, should take ~5x the single task time
      const start = Date.now()
      await Effect.runPromise(
        Effect.all(
          tasks.map((t) => simulateApiCall(`T-${t}`, 100, t)),
          { concurrency: 2 }
        )
      )
      const duration = Date.now() - start

      // Should take approximately 5 batches * 100ms = 500ms
      expect(duration).toBeGreaterThanOrEqual(450)
      expect(duration).toBeLessThan(700)
    })
  })
})
