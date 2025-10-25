import { Effect, Context, Layer, pipe } from "effect"

// ============================================================================
// Types and Services
// ============================================================================

/**
 * Represents a trace span with metadata
 */
export interface Span {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId?: string
  readonly name: string
  readonly startTime: number
  readonly endTime?: number
  readonly attributes: Record<string, string | number | boolean>
  readonly status: "ok" | "error"
  readonly error?: string
}

/**
 * Tracer service for creating and managing spans
 */
export class Tracer extends Context.Tag("Tracer")<
  Tracer,
  {
    readonly startSpan: (name: string) => Effect.Effect<Span>
    readonly endSpan: (span: Span, status?: "ok" | "error", error?: string) => Effect.Effect<Span>
    readonly addAttribute: (span: Span, key: string, value: string | number | boolean) => Effect.Effect<Span>
    readonly getActiveSpan: () => Effect.Effect<Span | undefined>
    readonly setActiveSpan: (span: Span | undefined) => Effect.Effect<void>
    readonly getAllSpans: () => Effect.Effect<readonly Span[]>
  }
>() {}

/**
 * Current active span context
 */
export class CurrentSpan extends Context.Tag("CurrentSpan")<
  CurrentSpan,
  Span | undefined
>() {}

// ============================================================================
// In-Memory Tracer Implementation
// ============================================================================

/**
 * Create an in-memory tracer for testing and examples
 */
export const makeInMemoryTracer = () => {
  const spans: Span[] = []
  let currentSpan: Span | undefined = undefined
  let traceCounter = 0
  let spanCounter = 0

  const generateTraceId = () => `trace-${++traceCounter}`
  const generateSpanId = () => `span-${++spanCounter}`

  const tracerService = {
    startSpan: (name: string) =>
      Effect.sync(() => {
        const span: Span = {
          traceId: currentSpan?.traceId ?? generateTraceId(),
          spanId: generateSpanId(),
          parentSpanId: currentSpan?.spanId,
          name,
          startTime: Date.now(),
          attributes: {},
          status: "ok" as const,
        }
        spans.push(span)
        currentSpan = span
        return span
      }),

    endSpan: (span: Span, status: "ok" | "error" = "ok", error?: string) =>
      Effect.sync(() => {
        const index = spans.findIndex((s) => s.spanId === span.spanId)
        if (index !== -1) {
          // Get the current span data from the array (it may have been updated with attributes)
          const currentSpanData = spans[index]
          const updatedSpan: Span = {
            ...currentSpanData,
            endTime: Date.now(),
            status,
            error,
          }
          spans[index] = updatedSpan

          // Reset current span to parent if this was the active span
          if (currentSpan?.spanId === span.spanId) {
            currentSpan = span.parentSpanId
              ? spans.find((s) => s.spanId === span.parentSpanId)
              : undefined
          }

          return updatedSpan
        }
        return span
      }),

    addAttribute: (span: Span, key: string, value: string | number | boolean) =>
      Effect.sync(() => {
        const index = spans.findIndex((s) => s.spanId === span.spanId)
        if (index !== -1) {
          // Use the current span data from the array
          const currentSpanData = spans[index]
          const updatedSpan: Span = {
            ...currentSpanData,
            attributes: { ...currentSpanData.attributes, [key]: value },
          }
          spans[index] = updatedSpan
          // Update current span if this is the active span
          if (currentSpan?.spanId === span.spanId) {
            currentSpan = updatedSpan
          }
          return updatedSpan
        }
        return span
      }),

    getActiveSpan: () => Effect.sync(() => currentSpan),

    setActiveSpan: (span: Span | undefined) =>
      Effect.sync(() => {
        currentSpan = span
      }),

    getAllSpans: () => Effect.sync(() => spans as readonly Span[]),
  }

  return tracerService
}

/**
 * Layer providing the in-memory tracer
 */
export const InMemoryTracerLive = Layer.sync(Tracer, () => makeInMemoryTracer())

// ============================================================================
// High-Level Tracing Utilities
// ============================================================================

/**
 * Wrap an effect with a trace span
 */
export const withSpan = <A, E, R>(
  name: string,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R | Tracer> =>
  Effect.gen(function* () {
    const tracer = yield* Tracer
    const span = yield* tracer.startSpan(name)

    const result = yield* Effect.exit(effect)

    if (result._tag === "Success") {
      yield* tracer.endSpan(span, "ok")
      return result.value
    } else {
      const error = result.cause
      yield* tracer.endSpan(
        span,
        "error",
        String(error)
      )
      return yield* Effect.failCause(error)
    }
  })

/**
 * Add attributes to the current span
 */
export const addSpanAttributes = (
  attributes: Record<string, string | number | boolean>
): Effect.Effect<void, never, Tracer> =>
  Effect.gen(function* () {
    const tracer = yield* Tracer
    const currentSpan = yield* tracer.getActiveSpan()

    if (currentSpan) {
      for (const [key, value] of Object.entries(attributes)) {
        yield* tracer.addAttribute(currentSpan, key, value)
      }
    }
  })

/**
 * Record an event in the current span
 */
export const recordEvent = (
  eventName: string,
  attributes?: Record<string, string | number | boolean>
): Effect.Effect<void, never, Tracer> =>
  addSpanAttributes({
    [`event.${eventName}`]: true,
    ...(attributes ? attributes : {}),
  })

// ============================================================================
// Practical Examples
// ============================================================================

/**
 * Example: Trace a simple operation
 */
export const tracedOperation = (value: number) =>
  pipe(
    withSpan(
      "simple-operation",
      Effect.gen(function* () {
        yield* addSpanAttributes({ input: value })
        const result = value * 2
        yield* addSpanAttributes({ output: result })
        return result
      })
    )
  )

/**
 * Example: Trace nested operations
 */
export const tracedNestedOperations = (userId: string) =>
  pipe(
    withSpan(
      "fetch-user-data",
      Effect.gen(function* () {
        yield* addSpanAttributes({ userId })

        // Nested span for database query
        const user = yield* withSpan(
          "db-query",
          Effect.gen(function* () {
            yield* addSpanAttributes({ table: "users", operation: "SELECT" })
            yield* Effect.sleep("10 millis") // Simulate DB call
            return { id: userId, name: "John Doe", email: "john@example.com" }
          })
        )

        // Nested span for enrichment
        const enriched = yield* withSpan(
          "enrich-user",
          Effect.gen(function* () {
            yield* addSpanAttributes({ enrichmentType: "profile" })
            yield* Effect.sleep("5 millis") // Simulate enrichment
            return { ...user, profile: { age: 30, country: "US" } }
          })
        )

        return enriched
      })
    )
  )

/**
 * Example: Trace with error handling
 */
export const tracedWithError = (shouldFail: boolean) =>
  pipe(
    withSpan(
      "operation-with-error",
      Effect.gen(function* () {
        yield* addSpanAttributes({ shouldFail })

        if (shouldFail) {
          yield* recordEvent("error-occurred", { reason: "intentional-failure" })
          return yield* Effect.fail(new Error("Operation failed"))
        }

        yield* recordEvent("success")
        return "Success"
      })
    ),
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* addSpanAttributes({
          errorHandled: true,
          errorMessage: error.message,
        })
        return `Handled error: ${error.message}`
      })
    )
  )

/**
 * Example: Trace parallel operations
 */
export const tracedParallelOps = () =>
  pipe(
    withSpan(
      "parallel-operations",
      Effect.gen(function* () {
        yield* addSpanAttributes({ operationType: "parallel" })

        const results = yield* Effect.all(
          [
            withSpan(
              "operation-1",
              Effect.gen(function* () {
                yield* Effect.sleep("20 millis")
                yield* addSpanAttributes({ opNumber: 1 })
                return 10
              })
            ),
            withSpan(
              "operation-2",
              Effect.gen(function* () {
                yield* Effect.sleep("15 millis")
                yield* addSpanAttributes({ opNumber: 2 })
                return 20
              })
            ),
            withSpan(
              "operation-3",
              Effect.gen(function* () {
                yield* Effect.sleep("10 millis")
                yield* addSpanAttributes({ opNumber: 3 })
                return 30
              })
            ),
          ],
          { concurrency: "unbounded" }
        )

        yield* addSpanAttributes({ totalResult: results.reduce((a, b) => a + b, 0) })
        return results
      })
    )
  )

/**
 * Example: Trace HTTP request simulation
 */
export const tracedHttpRequest = (method: string, url: string) =>
  pipe(
    withSpan(
      "http-request",
      Effect.gen(function* () {
        yield* addSpanAttributes({
          "http.method": method,
          "http.url": url,
          "http.scheme": "https",
        })

        // Simulate DNS lookup
        yield* withSpan(
          "dns-lookup",
          Effect.gen(function* () {
            yield* Effect.sleep("5 millis")
            yield* addSpanAttributes({ "dns.hostname": new URL(url).hostname })
          })
        )

        // Simulate connection
        yield* withSpan(
          "tcp-connect",
          Effect.gen(function* () {
            yield* Effect.sleep("10 millis")
            yield* addSpanAttributes({ "tcp.established": true })
          })
        )

        // Simulate request/response
        yield* withSpan(
          "request-response",
          Effect.gen(function* () {
            yield* Effect.sleep("30 millis")
            const statusCode = 200
            yield* addSpanAttributes({
              "http.status_code": statusCode,
              "http.response_size": 1024,
            })
            return { status: statusCode, body: "Success" }
          })
        )

        return { method, url, success: true }
      })
    )
  )

/**
 * Example: Distributed trace context
 */
export interface TraceContext {
  readonly traceId: string
  readonly spanId: string
}

export const extractTraceContext = (): Effect.Effect<TraceContext | undefined, never, Tracer> =>
  Effect.gen(function* () {
    const tracer = yield* Tracer
    const span = yield* tracer.getActiveSpan()
    return span ? { traceId: span.traceId, spanId: span.spanId } : undefined
  })

export const injectTraceContext = (
  context: TraceContext
): Effect.Effect<void, never, Tracer> =>
  Effect.gen(function* () {
    const tracer = yield* Tracer
    const span = yield* tracer.startSpan("injected-context")
    yield* tracer.addAttribute(span, "injected.traceId", context.traceId)
    yield* tracer.addAttribute(span, "injected.spanId", context.spanId)
  })

/**
 * Example: Cross-service trace propagation
 */
export const serviceA = (requestId: string) =>
  pipe(
    withSpan(
      "service-a",
      Effect.gen(function* () {
        yield* addSpanAttributes({
          service: "service-a",
          requestId,
        })

        // Extract context to pass to service B
        const context = yield* extractTraceContext()

        // Simulate calling service B
        const resultB = yield* serviceB(requestId, context!)

        yield* addSpanAttributes({ "service-b.result": resultB })

        return `Service A completed with result from B: ${resultB}`
      })
    )
  )

export const serviceB = (requestId: string, context: TraceContext) =>
  pipe(
    withSpan(
      "service-b",
      Effect.gen(function* () {
        // Inject the trace context from service A
        yield* addSpanAttributes({
          service: "service-b",
          requestId,
          "parent.traceId": context.traceId,
          "parent.spanId": context.spanId,
        })

        yield* Effect.sleep("15 millis")

        return "Service B result"
      })
    )
  )

/**
 * Example: Business transaction tracing
 */
export const processOrder = (orderId: string) =>
  pipe(
    withSpan(
      "process-order",
      Effect.gen(function* () {
        yield* addSpanAttributes({
          "order.id": orderId,
          "business.transaction": "order-processing",
        })

        // Validate order
        yield* withSpan(
          "validate-order",
          Effect.gen(function* () {
            yield* Effect.sleep("10 millis")
            yield* addSpanAttributes({ valid: true })
          })
        )

        // Check inventory
        yield* withSpan(
          "check-inventory",
          Effect.gen(function* () {
            yield* Effect.sleep("20 millis")
            yield* addSpanAttributes({ available: true, quantity: 5 })
          })
        )

        // Process payment
        yield* withSpan(
          "process-payment",
          Effect.gen(function* () {
            yield* Effect.sleep("50 millis")
            yield* addSpanAttributes({
              "payment.method": "credit_card",
              "payment.amount": 99.99,
              "payment.status": "success",
            })
          })
        )

        // Ship order
        yield* withSpan(
          "ship-order",
          Effect.gen(function* () {
            yield* Effect.sleep("15 millis")
            yield* addSpanAttributes({
              "shipping.carrier": "UPS",
              "shipping.tracking": "1Z999AA10123456784",
            })
          })
        )

        yield* recordEvent("order-completed", { orderId })

        return { orderId, status: "completed" }
      })
    )
  )

// ============================================================================
// Span Analysis Utilities
// ============================================================================

/**
 * Get span duration in milliseconds
 */
export const getSpanDuration = (span: Span): number | undefined =>
  span.endTime ? span.endTime - span.startTime : undefined

/**
 * Format spans as a tree structure
 */
export const formatSpanTree = (spans: readonly Span[]): string => {
  const spanMap = new Map(spans.map((s) => [s.spanId, s]))
  const rootSpans = spans.filter((s) => !s.parentSpanId)

  const formatSpan = (span: Span, indent: number = 0): string[] => {
    const duration = getSpanDuration(span)
    const prefix = "  ".repeat(indent)
    const status = span.status === "error" ? "❌" : "✓"
    const durationStr = duration !== undefined ? `${duration}ms` : "pending"

    const lines = [
      `${prefix}${status} ${span.name} (${span.spanId}) [${durationStr}]`,
    ]

    if (Object.keys(span.attributes).length > 0) {
      lines.push(`${prefix}  Attributes: ${JSON.stringify(span.attributes)}`)
    }

    if (span.error) {
      lines.push(`${prefix}  Error: ${span.error}`)
    }

    const children = spans.filter((s) => s.parentSpanId === span.spanId)
    for (const child of children) {
      lines.push(...formatSpan(child, indent + 1))
    }

    return lines
  }

  const lines: string[] = []
  for (const root of rootSpans) {
    lines.push(...formatSpan(root))
  }

  return lines.join("\n")
}

/**
 * Get all spans in a trace
 */
export const getTraceSpans = (traceId: string, spans: readonly Span[]): readonly Span[] =>
  spans.filter((s) => s.traceId === traceId)

/**
 * Calculate trace statistics
 */
export interface TraceStats {
  readonly totalSpans: number
  readonly errorSpans: number
  readonly totalDuration: number
  readonly averageDuration: number
  readonly maxDuration: number
  readonly minDuration: number
}

export const calculateTraceStats = (spans: readonly Span[]): TraceStats => {
  const durations = spans
    .map(getSpanDuration)
    .filter((d): d is number => d !== undefined)

  return {
    totalSpans: spans.length,
    errorSpans: spans.filter((s) => s.status === "error").length,
    totalDuration: durations.reduce((a, b) => a + b, 0),
    averageDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
    minDuration: durations.length > 0 ? Math.min(...durations) : 0,
  }
}
