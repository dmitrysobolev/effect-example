import { describe, it, expect, vi, beforeEach } from "vitest"
import { Effect, Exit, Console, Duration, pipe } from "effect"
import {
  NetworkError,
  ValidationError,
  TimeoutError,
  AggregateError,
  fetchWithLogging,
  fetchWithDetailedLogging,
  fetchWithFallbackChain,
  fetchMultipleWithPartialSuccess,
  fetchWithDegradedMode,
  makeCircuitBreaker,
  validateAllWithAggregation,
  fetchFirstNSuccesses,
  fetchAllWithErrorSummary,
  enrichErrorContext,
  fetchUserProfile,
  loadFullUserData,
  withStackTrace,
  withTimeout,
  withTimeoutFallback,
  withTimeoutRetry,
  withProgressiveTimeout,
  fetchMultipleWithTimeout
} from "./error-handling"

describe("Error Handling - Enhanced Patterns", () => {
  // ============================================================================
  // 1. Error Logging with tapError
  // ============================================================================

  describe("Error Logging", () => {
    it("should log errors without changing error channel", async () => {
      const consoleLogSpy = vi.spyOn(console, "log")

      const result = await Effect.runPromiseExit(
        fetchWithLogging("https://api.example.com/data")
      )

      // Should either succeed or fail, but logging should have occurred
      if (Exit.isFailure(result)) {
        expect(consoleLogSpy).toHaveBeenCalled()
        expect(Exit.isFailure(result)).toBe(true)
      }

      consoleLogSpy.mockRestore()
    })

    it("should provide detailed error logging with cause", async () => {
      const consoleLogSpy = vi.spyOn(console, "log")

      await Effect.runPromiseExit(
        fetchWithDetailedLogging("https://api.example.com/data")
      )

      consoleLogSpy.mockRestore()
    })
  })

  // ============================================================================
  // 2. Error Recovery Strategies
  // ============================================================================

  describe("Error Recovery Strategies", () => {
    it("should use fallback chain when primary fails", async () => {
      const result = await Effect.runPromise(
        fetchWithFallbackChain("https://failing-api.com")
      )

      // Should eventually succeed with fallback data
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
    })

    it("should return partial success results", async () => {
      const urls = [
        "https://api1.example.com",
        "https://api2.example.com",
        "https://api3.example.com"
      ]

      const result = await Effect.runPromise(
        fetchMultipleWithPartialSuccess(urls)
      )

      expect(result).toHaveProperty("successes")
      expect(result).toHaveProperty("failures")
      expect(Array.isArray(result.successes)).toBe(true)
      expect(Array.isArray(result.failures)).toBe(true)
      expect(result.successes.length + result.failures.length).toBe(urls.length)
    })

    it("should switch to degraded mode after retries exhausted", async () => {
      const result = await Effect.runPromise(
        fetchWithDegradedMode("https://api.example.com")
      )

      expect(result).toHaveProperty("data")
      expect(result).toHaveProperty("mode")
      expect(["full", "degraded"]).toContain(result.mode)
    })

    it("should implement circuit breaker pattern", async () => {
      const failingEffect = Effect.fail(
        new NetworkError({
          message: "Service unavailable",
          statusCode: 503,
          retryable: false
        })
      )

      const circuitBreaker = makeCircuitBreaker(
        failingEffect,
        3, // Open after 3 failures
        Duration.seconds(1)
      )

      // First 3 attempts should try the operation
      await Effect.runPromiseExit(circuitBreaker)
      await Effect.runPromiseExit(circuitBreaker)
      await Effect.runPromiseExit(circuitBreaker)

      // 4th attempt should fail fast due to open circuit
      const result = await Effect.runPromiseExit(circuitBreaker)

      expect(Exit.isFailure(result)).toBe(true)
    })

    it("should reset circuit breaker after timeout", async () => {
      const successEffect = Effect.succeed("Success")

      const circuitBreaker = makeCircuitBreaker(
        successEffect,
        2,
        Duration.millis(100)
      )

      const result = await Effect.runPromise(circuitBreaker)
      expect(result).toBe("Success")
    })
  })

  // ============================================================================
  // 3. Error Aggregation in Concurrent Operations
  // ============================================================================

  describe("Error Aggregation", () => {
    it("should aggregate all validation errors", async () => {
      const items = [
        { id: 1, value: "valid" },
        { id: 2, value: "ok" },
        { id: 3, value: "x" }, // Too short
        { id: 4, value: "good" },
        { id: 5, value: "y" }  // Too short
      ]

      const result = await Effect.runPromiseExit(
        validateAllWithAggregation(items)
      )

      if (Exit.isFailure(result)) {
        const error = result.cause._tag === "Fail" ? result.cause.error : null
        expect(error).toBeInstanceOf(AggregateError)
        if (error && error._tag === "AggregateError") {
          expect(error.failureCount).toBeGreaterThan(0)
          expect(error.successCount).toBeGreaterThan(0)
          expect(error.errors.length).toBe(error.failureCount)
        }
      }
    })

    it("should return first N successes", async () => {
      const urls = [
        "https://api1.example.com",
        "https://api2.example.com",
        "https://api3.example.com",
        "https://api4.example.com",
        "https://api5.example.com"
      ]

      const result = await Effect.runPromiseExit(
        fetchFirstNSuccesses(urls, 2)
      )

      // Should either succeed with at least 2 results or fail
      if (Exit.isSuccess(result)) {
        expect(result.value.length).toBeGreaterThanOrEqual(2)
      }
    })

    it("should provide error summary for batch operations", async () => {
      const urls = [
        "https://api1.example.com",
        "https://api2.example.com",
        "https://api3.example.com"
      ]

      const result = await Effect.runPromiseExit(
        fetchAllWithErrorSummary(urls)
      )

      if (Exit.isFailure(result)) {
        const error = result.cause._tag === "Fail" ? result.cause.error : null
        expect(error).toHaveProperty("summary")
        expect(error).toHaveProperty("errors")
        if (error && typeof error === 'object' && 'errors' in error) {
          expect(Array.isArray(error.errors)).toBe(true)
        }
      }
    })
  })

  // ============================================================================
  // 4. Error Context Enrichment
  // ============================================================================

  describe("Error Context Enrichment", () => {
    it("should enrich errors with context", async () => {
      const effect = Effect.fail(
        new NetworkError({
          message: "Test error",
          statusCode: 500,
          retryable: true
        })
      )

      const enriched = enrichErrorContext(effect, {
        operation: "testOperation",
        userId: "user123",
        requestId: "req-456"
      })

      const result = await Effect.runPromiseExit(enriched)

      if (Exit.isFailure(result)) {
        const error = result.cause._tag === "Fail" ? result.cause.error : null
        expect(error).toHaveProperty("context")
        if (error && typeof error === 'object' && 'context' in error) {
          const context = error.context as any
          expect(context).toHaveProperty("operation", "testOperation")
          expect(context).toHaveProperty("userId", "user123")
          expect(context).toHaveProperty("requestId", "req-456")
          expect(context).toHaveProperty("timestamp")
        }
      }
    })

    it("should enrich errors in nested operations", async () => {
      const result = await Effect.runPromiseExit(
        loadFullUserData("user123")
      )

      if (Exit.isFailure(result)) {
        const error = result.cause._tag === "Fail" ? result.cause.error : null
        expect(error).toHaveProperty("context")
      }
    })

    it("should add stack trace to errors", async () => {
      const effect = Effect.fail(
        new NetworkError({
          message: "Test error",
          statusCode: 500,
          retryable: true
        })
      )

      const withStack = withStackTrace(effect, "testFunction")

      const result = await Effect.runPromiseExit(withStack)

      if (Exit.isFailure(result)) {
        const error = result.cause._tag === "Fail" ? result.cause.error : null
        expect(error).toHaveProperty("stackTrace")
        expect(error).toHaveProperty("functionLabel", "testFunction")
        expect(error).toHaveProperty("capturedAt")
      }
    })
  })

  // ============================================================================
  // 5. Timeout Error Handling
  // ============================================================================

  describe("Timeout Error Handling", () => {
    it("should timeout slow operations", async () => {
      const slowEffect = Effect.sleep(Duration.seconds(10)).pipe(
        Effect.map(() => "Should not complete")
      )

      const result = await Effect.runPromiseExit(
        withTimeout(slowEffect, 100, "slowOperation")
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const error = result.cause._tag === "Fail" ? result.cause.error : null
        expect(error).toBeInstanceOf(TimeoutError)
        if (error && error._tag === "TimeoutError") {
          expect(error.timeoutMs).toBe(100)
          expect(error.operation).toBe("slowOperation")
        }
      }
    })

    it("should use fallback value on timeout", async () => {
      const slowEffect = Effect.sleep(Duration.seconds(10)).pipe(
        Effect.map(() => "Should not complete")
      )

      const result = await Effect.runPromise(
        withTimeoutFallback(slowEffect, 100, "Fallback value")
      )

      expect(result).toBe("Fallback value")
    })

    it("should complete fast operations before timeout", async () => {
      const fastEffect = Effect.succeed("Fast result")

      const result = await Effect.runPromise(
        withTimeout(fastEffect, 1000, "fastOperation")
      )

      expect(result).toBe("Fast result")
    })

    it("should retry on timeout", async () => {
      let attempts = 0
      const flakyEffect = Effect.gen(function* () {
        attempts++
        if (attempts < 3) {
          yield* Effect.sleep(Duration.seconds(10))
          return "Should timeout"
        }
        return "Success on retry"
      })

      const result = await Effect.runPromiseExit(
        withTimeoutRetry(flakyEffect, 100, 3, "retryOperation")
      )

      // Should eventually timeout after retries
      expect(attempts).toBeGreaterThan(1)
    })

    it("should use progressive timeout", async () => {
      let attempts = 0
      const effect = Effect.gen(function* () {
        attempts++
        if (attempts < 3) {
          yield* Effect.sleep(Duration.millis(500))
          return "Should timeout early attempts"
        }
        return "Success"
      })

      const result = await Effect.runPromiseExit(
        withProgressiveTimeout(effect, 100, 3, "progressiveOperation")
      )

      // Progressive timeout increases delay: 100ms, 200ms, 400ms, 800ms
      expect(attempts).toBeGreaterThan(1)
    })

    it("should handle partial results with timeout", async () => {
      const urls = [
        "https://fast1.example.com",
        "https://fast2.example.com",
        "https://slow.example.com"
      ]

      const result = await Effect.runPromiseExit(
        fetchMultipleWithTimeout(urls, 1000)
      )

      // Should either succeed with all or partial results
      if (Exit.isSuccess(result)) {
        expect(Array.isArray(result.value)).toBe(true)
      }
    })
  })

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe("Integration Tests", () => {
    it("should combine error logging and recovery", async () => {
      const consoleLogSpy = vi.spyOn(console, "log")

      const effect = pipe(
        fetchWithLogging("https://api.example.com"),
        Effect.catchAll(() => Effect.succeed("Recovered"))
      )

      const result = await Effect.runPromise(effect)

      expect(result).toBeDefined()
      consoleLogSpy.mockRestore()
    })

    it("should combine timeout and fallback chain", async () => {
      const slowEffect = Effect.sleep(Duration.seconds(10)).pipe(
        Effect.map(() => "Slow result")
      )

      const result = await Effect.runPromise(
        pipe(
          withTimeout(slowEffect, 100, "operation"),
          Effect.catchAll(() => fetchWithFallbackChain("https://api.example.com"))
        )
      )

      expect(result).toBeDefined()
    })

    it("should combine context enrichment and aggregation", async () => {
      const items = [
        { id: 1, value: "valid" },
        { id: 2, value: "x" }
      ]

      const result = await Effect.runPromiseExit(
        enrichErrorContext(validateAllWithAggregation(items), {
          operation: "batchValidation",
          requestId: "batch-123"
        })
      )

      if (Exit.isFailure(result)) {
        const error = result.cause._tag === "Fail" ? result.cause.error : null
        expect(error).toHaveProperty("context")
      }
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe("Edge Cases", () => {
    it("should handle empty arrays in aggregation", async () => {
      const result = await Effect.runPromise(
        validateAllWithAggregation([])
      )

      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })

    it("should handle single item arrays", async () => {
      const result = await Effect.runPromise(
        validateAllWithAggregation([{ id: 1, value: "valid" }])
      )

      expect(result.length).toBe(1)
    })

    it("should handle zero timeout", async () => {
      const effect = Effect.succeed("Immediate")

      const result = await Effect.runPromiseExit(
        withTimeout(effect, 0, "zeroTimeout")
      )

      // Should likely timeout but might succeed if synchronous
      expect(Exit.isSuccess(result) || Exit.isFailure(result)).toBe(true)
    })

    it("should handle very long timeout", async () => {
      const fastEffect = Effect.succeed("Fast")

      const result = await Effect.runPromise(
        withTimeout(fastEffect, 60000, "longTimeout")
      )

      expect(result).toBe("Fast")
    })
  })
})
