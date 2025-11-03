import { describe, it, expect } from "vitest"
import { Effect, pipe } from "effect"
import {
  retryWithBackoff,
  retryOnError,
  timeoutWith,
  tapWhen,
  filterOrFail,
  withDefault,
  when,
  ifThenElse,
  withTiming,
  batchProcess,
  fetchWithRetry,
  cachedApiCall,
  processWithFallback,
  conditionalProcess,
  batchApiRequests,
} from "./custom-operators"

describe("Custom Operators", () => {
  // ============================================================================
  // Retry Operators
  // ============================================================================

  describe("Retry Operators", () => {
    it("should retry with backoff until success", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        return attempts < 3
          ? Effect.fail(new Error("Temporary failure"))
          : Effect.succeed("Success")
      })

      const result = await Effect.runPromise(
        pipe(effect, retryWithBackoff(5, 10))
      )

      expect(result).toBe("Success")
      expect(attempts).toBe(3)
    })

    it("should fail after max attempts", async () => {
      const effect = Effect.fail(new Error("Always fails"))

      await expect(
        Effect.runPromise(pipe(effect, retryWithBackoff(2, 10)))
      ).rejects.toThrow("Always fails")
    })

    it("should retry only on specific errors", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        return attempts < 2
          ? Effect.fail(new Error("RETRY_ME"))
          : Effect.succeed("Success")
      })

      const result = await Effect.runPromise(
        pipe(
          effect,
          retryOnError((error) => error.message === "RETRY_ME", 3)
        )
      )

      expect(result).toBe("Success")
      expect(attempts).toBe(2)
    })
  })

  // ============================================================================
  // Timeout Operators
  // ============================================================================

  describe("Timeout Operators", () => {
    it("should use fallback on timeout", async () => {
      const slowEffect = pipe(
        Effect.sleep("100 millis"),
        Effect.map(() => "slow")
      )

      const result = await Effect.runPromise(
        pipe(slowEffect, timeoutWith("10 millis", "fallback"))
      )

      expect(result).toBe("fallback")
    })

    it("should return result if completes before timeout", async () => {
      const fastEffect = pipe(
        Effect.sleep("10 millis"),
        Effect.map(() => "fast")
      )

      const result = await Effect.runPromise(
        pipe(fastEffect, timeoutWith("100 millis", "fallback"))
      )

      expect(result).toBe("fast")
    })
  })

  // ============================================================================
  // Tap Operators
  // ============================================================================

  describe("Tap Operators", () => {
    it("should tap only when condition is true", async () => {
      let tapped = false

      const effect = Effect.succeed(10)

      const result = await Effect.runPromise(
        pipe(
          effect,
          tapWhen(
            (n) => n > 5,
            () => Effect.sync(() => { tapped = true })
          )
        )
      )

      expect(result).toBe(10)
      expect(tapped).toBe(true)
    })

    it("should not tap when condition is false", async () => {
      let tapped = false

      const effect = Effect.succeed(3)

      const result = await Effect.runPromise(
        pipe(
          effect,
          tapWhen(
            (n) => n > 5,
            () => Effect.sync(() => { tapped = true })
          )
        )
      )

      expect(result).toBe(3)
      expect(tapped).toBe(false)
    })
  })

  // ============================================================================
  // Filtering Operators
  // ============================================================================

  describe("Filtering Operators", () => {
    it("should pass through when predicate is true", async () => {
      const effect = Effect.succeed(10)

      const result = await Effect.runPromise(
        pipe(
          effect,
          filterOrFail(
            (n) => n > 5,
            () => new Error("Too small")
          )
        )
      )

      expect(result).toBe(10)
    })

    it("should fail when predicate is false", async () => {
      const effect = Effect.succeed(3)

      await expect(
        Effect.runPromise(
          pipe(
            effect,
            filterOrFail(
              (n) => n > 5,
              () => new Error("Too small")
            )
          )
        )
      ).rejects.toThrow("Too small")
    })
  })

  // ============================================================================
  // Fallback Operators
  // ============================================================================

  describe("Fallback Operators", () => {
    it("should use default value on failure", async () => {
      const effect = Effect.fail(new Error("Failure"))

      const result = await Effect.runPromise(
        pipe(effect, withDefault("default"))
      )

      expect(result).toBe("default")
    })

    it("should return original value on success", async () => {
      const effect = Effect.succeed("success")

      const result = await Effect.runPromise(
        pipe(effect, withDefault("default"))
      )

      expect(result).toBe("success")
    })
  })

  // ============================================================================
  // Conditional Execution
  // ============================================================================

  describe("Conditional Execution", () => {
    it("should execute effect when condition is true", async () => {
      const result = await Effect.runPromise(
        pipe(Effect.succeed(42), when(true, 0))
      )

      expect(result).toBe(42)
    })

    it("should use fallback when condition is false", async () => {
      const result = await Effect.runPromise(
        pipe(Effect.succeed(42), when(false, 0))
      )

      expect(result).toBe(0)
    })

    it("should execute correct branch with ifThenElse", async () => {
      const result1 = await Effect.runPromise(
        ifThenElse(true, Effect.succeed("true"), Effect.succeed("false"))
      )

      expect(result1).toBe("true")

      const result2 = await Effect.runPromise(
        ifThenElse(false, Effect.succeed("true"), Effect.succeed("false"))
      )

      expect(result2).toBe("false")
    })
  })

  // ============================================================================
  // Logging Operators
  // ============================================================================

  describe("Logging Operators", () => {
    it("should log execution time", async () => {
      const effect = Effect.sleep("10 millis")

      const result = await Effect.runPromise(
        pipe(effect, withTiming("test-operation"))
      )

      expect(result).toBeUndefined()
    })
  })

  // ============================================================================
  // Batching Operators
  // ============================================================================

  describe("Batching Operators", () => {
    it("should process items in batches", async () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

      const result = await Effect.runPromise(
        pipe(
          items,
          batchProcess(3, 2, (n) => Effect.succeed(n * 2))
        )
      )

      expect(result).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20])
    })
  })

  // ============================================================================
  // Practical Examples
  // ============================================================================

  describe("Practical Examples", () => {
    it.skip("should fetch with retry", async () => {
      const result = await Effect.runPromise(
        fetchWithRetry("https://api.example.com/data")
      )

      expect(result).toBeDefined()
      if (result) {
        expect(result.status).toBe(200)
        expect(result.data).toContain("api.example.com")
      }
    })

    it("should use cached API call", async () => {
      const result1 = await Effect.runPromise(
        cachedApiCall("/api/users")
      )

      const result2 = await Effect.runPromise(
        cachedApiCall("/api/users")
      )

      expect(result1.data).toContain("users")
      expect(result2.data).toContain("users")
    })

    it("should process with fallback", async () => {
      const result = await Effect.runPromise(
        processWithFallback("test-data")
      )

      expect(result).toContain("test-data")
    })

    it("should conditionally process values", async () => {
      const result1 = await Effect.runPromise(
        conditionalProcess(10, 5)
      )

      expect(result1.processed).toBe(true)
      expect(result1.result).toBe(20)

      const result2 = await Effect.runPromise(
        conditionalProcess(3, 5)
      )

      expect(result2.processed).toBe(false)
      expect(result2.result).toBe(3)
    })

    it("should batch API requests", async () => {
      const ids = [1, 2, 3, 4, 5]

      const result = await Effect.runPromise(
        batchApiRequests(ids)
      )

      expect(result).toHaveLength(5)
      result.forEach((item, index) => {
        expect(item.id).toBe(ids[index])
      })
    })
  })
})
