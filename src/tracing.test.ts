import { describe, it, expect } from "vitest"
import { Effect, pipe } from "effect"
import {
  InMemoryTracerLive,
  Tracer,
  tracedOperation,
  tracedNestedOperations,
  tracedWithError,
  tracedParallelOps,
  tracedHttpRequest,
  serviceA,
  processOrder,
  formatSpanTree,
  getSpanDuration,
  calculateTraceStats,
  getTraceSpans,
  withSpan,
  addSpanAttributes,
  recordEvent,
  type Span,
} from "./tracing"

describe("Distributed Tracing", () => {
  // ============================================================================
  // Basic Tracing
  // ============================================================================

  describe("Basic Tracing", () => {
    it("should create and track a simple span", async () => {
      const program = Effect.gen(function* () {
        const tracer = yield* Tracer
        const span = yield* tracer.startSpan("test-span")

        expect(span.name).toBe("test-span")
        expect(span.spanId).toBeDefined()
        expect(span.traceId).toBeDefined()
        expect(span.status).toBe("ok")

        yield* tracer.endSpan(span)

        const spans = yield* tracer.getAllSpans()
        expect(spans.length).toBe(1)
        expect(spans[0].endTime).toBeDefined()
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })

    it("should add attributes to a span", async () => {
      const program = Effect.gen(function* () {
        const tracer = yield* Tracer
        const span = yield* tracer.startSpan("test-span")

        yield* tracer.addAttribute(span, "key1", "value1")
        yield* tracer.addAttribute(span, "key2", 42)
        yield* tracer.addAttribute(span, "key3", true)

        const spans = yield* tracer.getAllSpans()
        expect(spans[0].attributes).toEqual({
          key1: "value1",
          key2: 42,
          key3: true,
        })
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })

    it("should track span status and errors", async () => {
      const program = Effect.gen(function* () {
        const tracer = yield* Tracer
        const span = yield* tracer.startSpan("error-span")

        yield* tracer.endSpan(span, "error", "Something went wrong")

        const spans = yield* tracer.getAllSpans()
        expect(spans[0].status).toBe("error")
        expect(spans[0].error).toBe("Something went wrong")
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })
  })

  // ============================================================================
  // Nested Spans
  // ============================================================================

  describe("Nested Spans", () => {
    it("should create nested span hierarchy", async () => {
      const program = Effect.gen(function* () {
        const tracer = yield* Tracer
        const parent = yield* tracer.startSpan("parent")
        const child = yield* tracer.startSpan("child")

        expect(child.parentSpanId).toBe(parent.spanId)
        expect(child.traceId).toBe(parent.traceId)

        yield* tracer.endSpan(child)
        yield* tracer.endSpan(parent)

        const spans = yield* tracer.getAllSpans()
        expect(spans.length).toBe(2)
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })

    it("should trace nested operations", async () => {
      const result = await Effect.runPromise(
        tracedNestedOperations("user-123").pipe(Effect.provide(InMemoryTracerLive))
      )

      expect(result.id).toBe("user-123")
      expect(result.profile).toBeDefined()
      expect(result.profile.age).toBe(30)
    })

    it("should maintain correct span hierarchy in nested operations", async () => {
      const program = Effect.gen(function* () {
        yield* tracedNestedOperations("user-123")
        const tracer = yield* Tracer
        const spans = yield* tracer.getAllSpans()

        // Should have parent span and two children
        expect(spans.length).toBeGreaterThanOrEqual(3)

        const parentSpan = spans.find((s) => s.name === "fetch-user-data")
        const dbSpan = spans.find((s) => s.name === "db-query")
        const enrichSpan = spans.find((s) => s.name === "enrich-user")

        expect(parentSpan).toBeDefined()
        expect(dbSpan).toBeDefined()
        expect(enrichSpan).toBeDefined()

        expect(dbSpan!.parentSpanId).toBe(parentSpan!.spanId)
        expect(enrichSpan!.parentSpanId).toBe(parentSpan!.spanId)
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })
  })

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe("Error Handling", () => {
    it("should handle errors gracefully in spans", async () => {
      const result = await Effect.runPromise(
        tracedWithError(true).pipe(Effect.provide(InMemoryTracerLive))
      )

      expect(result).toContain("Handled error")
    })

    it("should track success spans", async () => {
      const program = Effect.gen(function* () {
        yield* tracedWithError(false)
        const tracer = yield* Tracer
        const spans = yield* tracer.getAllSpans()

        const operationSpan = spans.find((s) => s.name === "operation-with-error")
        expect(operationSpan).toBeDefined()
        expect(operationSpan!.status).toBe("ok")
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })
  })

  // ============================================================================
  // Parallel Operations
  // ============================================================================

  describe("Parallel Operations", () => {
    it("should trace parallel operations", async () => {
      const result = await Effect.runPromise(
        tracedParallelOps().pipe(Effect.provide(InMemoryTracerLive))
      )

      expect(result).toEqual([10, 20, 30])
    })

    it("should create separate spans for parallel operations", async () => {
      const program = Effect.gen(function* () {
        yield* tracedParallelOps()
        const tracer = yield* Tracer
        const spans = yield* tracer.getAllSpans()

        const op1 = spans.find((s) => s.name === "operation-1")
        const op2 = spans.find((s) => s.name === "operation-2")
        const op3 = spans.find((s) => s.name === "operation-3")

        expect(op1).toBeDefined()
        expect(op2).toBeDefined()
        expect(op3).toBeDefined()

        // All should have the same parent (parallel-operations)
        const parent = spans.find((s) => s.name === "parallel-operations")
        expect(parent).toBeDefined()
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })
  })

  // ============================================================================
  // HTTP Request Tracing
  // ============================================================================

  describe("HTTP Request Tracing", () => {
    it("should trace HTTP requests with detailed spans", async () => {
      const result = await Effect.runPromise(
        tracedHttpRequest("GET", "https://api.example.com/users").pipe(
          Effect.provide(InMemoryTracerLive)
        )
      )

      expect(result.method).toBe("GET")
      expect(result.success).toBe(true)
    })

    it("should capture HTTP metadata in spans", async () => {
      const program = Effect.gen(function* () {
        yield* tracedHttpRequest("POST", "https://api.example.com/orders")
        const tracer = yield* Tracer
        const spans = yield* tracer.getAllSpans()

        const httpSpan = spans.find((s) => s.name === "http-request")
        expect(httpSpan).toBeDefined()
        expect(httpSpan!.attributes["http.method"]).toBe("POST")
        expect(httpSpan!.attributes["http.url"]).toBe("https://api.example.com/orders")

        const dnsSpan = spans.find((s) => s.name === "dns-lookup")
        expect(dnsSpan).toBeDefined()

        const tcpSpan = spans.find((s) => s.name === "tcp-connect")
        expect(tcpSpan).toBeDefined()

        const reqResSpan = spans.find((s) => s.name === "request-response")
        expect(reqResSpan).toBeDefined()
        expect(reqResSpan!.attributes["http.status_code"]).toBe(200)
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })
  })

  // ============================================================================
  // Distributed Tracing
  // ============================================================================

  describe("Distributed Tracing", () => {
    it("should propagate trace context across services", async () => {
      const result = await Effect.runPromise(
        serviceA("req-123").pipe(Effect.provide(InMemoryTracerLive))
      )

      expect(result).toContain("Service A completed")
      expect(result).toContain("Service B result")
    })

    it("should maintain trace context in cross-service calls", async () => {
      const program = Effect.gen(function* () {
        yield* serviceA("req-456")
        const tracer = yield* Tracer
        const spans = yield* tracer.getAllSpans()

        const serviceASpan = spans.find((s) => s.name === "service-a")
        const serviceBSpan = spans.find((s) => s.name === "service-b")

        expect(serviceASpan).toBeDefined()
        expect(serviceBSpan).toBeDefined()

        // Service B should reference Service A's trace context
        expect(serviceBSpan!.attributes["parent.traceId"]).toBe(serviceASpan!.traceId)
        expect(serviceBSpan!.attributes["parent.spanId"]).toBe(serviceASpan!.spanId)
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })
  })

  // ============================================================================
  // Business Transaction Tracing
  // ============================================================================

  describe("Business Transaction Tracing", () => {
    it("should trace complete business transaction", async () => {
      const result = await Effect.runPromise(
        processOrder("order-789").pipe(Effect.provide(InMemoryTracerLive))
      )

      expect(result.orderId).toBe("order-789")
      expect(result.status).toBe("completed")
    })

    it("should capture all transaction steps", async () => {
      const program = Effect.gen(function* () {
        yield* processOrder("order-101")
        const tracer = yield* Tracer
        const spans = yield* tracer.getAllSpans()

        const expectedSteps = [
          "process-order",
          "validate-order",
          "check-inventory",
          "process-payment",
          "ship-order",
        ]

        for (const step of expectedSteps) {
          const span = spans.find((s) => s.name === step)
          expect(span).toBeDefined()
        }

        const paymentSpan = spans.find((s) => s.name === "process-payment")
        expect(paymentSpan!.attributes["payment.status"]).toBe("success")
        expect(paymentSpan!.attributes["payment.amount"]).toBe(99.99)

        const shippingSpan = spans.find((s) => s.name === "ship-order")
        expect(shippingSpan!.attributes["shipping.carrier"]).toBe("UPS")
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })
  })

  // ============================================================================
  // High-Level Utilities
  // ============================================================================

  describe("High-Level Utilities", () => {
    it("should wrap effect with span using withSpan", async () => {
      const program = Effect.gen(function* () {
        const result = yield* withSpan(
          "custom-operation",
          Effect.succeed(42)
        )

        expect(result).toBe(42)

        const tracer = yield* Tracer
        const spans = yield* tracer.getAllSpans()
        const span = spans.find((s) => s.name === "custom-operation")

        expect(span).toBeDefined()
        expect(span!.status).toBe("ok")
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })

    it("should add span attributes using addSpanAttributes", async () => {
      const program = Effect.gen(function* () {
        yield* withSpan(
          "attributed-operation",
          Effect.gen(function* () {
            yield* addSpanAttributes({
              user: "john",
              role: "admin",
              count: 5,
            })
          })
        )

        const tracer = yield* Tracer
        const spans = yield* tracer.getAllSpans()
        const span = spans.find((s) => s.name === "attributed-operation")

        expect(span!.attributes.user).toBe("john")
        expect(span!.attributes.role).toBe("admin")
        expect(span!.attributes.count).toBe(5)
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })

    it("should record events using recordEvent", async () => {
      const program = Effect.gen(function* () {
        yield* withSpan(
          "event-operation",
          Effect.gen(function* () {
            yield* recordEvent("data-processed", { recordCount: 100 })
          })
        )

        const tracer = yield* Tracer
        const spans = yield* tracer.getAllSpans()
        const span = spans.find((s) => s.name === "event-operation")

        expect(span!.attributes["event.data-processed"]).toBe(true)
        expect(span!.attributes.recordCount).toBe(100)
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })
  })

  // ============================================================================
  // Span Analysis
  // ============================================================================

  describe("Span Analysis", () => {
    it("should calculate span duration", async () => {
      const program = Effect.gen(function* () {
        const tracer = yield* Tracer
        const span = yield* tracer.startSpan("timed-span")
        yield* Effect.sleep("10 millis")
        yield* tracer.endSpan(span)

        const spans = yield* tracer.getAllSpans()
        const duration = getSpanDuration(spans[0])

        expect(duration).toBeGreaterThanOrEqual(10)
        expect(duration).toBeLessThan(100) // Should be close to 10ms
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })

    it("should format span tree", async () => {
      const program = Effect.gen(function* () {
        yield* tracedNestedOperations("user-123")
        const tracer = yield* Tracer
        const spans = yield* tracer.getAllSpans()

        const tree = formatSpanTree(spans)

        expect(tree).toContain("fetch-user-data")
        expect(tree).toContain("db-query")
        expect(tree).toContain("enrich-user")
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })

    it("should get spans for a specific trace", async () => {
      const program = Effect.gen(function* () {
        yield* tracedOperation(10)
        const tracer = yield* Tracer
        const allSpans = yield* tracer.getAllSpans()

        const traceId = allSpans[0].traceId
        const traceSpans = getTraceSpans(traceId, allSpans)

        expect(traceSpans.length).toBeGreaterThan(0)
        traceSpans.forEach((span) => {
          expect(span.traceId).toBe(traceId)
        })
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })

    it("should calculate trace statistics", async () => {
      const program = Effect.gen(function* () {
        yield* tracedParallelOps()
        const tracer = yield* Tracer
        const spans = yield* tracer.getAllSpans()

        const stats = calculateTraceStats(spans)

        expect(stats.totalSpans).toBeGreaterThan(0)
        expect(stats.errorSpans).toBe(0)
        expect(stats.totalDuration).toBeGreaterThan(0)
        expect(stats.averageDuration).toBeGreaterThan(0)
        expect(stats.maxDuration).toBeGreaterThanOrEqual(stats.minDuration)
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })
  })

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe("Integration Tests", () => {
    it("should handle complex nested and parallel operations", async () => {
      const program = Effect.gen(function* () {
        yield* withSpan(
          "complex-workflow",
          Effect.gen(function* () {
            // Sequential nested operations
            yield* tracedNestedOperations("user-1")

            // Parallel operations
            yield* Effect.all(
              [
                tracedOperation(1),
                tracedOperation(2),
                tracedOperation(3),
              ],
              { concurrency: "unbounded" }
            )

            // More nesting
            yield* processOrder("order-1")
          })
        )

        const tracer = yield* Tracer
        const spans = yield* tracer.getAllSpans()

        // Should have many spans from all operations
        expect(spans.length).toBeGreaterThan(10)

        // All spans should be completed
        spans.forEach((span) => {
          expect(span.endTime).toBeDefined()
        })
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })

    it("should maintain trace context across complex workflows", async () => {
      const program = Effect.gen(function* () {
        yield* withSpan(
          "root-span",
          Effect.gen(function* () {
            yield* serviceA("req-1")
            yield* tracedHttpRequest("GET", "https://api.example.com/data")
          })
        )

        const tracer = yield* Tracer
        const spans = yield* tracer.getAllSpans()

        // All spans should share the same trace ID
        const traceIds = [...new Set(spans.map((s) => s.traceId))]
        expect(traceIds.length).toBe(1)
      })

      await Effect.runPromise(program.pipe(Effect.provide(InMemoryTracerLive)))
    })
  })
})
