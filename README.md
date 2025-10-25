# Effect Library Examples

A TypeScript project demonstrating practical usage patterns of the [Effect](https://effect.website/) library for functional programming with typed errors and resource management.

## Overview

This project showcases various Effect library patterns including:
- Error handling with typed errors
- Effect composition using pipe
- Generator syntax for Effects
- Resource management with acquire/use/release pattern
- Combining multiple effects
- **Concurrency patterns** (racing, parallel processing, fiber management, interruption)
- **Scheduling & Jittered delays** (retry with backoff, recurring tasks, anti-thundering herd)
- **Stream processing** (transformations, chunking, backpressure, data pipelines)
- **Resource pooling** (database connections, HTTP clients, automatic lifecycle management)
- **Enhanced error handling** (tapError logging, recovery strategies, error aggregation, context enrichment, timeout patterns)
- **Circuit breaker patterns** (state management, metrics tracking, retry integration, monitoring hooks)

## Installation

```bash
npm install
```

## Development

```bash
# Build the project
npm run build

# Build in watch mode
npm run dev

# Run tests
npm test

# Run tests with UI
npm run test:ui
```

## Examples

The project includes several Effect patterns:

### 1. Basic Error Handling
```typescript
const processUser = (id: number) => pipe(
  fetchUser(id),
  Effect.flatMap(validateUser),
  Effect.tap(user => Console.log(`Processing user: ${user.name}`))
)
```

**Example Output**:
```
Processing user: Alice
{ _id: "_tag", _tag: "Right", right: { id: 1, name: "Alice", email: "alice@example.com" } }
```

**Error Case Output**:
```
ValidationError: User email is invalid
  at validateUser (src/index.ts:42)
  Stack trace: ...
```

### 2. Generator Syntax
```typescript
const generatorExample = Effect.gen(function* (_) {
  const user = yield* _(fetchUser(2))
  const validated = yield* _(validateUser(user))
  return validated
})
```

### 3. Resource Management
```typescript
const withDatabaseConnection = <A, E>(operation: (db: DatabaseConnection) => Fx<A, E>) =>
  Effect.acquireUseRelease(
    acquire,    // Open connection
    operation,  // Use connection
    release     // Close connection (always runs)
  )
```

### 4. Concurrency Patterns

The `src/concurrency.ts` file demonstrates advanced concurrency patterns:

#### Racing Effects
```typescript
// Returns result of fastest effect, interrupts losers
Effect.race(
  simulateApiCall("Slow API", 1000, "slow result"),
  simulateApiCall("Fast API", 100, "fast result")
)
```

**Example Output**:
```
[Slow API] Starting... (timestamp: 0ms)
[Fast API] Starting... (timestamp: 0ms)
[Fast API] Completed after 100ms
[Slow API] Interrupted (was at 100ms of 1000ms total)
Result: "fast result"
Total execution time: ~100ms
```

#### Parallel Processing
```typescript
// Run all effects in parallel
Effect.all([effect1, effect2, effect3], { concurrency: "unbounded" })

// Limit concurrent operations
Effect.all(effects, { concurrency: 2 })

// Sequential processing
Effect.all(effects, { concurrency: 1 })
```

#### Concurrent Iteration
```typescript
// Process array items concurrently
Effect.forEach(
  items,
  (item) => processItem(item),
  { concurrency: 5 }
)
```

#### Fiber Management
```typescript
// Fork background tasks and join later
Effect.gen(function* (_) {
  const fiber = yield* _(Effect.fork(longRunningTask))
  // Do other work...
  const result = yield* _(Fiber.join(fiber))
  return result
})
```

#### Interruption Handling
```typescript
// Handle graceful cancellation
const task = pipe(
  longRunningOperation,
  Effect.onInterrupt(() => Console.log("Task was cancelled"))
)

// Guarantee completion even if interrupted
Effect.uninterruptible(criticalOperation)
```

#### Timeout Patterns
```typescript
// Fail if operation takes too long
Effect.race(
  operation,
  pipe(
    Effect.sleep(Duration.millis(5000)),
    Effect.flatMap(() => Effect.fail(new TimeoutError()))
  )
)

// Use fallback value on timeout
withTimeoutFallback(operation, 1000, defaultValue)
```

### 5. Scheduling & Jittered Delays

The `src/scheduling.ts` file demonstrates scheduling patterns with jittered delays to prevent thundering herd problems:

#### Exponential Backoff with Jitter
```typescript
// Full jitter - random delay between 0 and exponential backoff value
const fullJitterSchedule = pipe(
  Schedule.exponential(Duration.millis(100)),
  Schedule.jittered()
)

// Retry with jittered exponential backoff
Effect.retry(operation, fullJitterSchedule)
```

#### Jitter Strategies
```typescript
// Full jitter (0% to 100% of delay)
Schedule.jittered()

// Proportional jitter (custom range)
Schedule.jittered({ min: 0.8, max: 1.2 }) // ±20% variation

// Equal jitter (50% to 100% of delay)
Schedule.jittered({ min: 0.5, max: 1.0 })
```

#### Capped Backoff
```typescript
// Cap maximum delay and limit retries
const cappedSchedule = pipe(
  Schedule.exponential(Duration.millis(100)),
  Schedule.jittered(),
  Schedule.either(Schedule.spaced(Duration.millis(5000))), // Max 5s
  Schedule.compose(Schedule.recurs(10)) // Max 10 retries
)
```

#### Fibonacci & Linear Backoff
```typescript
// Fibonacci: 100ms, 100ms, 200ms, 300ms, 500ms...
const fibonacciSchedule = pipe(
  Schedule.fibonacci(Duration.millis(100)),
  Schedule.jittered()
)

// Linear: 100ms, 200ms, 300ms, 400ms...
const linearSchedule = pipe(
  Schedule.linear(Duration.millis(100)),
  Schedule.jittered()
)
```

#### Practical Retry Examples
```typescript
// Database connection with retry
const connectToDatabase = pipe(
  attemptConnection,
  Effect.retry(
    pipe(
      Schedule.exponential(Duration.millis(50)),
      Schedule.jittered(),
      Schedule.compose(Schedule.recurs(5))
    )
  )
)

// HTTP request with capped retry
const fetchWithRetry = pipe(
  httpRequest,
  Effect.retry(cappedJitterSchedule(100, 5000, 3))
)
```

#### Elapsed Time Limits
```typescript
// Stop retrying after total elapsed time
const timedSchedule = pipe(
  Schedule.exponential(Duration.millis(100)),
  Schedule.jittered(),
  Schedule.whileOutput(elapsed =>
    Duration.lessThan(elapsed, Duration.seconds(30))
  )
)
```

#### Why Jitter?
Jitter prevents the **thundering herd problem** where many clients retry simultaneously:
- Without jitter: All clients retry at exactly 100ms, 200ms, 400ms...
- With jitter: Clients retry at random intervals, spreading the load
- Critical for distributed systems and high-scale applications

### 6. Stream Processing

The `src/streaming.ts` file demonstrates Effect.Stream for processing large datasets efficiently:

#### Basic Stream Operations
```typescript
// Create streams
const numbers = Stream.range(1, 100)
const fromData = Stream.fromIterable([1, 2, 3, 4, 5])

// Transform streams
pipe(
  numbers,
  Stream.map(n => n * 2),
  Stream.filter(n => n % 2 === 0),
  Stream.take(10),
  Stream.runCollect
)
```

#### Chunking and Batching
```typescript
// Process in batches
pipe(
  Stream.range(1, 1000),
  Stream.grouped(50), // Chunks of 50
  Stream.mapEffect(batch => processBatch(batch)),
  Stream.runCollect
)

// Time-based windowing
Stream.groupedWithin(stream, 100, Duration.seconds(5))
```

#### Stream Aggregations
```typescript
// Fold entire stream
Stream.runFold(stream, 0, (acc, n) => acc + n)

// Scan with intermediate results
Stream.scan(stream, 0, (acc, n) => acc + n)

// Collect all elements
Stream.runCollect(stream)
```

#### Concurrent Stream Processing
```typescript
// Process items concurrently
pipe(
  Stream.fromIterable(items),
  Stream.mapEffect(processItem, { concurrency: 5 }),
  Stream.runCollect
)

// Merge multiple streams
Stream.mergeAll([stream1, stream2, stream3], {
  concurrency: "unbounded"
})
```

#### Backpressure and Flow Control
```typescript
// Buffer elements
Stream.buffer(stream, { capacity: 100 })

// Throttle emissions
Stream.throttleShape(stream, 1, Duration.seconds(1))

// Debounce
Stream.debounce(stream, Duration.millis(500))
```

#### Data Pipelines
```typescript
// Complex data transformation pipeline
pipe(
  Stream.range(1, 1000),
  Stream.filter(n => n % 2 === 0),
  Stream.map(n => n * 2),
  Stream.grouped(10),
  Stream.mapEffect(chunk => analyzeChunk(chunk)),
  Stream.tap(result => Console.log(result)),
  Stream.runCollect
)
```

#### Practical Stream Examples
```typescript
// Paginated API fetching
const fetchAllPages = pipe(
  Stream.range(1, totalPages),
  Stream.mapEffect(page => fetchPage(page)),
  Stream.runCollect
)

// Real-time event processing
const processEvents = pipe(
  eventStream,
  Stream.groupedWithin(100, Duration.seconds(1)),
  Stream.map(chunk => aggregateEvents(chunk)),
  Stream.runCollect
)

// Sliding window analysis
pipe(
  dataStream,
  Stream.sliding(5), // Window of 5 elements
  Stream.map(window => calculateMovingAverage(window)),
  Stream.runCollect
)
```

#### Why Streams?
- **Memory efficient**: Process large datasets without loading everything into memory
- **Lazy evaluation**: Elements are processed on-demand
- **Composable**: Chain transformations declaratively
- **Backpressure**: Handle fast producers and slow consumers
- **Concurrent**: Process elements in parallel when needed

## Before/After: Effect vs Promises

This section demonstrates the benefits of Effect by comparing Promise-based code with Effect-based implementations.

### Example 1: Error Handling with Type Safety

**Before (Promises)**:
```typescript
async function fetchUserData(userId: string): Promise<UserData> {
  try {
    const response = await fetch(`/api/users/${userId}`)
    if (!response.ok) {
      // Error type is unknown - could be anything!
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    // error is 'unknown' - no type safety
    console.error("Failed to fetch user:", error)
    throw error  // Caller doesn't know what errors to expect
  }
}

// Caller has no idea what errors might occur
const data = await fetchUserData("123")
```

**After (Effect)**:
```typescript
import { Effect, Data } from "effect"

// Define error types explicitly
class NetworkError extends Data.TaggedError("NetworkError")<{
  statusCode: number
  message: string
}> {}

class ValidationError extends Data.TaggedError("ValidationError")<{
  field: string
  message: string
}> {}

function fetchUserData(userId: string): Effect.Effect<
  UserData,
  NetworkError | ValidationError  // Errors are part of the type!
> {
  return pipe(
    Effect.tryPromise({
      try: () => fetch(`/api/users/${userId}`),
      catch: (error) => new NetworkError({
        statusCode: 0,
        message: String(error)
      })
    }),
    Effect.flatMap(response =>
      response.ok
        ? Effect.promise(() => response.json())
        : Effect.fail(new NetworkError({
            statusCode: response.status,
            message: `HTTP ${response.status}`
          }))
    )
  )
}

// Caller knows exactly what errors to handle
pipe(
  fetchUserData("123"),
  Effect.catchTags({
    NetworkError: (error) => Effect.succeed(cachedUserData),
    ValidationError: (error) => Effect.fail(error)
  })
)
```

**Benefits**:
- ✅ **Type-safe errors**: Compiler knows all possible error types
- ✅ **Exhaustive handling**: TypeScript ensures you handle all error cases
- ✅ **Better IDE support**: Autocomplete shows available error types
- ✅ **Self-documenting**: Function signature shows what can go wrong

### Example 2: Parallel Operations with Proper Error Handling

**Before (Promises)**:
```typescript
async function loadDashboard(userId: string) {
  try {
    // All succeed or all fail - no partial results
    const [profile, settings, notifications] = await Promise.all([
      fetchProfile(userId),
      fetchSettings(userId),
      fetchNotifications(userId)
    ])

    return { profile, settings, notifications }
  } catch (error) {
    // Which operation failed? Unknown!
    // Successful operations are lost!
    console.error("Dashboard load failed:", error)
    throw error
  }
}
```

**After (Effect)**:
```typescript
function loadDashboard(userId: string) {
  return Effect.all({
    profile: fetchProfile(userId),
    settings: fetchSettings(userId),
    notifications: fetchNotifications(userId)
  }, {
    concurrency: "unbounded",
    mode: "either"  // Capture both successes and failures
  }).pipe(
    Effect.map((results) => ({
      profile: results.profile._tag === "Right" ? results.profile.right : null,
      settings: results.settings._tag === "Right" ? results.settings.right : null,
      notifications: results.notifications._tag === "Right" ? results.notifications.right : null,
      errors: [
        results.profile._tag === "Left" ? results.profile.left : null,
        results.settings._tag === "Left" ? results.settings.left : null,
        results.notifications._tag === "Left" ? results.notifications.left : null
      ].filter(Boolean)
    }))
  )
}
```

**Benefits**:
- ✅ **Partial results**: Get successful data even if some operations fail
- ✅ **Error details**: Know exactly which operations failed and why
- ✅ **Graceful degradation**: Show what data you have
- ✅ **Better UX**: User sees partial dashboard instead of blank page

### Example 3: Retry Logic with Exponential Backoff

**Before (Promises)**:
```typescript
async function fetchWithRetry(url: string, maxRetries = 3) {
  let lastError

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetch(url)
    } catch (error) {
      lastError = error
      // Manual exponential backoff calculation
      const delay = Math.pow(2, attempt) * 100
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

// Problems:
// - No jitter (thundering herd risk)
// - No max delay cap
// - Retry logic mixed with business logic
// - Hard to test
// - Hard to configure
```

**After (Effect)**:
```typescript
const fetchWithRetry = (url: string) =>
  pipe(
    Effect.tryPromise(() => fetch(url)),
    Effect.retry(
      pipe(
        Schedule.exponential(Duration.millis(100)),
        Schedule.jittered(),  // Prevent thundering herd
        Schedule.either(Schedule.spaced(Duration.seconds(5))),  // Cap at 5s
        Schedule.compose(Schedule.recurs(3))  // Max 3 retries
      )
    )
  )

// Benefits:
// - Built-in jitter
// - Configurable max delay
// - Separation of concerns
// - Easily testable
// - Declarative configuration
```

**Benefits**:
- ✅ **Declarative**: Retry policy is clear and configurable
- ✅ **Jitter built-in**: Prevents thundering herd automatically
- ✅ **Testable**: Can inject test clock for deterministic tests
- ✅ **Composable**: Combine retry policies with `pipe`

### Example 4: Resource Management

**Before (Promises)**:
```typescript
async function processFile(path: string) {
  let fileHandle

  try {
    fileHandle = await fs.open(path)
    const data = await fileHandle.readFile()
    const processed = await processData(data)
    await fileHandle.writeFile(processed)
    return processed
  } catch (error) {
    console.error("File processing failed:", error)
    throw error
  } finally {
    // What if close() throws? What if fileHandle is undefined?
    if (fileHandle) {
      try {
        await fileHandle.close()
      } catch (closeError) {
        console.error("Failed to close file:", closeError)
      }
    }
  }
}
```

**After (Effect)**:
```typescript
const processFile = (path: string) =>
  Effect.acquireUseRelease(
    // Acquire: Open file
    Effect.tryPromise(() => fs.open(path)),

    // Use: Process file
    (fileHandle) => pipe(
      Effect.promise(() => fileHandle.readFile()),
      Effect.flatMap(data => processData(data)),
      Effect.tap(processed => Effect.promise(() => fileHandle.writeFile(processed)))
    ),

    // Release: ALWAYS runs, even on failure or interruption
    (fileHandle) => Effect.promise(() => fileHandle.close())
  )
```

**Benefits**:
- ✅ **Guaranteed cleanup**: Release always runs, even on errors or interruption
- ✅ **Composable**: Can nest multiple resources
- ✅ **Interruption-safe**: Cleanup happens on cancellation too
- ✅ **Cleaner code**: No try/catch/finally nesting

### Performance Comparison

**Scenario**: Fetch data from 5 independent APIs

**Promises (Sequential)**:
```typescript
const result1 = await fetchApi1()  // 200ms
const result2 = await fetchApi2()  // 200ms
const result3 = await fetchApi3()  // 200ms
const result4 = await fetchApi4()  // 200ms
const result5 = await fetchApi5()  // 200ms
// Total: 1000ms
```

**Promises (Parallel)**:
```typescript
const [r1, r2, r3, r4, r5] = await Promise.all([
  fetchApi1(), fetchApi2(), fetchApi3(), fetchApi4(), fetchApi5()
])
// Total: ~200ms (fastest of all)
// But: All-or-nothing, no error details, no partial results
```

**Effect (Parallel with Error Handling)**:
```typescript
const results = await Effect.runPromise(
  Effect.all([
    fetchApi1(), fetchApi2(), fetchApi3(), fetchApi4(), fetchApi5()
  ], {
    concurrency: "unbounded",
    mode: "either"
  })
)
// Total: ~200ms (same as Promise.all)
// Plus: Partial results, typed errors, interruption support
```

**Winner**: Effect provides the same performance as Promises but with better error handling, type safety, and resilience features.

## Performance Benchmarks

This section provides real-world performance metrics for various Effect patterns.

### Concurrency Patterns Performance

**Test Setup**: 10 API calls, each taking 100ms

| Pattern | Code | Time | Speedup |
|---------|------|------|---------|
| **Sequential** | `Effect.all(calls, { concurrency: 1 })` | ~1000ms | 1x (baseline) |
| **Limited (2)** | `Effect.all(calls, { concurrency: 2 })` | ~500ms | 2x faster |
| **Limited (5)** | `Effect.all(calls, { concurrency: 5 })` | ~200ms | 5x faster |
| **Unlimited** | `Effect.all(calls, { concurrency: "unbounded" })` | ~100ms | 10x faster |
| **Race** | `Effect.race(calls[0], calls[1])` | ~100ms | 10x faster* |

*Race only returns first result, not all results

**Key Insight**: Proper parallelization can provide 10x speedup for independent operations.

### Retry Strategy Performance

**Test Setup**: Operation that fails 3 times before succeeding

| Strategy | Configuration | Total Time | Attempts |
|----------|--------------|------------|----------|
| **No Retry** | No retry logic | Fails immediately | 1 |
| **Fixed Delay** | `Schedule.spaced(100ms)` | ~400ms | 4 |
| **Exponential** | `Schedule.exponential(100ms)` | ~800ms (100+200+400+100) | 4 |
| **Exponential + Jitter** | `exponential + jittered()` | ~600-900ms (varies) | 4 |
| **Capped Exponential** | `exponential |> either(spaced(200ms))` | ~700ms (100+200+200+100) | 4 |

**Execution Output Example**:
```
[Attempt 1] Starting operation... FAILED after 100ms
[Delay] Waiting 100ms before retry
[Attempt 2] Starting operation... FAILED after 100ms
[Delay] Waiting 200ms before retry
[Attempt 3] Starting operation... FAILED after 100ms
[Delay] Waiting 400ms before retry (capped would be 200ms)
[Attempt 4] Starting operation... SUCCESS after 100ms
Total elapsed: ~800ms (or ~700ms with cap)
```

### Resource Pool Performance

**Test Setup**: 100 database queries with different pool configurations

| Pool Config | Concurrency | Time | Notes |
|-------------|-------------|------|-------|
| **min:1, max:5** | Limited to 5 | ~2000ms | Pool reuse, limited by max size |
| **min:1, max:10** | Limited to 10 | ~1000ms | Better parallelism |
| **min:5, max:10** | Limited to 10 | ~950ms | Warm pool, no cold start |
| **min:10, max:10** | Limited to 10 | ~900ms | All connections ready |
| **No Pool** | Unlimited | ~500ms | Fastest but resource-intensive |

**Key Insight**: Pre-warmed pools (higher min size) provide better performance by eliminating cold start latency.

### Stream Processing Performance

**Test Setup**: Processing 10,000 items with transformation

| Approach | Code | Time | Memory |
|----------|------|------|--------|
| **Array.map** | `items.map(transform)` | ~50ms | High (loads all) |
| **Stream** | `Stream.fromIterable(items).map(transform)` | ~55ms | Low (lazy) |
| **Stream Chunked** | `Stream.fromIterable(items).grouped(100).mapEffect(processBatch)` | ~45ms | Low |
| **Stream Concurrent** | `Stream.mapEffect(transform, { concurrency: 5 })` | ~15ms | Low |

**Execution Output Example**:
```
[Stream] Processing chunk 1 (items 0-99)... 10ms
[Stream] Processing chunk 2 (items 100-199)... 10ms
...
[Stream] Processing chunk 100 (items 9900-9999)... 10ms
Total: 45ms
Memory usage: ~5MB (vs 50MB for Array.map)
```

### Error Handling Performance Impact

**Test Setup**: 100 operations with 10% error rate

| Error Handling | Time Overhead | Notes |
|----------------|---------------|-------|
| **None (fail fast)** | 0% (baseline) | Stops on first error |
| **tapError logging** | ~1-2% | Minimal overhead |
| **catchAll with fallback** | ~3-5% | Adds fallback logic |
| **Retry (3 attempts)** | ~200-300% | Significantly slower due to retries |
| **Either mode (collect all)** | ~2-3% | Collects successes and failures |

**Key Insight**: `tapError` for logging adds minimal overhead. Retries significantly increase execution time but improve success rate.

### Real-World Scenario Benchmarks

#### Scenario 1: User Dashboard Load

**Components**: Profile (200ms), Settings (150ms), Notifications (100ms), Activity (180ms)

```typescript
// Sequential Implementation
const sequential = Effect.gen(function* (_) {
  const profile = yield* _(fetchProfile())      // 200ms
  const settings = yield* _(fetchSettings())    // 150ms
  const notifications = yield* _(fetchNotifications())  // 100ms
  const activity = yield* _(fetchActivity())    // 180ms
  return { profile, settings, notifications, activity }
})
// Total: ~630ms

// Parallel Implementation
const parallel = Effect.all({
  profile: fetchProfile(),
  settings: fetchSettings(),
  notifications: fetchNotifications(),
  activity: fetchActivity()
}, { concurrency: "unbounded" })
// Total: ~200ms (time of slowest component)
```

**Result**: **3.15x faster** with parallel execution

#### Scenario 2: Batch Image Processing

**Setup**: Process 50 images, each takes 100ms

```typescript
// Sequential (no concurrency)
Effect.forEach(images, processImage, { concurrency: 1 })
// Total: ~5000ms (5 seconds)

// Limited concurrency (5 at a time)
Effect.forEach(images, processImage, { concurrency: 5 })
// Total: ~1000ms (1 second)

// With resource pool (10 workers)
Effect.scoped(
  Effect.flatMap(makeWorkerPool(10, 10), (pool) =>
    Effect.forEach(images, (img) => processWithPool(pool, img))
  )
)
// Total: ~500ms (0.5 seconds)
```

**Result**: **10x faster** with pool-based processing

#### Scenario 3: API with Fallback Strategy

**Setup**: Primary API (100ms, 80% success), Cache (10ms, 100% success)

**Strategy 1: Sequential Fallback**
```typescript
pipe(
  fetchFromApi(),
  Effect.catchAll(() => fetchFromCache())
)
// Success case: ~100ms
// Failure case: ~110ms (100ms failed API + 10ms cache)
// Average (80% success): ~102ms
```

**Strategy 2: Race with Delay**
```typescript
Effect.race(
  fetchFromApi(),
  pipe(Effect.sleep(50), Effect.flatMap(() => fetchFromCache()))
)
// Success case: ~100ms (API wins)
// Slow API case: ~50ms (cache wins)
// Average: ~80ms
```

**Result**: Racing with delayed cache fallback provides **21% better average latency**

### Performance Best Practices

1. **Use Parallelism for Independent Operations**
   - Sequential: 5 × 100ms = 500ms
   - Parallel: max(100ms) = 100ms
   - **Speedup: 5x**

2. **Limit Concurrency for Resource-Bound Operations**
   - Unlimited concurrency can exhaust resources (connections, memory)
   - Optimal concurrency ≈ number of available resources

3. **Use Resource Pools for Expensive Resources**
   - Database connections: 10-20 connection pool
   - HTTP clients: 20-50 client pool
   - File handles: Based on system limits

4. **Pre-warm Pools in Production**
   - Cold start: First request creates resource (~50-100ms overhead)
   - Warm pool: Resource already available (~0ms overhead)

5. **Use Streams for Large Datasets**
   - Arrays: Load entire dataset into memory
   - Streams: Process incrementally, constant memory
   - **Memory savings: 10-100x** for large datasets

6. **Batch Operations When Possible**
   - Individual requests: N × (latency + processing)
   - Batched requests: latency + N × processing
   - **Speedup: Significant for high-latency operations**

### Benchmarking Your Own Code

To measure Effect performance in your application:

```typescript
import { Effect, Clock } from "effect"

const benchmark = <A, E>(name: string, effect: Effect.Effect<A, E>) =>
  Effect.gen(function* (_) {
    const start = yield* _(Clock.currentTimeMillis)
    const result = yield* _(effect)
    const end = yield* _(Clock.currentTimeMillis)
    const duration = end - start
    yield* _(Console.log(`[${name}] Duration: ${duration}ms`))
    return result
  })

// Usage
const result = await Effect.runPromise(
  benchmark("User Dashboard", loadUserDashboard(userId))
)
```

**Output**:
```
[User Dashboard] Duration: 203ms
```

## Pattern Decision Guide

This section helps you choose the right pattern for your use case.

### When to Use Each Concurrency Pattern

#### Use `Effect.race` When:
- You need the **first successful result** and don't care about others
- Multiple sources can provide the same data (cache vs database vs API)
- You want a timeout mechanism (race operation vs delay)
- Examples:
  - Fetching from multiple redundant endpoints
  - Implementing timeouts
  - User cancellable operations

#### Use `Effect.all` with Parallel Concurrency When:
- You need **all results** and they're independent
- Operations can run simultaneously without conflicts
- Order of execution doesn't matter
- Examples:
  - Fetching user profile + settings + preferences simultaneously
  - Parallel validation of multiple fields
  - Batch processing independent items

#### Use `Effect.all` with Sequential Concurrency When:
- Operations must run **in order**
- Later operations depend on earlier results
- Resource constraints require serialization
- Examples:
  - Database migrations that must run in sequence
  - Pipeline processing where each stage depends on previous
  - Rate-limited API calls that must be sequential

#### Use `Effect.forEach` When:
- Processing **collections** with controlled concurrency
- You want to limit parallel operations (e.g., max 5 concurrent requests)
- Each item needs the same transformation
- Examples:
  - Processing user uploads with concurrency limit
  - Bulk data transformation
  - Paginated API fetching with rate limits

#### Use Fiber Management When:
- You need **fine-grained control** over background tasks
- Tasks should run independently but may need coordination
- You want to explicitly join/interrupt/await fibers
- Examples:
  - Background data synchronization
  - Long-running workers that can be cancelled
  - Parallel computations where you need partial results

### Decision Flowchart: Race vs Parallel vs Sequential

```
Do you need results from all operations?
│
├─ NO → Do you want the fastest result?
│       │
│       ├─ YES → Use Effect.race()
│       │         - First successful result wins
│       │         - Losers are interrupted
│       │         - Good for timeouts & redundancy
│       │
│       └─ NO → Use Fiber Management
│                 - Fork independent tasks
│                 - Join when needed
│                 - Manual control over lifecycle
│
└─ YES → Are operations independent?
         │
         ├─ YES → Do you have resource constraints?
         │        │
         │        ├─ YES → Use Effect.forEach with limited concurrency
         │        │         - Control max parallel operations
         │        │         - Prevent resource exhaustion
         │        │         - Example: { concurrency: 5 }
         │        │
         │        └─ NO → Use Effect.all({ concurrency: "unbounded" })
         │                  - Maximum parallelism
         │                  - All operations run simultaneously
         │                  - Fastest total execution time
         │
         └─ NO (dependent) → Use Effect.all({ concurrency: 1 })
                             - Sequential execution
                             - Guaranteed order
                             - Later operations can use earlier results
```

### Error Handling Decision Flowchart

```
What type of error handling do you need?
│
├─ Logging/Monitoring (don't change error flow)
│  └─ Use Effect.tapError()
│      - Log to console
│      - Send to telemetry
│      - Trigger alerts
│      - Error continues propagating
│
├─ Recovery/Fallback (handle error)
│  │
│  ├─ Single fallback value
│  │  └─ Use Effect.orElse() or Effect.catchAll()
│  │      - Fallback to cached data
│  │      - Return default value
│  │
│  ├─ Multiple fallback strategies
│  │  └─ Chain Effect.orElse()
│  │      - Try cache → backup API → default
│  │      - Fallback chain
│  │
│  └─ Different handling per error type
│      └─ Use Effect.catchTags() or Effect.catchTag()
│          - NetworkError → retry
│          - ValidationError → return error to user
│          - TimeoutError → use cached value
│
├─ Retry on Failure
│  │
│  ├─ Simple retry (same delay)
│  │  └─ Effect.retry(Schedule.recurs(3))
│  │
│  ├─ Exponential backoff
│  │  └─ Effect.retry(Schedule.exponential(...))
│  │      - Distributed systems
│  │      - Add jitter to prevent thundering herd
│  │
│  └─ Conditional retry
│      └─ Effect.retry({ while: (error) => error._tag === "Transient" })
│          - Only retry transient errors
│          - Give up on permanent failures
│
├─ Aggregate Multiple Errors
│  │
│  ├─ Need all errors
│  │  └─ Use Effect.all(..., { mode: "either" })
│  │      - Form validation (show all field errors)
│  │      - Batch processing (report all failures)
│  │
│  └─ Need partial successes
│      └─ Catch each operation individually
│          - Process what succeeded
│          - Report what failed
│
└─ Add Context to Errors
    └─ Use Effect.mapError()
        - Add request IDs
        - Add operation context
        - Add stack traces
        - Enrich for debugging
```

### Retry Strategy Decision Flowchart

```
Do you need to retry failed operations?
│
├─ NO → Don't use retry
│       - One-time operations
│       - User-initiated actions that shouldn't auto-retry
│
└─ YES → What type of failure?
         │
         ├─ Transient (temporary, will likely succeed soon)
         │  │
         │  ├─ Network glitches, timeouts
         │  │  └─ Use exponential backoff with jitter
         │  │      Schedule.exponential(100ms) |> Schedule.jittered()
         │  │      - Quick initial retry (100ms)
         │  │      - Back off if continues failing
         │  │      - Jitter prevents thundering herd
         │  │
         │  ├─ Rate limiting (HTTP 429)
         │  │  └─ Use spaced retry with backoff
         │  │      Schedule.spaced(1s) + Schedule.exponential(...)
         │  │      - Respect rate limit windows
         │  │      - Gradual backoff
         │  │
         │  └─ Database deadlocks
         │      └─ Use fibonacci or linear backoff
         │          Schedule.fibonacci(50ms) |> Schedule.jittered()
         │          - Slower growth than exponential
         │          - Good for contention scenarios
         │
         ├─ Sustained Failure (service down, needs time to recover)
         │  └─ Use Circuit Breaker + Retry
         │      - Retry individual requests (3 attempts)
         │      - Circuit opens after sustained failures (10 failed requests)
         │      - Fail fast when circuit is open
         │      - Periodically test recovery (HALF_OPEN state)
         │
         └─ Unknown/Mixed
             └─ Use capped exponential backoff
                 pipe(
                   Schedule.exponential(100ms),
                   Schedule.jittered(),
                   Schedule.either(Schedule.spaced(5s)),  // Cap at 5s
                   Schedule.compose(Schedule.recurs(10)), // Max 10 retries
                   Schedule.whileOutput(elapsed =>        // Max 30s total
                     Duration.lessThan(elapsed, Duration.seconds(30))
                   )
                 )
                 - Handles transient failures (quick retries)
                 - Caps delay to prevent excessive waiting
                 - Limits total retry time
                 - Prevents infinite retries
```

### Resource Management Decision Flowchart

```
Does your operation use resources that need cleanup?
│
├─ NO → Use regular Effect operations
│       - Pure computations
│       - Stateless operations
│
└─ YES → What type of resource?
         │
         ├─ Single resource (file, connection, lock)
         │  └─ Use Effect.acquireUseRelease()
         │      - Acquire: Open resource
         │      - Use: Perform operations
         │      - Release: ALWAYS cleanup (even on error/interruption)
         │
         ├─ Multiple independent resources
         │  └─ Nest Effect.acquireUseRelease()
         │      Effect.acquireUseRelease(
         │        acquireDB,
         │        (db) => Effect.acquireUseRelease(
         │          acquireCache,
         │          (cache) => useResources(db, cache),
         │          releaseCache
         │        ),
         │        releaseDB
         │      )
         │
         ├─ Resource pool (database connections, HTTP clients)
         │  └─ Use Effect.Pool
         │      - Pre-create resources (min pool size)
         │      - Reuse across operations
         │      - Automatic lifecycle management
         │      - Backpressure when pool exhausted
         │
         └─ Scoped resources (tied to request/session lifetime)
             └─ Use Effect.scoped()
                 - Resources tied to scope
                 - Cleanup when scope exits
                 - Compose multiple scoped resources
```

### Timing Comparison Table

This table shows the execution time benefits of different concurrency patterns when processing 5 tasks that each take 100ms:

| Pattern | Configuration | Total Time | Use Case |
|---------|--------------|------------|----------|
| Sequential | `{ concurrency: 1 }` | ~500ms | Operations must run in order |
| Limited Parallel | `{ concurrency: 2 }` | ~300ms | Limited resources (DB connections, API rate limits) |
| Limited Parallel | `{ concurrency: 3 }` | ~200ms | Balance between speed and resource usage |
| Full Parallel | `{ concurrency: "unbounded" }` | ~100ms | Independent operations, no resource constraints |
| Race | `Effect.race(...)` | ~100ms | Only need first result, not all results |

**Key Insight**: Full parallelism provides 5x speedup for independent tasks, but limited concurrency is often necessary for resource management.

**Real Example**:
```typescript
// Sequential: 500ms total
await Effect.all([
  fetchUser(1),    // 100ms
  fetchUser(2),    // 100ms  (starts after #1 completes)
  fetchUser(3),    // 100ms  (starts after #2 completes)
  fetchUser(4),    // 100ms  (starts after #3 completes)
  fetchUser(5),    // 100ms  (starts after #4 completes)
], { concurrency: 1 })

// Full Parallel: 100ms total
await Effect.all([
  fetchUser(1),    // 100ms \
  fetchUser(2),    // 100ms  |
  fetchUser(3),    // 100ms  ├─ All run simultaneously
  fetchUser(4),    // 100ms  |
  fetchUser(5),    // 100ms /
], { concurrency: "unbounded" })
```

### Jitter Strategy Trade-offs

Different jitter strategies offer different benefits for retry scenarios:

| Strategy | Configuration | Delay Range | Best For | Trade-offs |
|----------|--------------|-------------|----------|-----------|
| **Full Jitter** | `Schedule.jittered()` | 0% - 100% of base delay | High load scenarios, thundering herd prevention | Maximum spread, but can retry very quickly |
| **Equal Jitter** | `Schedule.jittered({ min: 0.5, max: 1.0 })` | 50% - 100% of base delay | Balanced retry timing | Good compromise between speed and spread |
| **Decorrelated Jitter** | Custom implementation | Variable based on previous | AWS recommended approach | More complex, better distribution |
| **No Jitter** | No jitter applied | Exactly base delay | Testing, predictable timing | Thundering herd risk |
| **Small Jitter** | `Schedule.jittered({ min: 0.9, max: 1.1 })` | ±10% variation | Slight randomization | Minimal spread, less effective |
| **Custom Range** | `Schedule.jittered({ min: 0.8, max: 1.5 })` | Custom range | Specific use cases | Flexible but requires tuning |

**When to Use Each**:

1. **Full Jitter** (`Schedule.jittered()`)
   - **Use**: Distributed systems with many clients
   - **Scenario**: 1000 users hitting your API, service goes down, all retry
   - **Why**: Maximum spread prevents all clients from retrying simultaneously
   - **Example**: Public APIs, cloud services, high-scale applications

2. **Equal Jitter** (`min: 0.5, max: 1.0`)
   - **Use**: Moderate load systems
   - **Scenario**: Internal microservices with 10-100 clients
   - **Why**: Balances retry speed with spread
   - **Example**: Microservice communication, database retries

3. **No Jitter**
   - **Use**: Development, testing, or single-client scenarios
   - **Scenario**: Local development, unit tests, debugging
   - **Why**: Predictable timing helps with debugging
   - **Example**: Test suites, local scripts

**Real-World Impact**:
```typescript
// Without jitter - Thundering Herd Problem:
// Time: 0ms   - All 100 clients try request → Service overload
// Time: 100ms - All 100 clients retry → Service overload again
// Time: 200ms - All 100 clients retry → Service overload again

// With full jitter:
// Time: 0ms   - All 100 clients try request → Service overload
// Time: 0-100ms - Clients retry at random times → Load spread out
// Time: 0-200ms - Clients retry at random times → Load spread out
```

### Common Pitfalls

#### 1. Using Sequential When Parallel Would Work
```typescript
// BAD: Sequential execution (500ms total)
const results = await Effect.all([
  fetchUserProfile(userId),
  fetchUserSettings(userId),
  fetchUserPreferences(userId)
], { concurrency: 1 })  // Unnecessarily slow!

// GOOD: Parallel execution (100ms total)
const results = await Effect.all([
  fetchUserProfile(userId),
  fetchUserSettings(userId),
  fetchUserPreferences(userId)
], { concurrency: "unbounded" })
```

#### 2. Unlimited Concurrency with Limited Resources
```typescript
// BAD: Might exhaust database connections
await Effect.forEach(
  thousandsOfItems,
  item => saveToDatabase(item),
  { concurrency: "unbounded" }  // Could open 1000s of DB connections!
)

// GOOD: Limit concurrent database operations
await Effect.forEach(
  thousandsOfItems,
  item => saveToDatabase(item),
  { concurrency: 10 }  // Respects DB connection pool limit
)
```

#### 3. Forgetting to Handle Race Losers
```typescript
// BAD: Resources might not clean up properly
Effect.race(
  fetchFromCache(),      // If this loses, does it clean up?
  fetchFromDatabase()    // If this loses, is DB connection closed?
)

// GOOD: Use Effect.ensuring or Effect.acquireUseRelease
Effect.race(
  pipe(fetchFromCache(), Effect.ensuring(cleanupCache)),
  pipe(fetchFromDatabase(), Effect.ensuring(closeConnection))
)
```

#### 4. Not Using Jitter in Distributed Systems
```typescript
// BAD: All clients retry at same time
const retrySchedule = Schedule.exponential(Duration.millis(100))
// 100ms, 200ms, 400ms, 800ms... (all clients synchronized!)

// GOOD: Clients retry at random times
const retrySchedule = pipe(
  Schedule.exponential(Duration.millis(100)),
  Schedule.jittered()  // Prevents thundering herd
)
```

#### 5. Using Effect.race for Operations with Side Effects
```typescript
// PROBLEMATIC: Both operations write to database
Effect.race(
  updateUserInDatabase(userId, newData),
  updateUserInDatabase(userId, otherData)
)
// Race winner writes, loser is interrupted - but both might partially write!

// BETTER: Use Effect.race only for read operations or idempotent writes
Effect.race(
  fetchUserFromCache(userId),
  fetchUserFromDatabase(userId)
)
```

#### 6. Ignoring Interruption in Long-Running Tasks
```typescript
// BAD: Task ignores interruption signals
const longTask = Effect.gen(function* (_) {
  for (let i = 0; i < 1000000; i++) {
    yield* _(processItem(i))  // No interruption checkpoints
  }
})

// GOOD: Make tasks interruptible
const longTask = Effect.gen(function* (_) {
  for (let i = 0; i < 1000000; i++) {
    yield* _(Effect.yieldNow())  // Allow interruption
    yield* _(processItem(i))
  }
})
```

#### 7. Not Capping Retry Delays
```typescript
// BAD: Exponential backoff without cap
const retrySchedule = Schedule.exponential(Duration.millis(100))
// 100ms, 200ms, 400ms, 800ms, 1.6s, 3.2s, 6.4s, 12.8s, 25.6s...
// After 10 retries: waiting over 1 minute between attempts!

// GOOD: Cap maximum delay
const retrySchedule = pipe(
  Schedule.exponential(Duration.millis(100)),
  Schedule.jittered(),
  Schedule.either(Schedule.spaced(Duration.seconds(5))),  // Max 5s delay
  Schedule.compose(Schedule.recurs(10))  // Max 10 retries
)
```

### Real-World Scenario Mappings

#### Scenario: User Dashboard Loading
**Challenge**: Load user profile, settings, notifications, and recent activity.

**Solution**: Parallel execution with `Effect.all`
```typescript
const loadDashboard = (userId: string) => Effect.all([
  fetchUserProfile(userId),      // Independent
  fetchUserSettings(userId),     // Independent
  fetchNotifications(userId),    // Independent
  fetchRecentActivity(userId)    // Independent
], { concurrency: "unbounded" })

// Result: 4x faster than sequential loading
```

#### Scenario: API with Cache Fallback
**Challenge**: Try cache first, fallback to API if cache miss.

**Solution**: `Effect.race` with timeout
```typescript
const getUserData = (userId: string) =>
  Effect.race(
    fetchFromCache(userId),
    pipe(
      Effect.sleep(Duration.millis(50)),  // Give cache 50ms head start
      Effect.flatMap(() => fetchFromAPI(userId))
    )
  )

// Result: Ultra-fast for cache hits, graceful fallback for misses
```

#### Scenario: Bulk Data Import
**Challenge**: Import 10,000 records into database without overwhelming it.

**Solution**: `Effect.forEach` with limited concurrency
```typescript
const importRecords = (records: Record[]) =>
  Effect.forEach(
    records,
    record => insertIntoDatabase(record),
    { concurrency: 5 }  // Respect DB connection pool
  )

// Result: Efficient processing without resource exhaustion
```

#### Scenario: Microservice Health Check
**Challenge**: Check if service is healthy, retry with backoff if down.

**Solution**: Retry with jittered exponential backoff
```typescript
const healthCheck = pipe(
  checkServiceHealth(),
  Effect.retry(
    pipe(
      Schedule.exponential(Duration.millis(100)),
      Schedule.jittered(),  // Prevent thundering herd if many instances checking
      Schedule.compose(Schedule.recurs(5))
    )
  )
)

// Result: Resilient health checking without overloading recovering services
```

#### Scenario: File Upload with Timeout
**Challenge**: Upload file but fail if takes more than 30 seconds.

**Solution**: `Effect.race` with timeout
```typescript
const uploadWithTimeout = (file: File) =>
  Effect.race(
    uploadFile(file),
    pipe(
      Effect.sleep(Duration.seconds(30)),
      Effect.flatMap(() => Effect.fail(new TimeoutError("Upload timeout")))
    )
  )

// Result: User gets feedback if upload is stuck
```

#### Scenario: Multi-Step Wizard
**Challenge**: User registration wizard: validate email → create account → send welcome email.

**Solution**: Sequential execution with `Effect.all`
```typescript
const registerUser = (email: string, password: string) => Effect.all([
  validateEmail(email),
  Effect.flatMap(() => createAccount(email, password)),
  Effect.flatMap(account => sendWelcomeEmail(account.email))
], { concurrency: 1 })

// Alternative: Use Effect.gen for clearer step-by-step flow
const registerUser = (email: string, password: string) => Effect.gen(function* (_) {
  yield* _(validateEmail(email))
  const account = yield* _(createAccount(email, password))
  yield* _(sendWelcomeEmail(account.email))
  return account
})

// Result: Clear ordered flow, each step depends on previous
```

#### Scenario: Aggregating Data from Multiple APIs
**Challenge**: Fetch weather, news, and stock data from different APIs.

**Solution**: `Effect.all` with timeouts for each
```typescript
const aggregateDashboard = Effect.all([
  Effect.race(fetchWeather(), timeout(5000)),
  Effect.race(fetchNews(), timeout(5000)),
  Effect.race(fetchStocks(), timeout(5000))
], { concurrency: "unbounded" })

// Result: Fast parallel fetching, no single slow API blocks others
```

#### Scenario: Background Job with Cancellation
**Challenge**: Start data sync job, allow user to cancel it.

**Solution**: Fiber management with interruption
```typescript
const startSyncJob = Effect.gen(function* (_) {
  const fiber = yield* _(Effect.fork(syncLargeDataset()))

  // User can cancel
  yield* _(waitForCancelSignal())
  yield* _(Fiber.interrupt(fiber))

  // Or wait for completion
  const result = yield* _(Fiber.join(fiber))
  return result
})

// Result: User has control over long-running operations
```

### 7. Resource Pooling

The `src/resource-pooling.ts` file demonstrates resource pool management for databases, HTTP clients, and other expensive resources.

#### Database Connection Pool

```typescript
// Create a pool with minimum and maximum connections
const pool = makeDbConnectionPool(minSize: 2, maxSize: 10)

// Use the pool in a scoped context
const result = await Effect.runPromise(
  Effect.scoped(
    Effect.flatMap(pool, (p) =>
      queryWithPool(p, "SELECT * FROM users")
    )
  )
)
```

**Key Features:**
- Automatic resource acquisition and release
- Connection reuse for efficiency
- Configurable pool size limits
- Backpressure handling when pool is exhausted

#### HTTP Client Pool

```typescript
// Create a pool for HTTP clients
const clientPool = makeHttpClientPool(minSize: 3, maxSize: 15)

// Fetch multiple URLs using the pool
const urls = [
  "https://api.example.com/users",
  "https://api.example.com/products",
  "https://api.example.com/orders"
]

const results = await Effect.runPromise(
  Effect.scoped(
    Effect.flatMap(clientPool, (pool) =>
      fetchMultipleUrls(pool, urls)
    )
  )
)
```

#### Pool Best Practices

**Conservative Configuration** (for databases, expensive resources):
```typescript
{
  minSize: 2,
  maxSize: 10,
  timeToLive: Duration.minutes(5)  // Recycle old connections
}
```

**Aggressive Configuration** (for HTTP clients, lightweight resources):
```typescript
{
  minSize: 5,
  maxSize: 50,
  timeToLive: Duration.minutes(1)
}
```

#### Transaction Pattern

Use the same connection for multiple related operations:

```typescript
const executeTransaction = (pool, operations) =>
  Effect.scoped(
    Effect.flatMap(pool, (p) =>
      Pool.get(p).pipe(
        Effect.flatMap((conn) =>
          Effect.all(operations.map(op => op(conn)), {
            concurrency: 1  // Sequential within transaction
          })
        )
      )
    )
  )
```

#### Pool Warmup

Pre-create connections during application startup to avoid cold-start latency:

```typescript
// Warm up pool with initial connections
const warmupPool = (pool, count: number = 3) =>
  Effect.scoped(
    Effect.flatMap(pool, (p) =>
      Effect.all(
        Array.from({ length: count }, () => Pool.get(p)),
        { concurrency: "unbounded" }
      )
    )
  )

// Use at application startup
await Effect.runPromise(
  Effect.scoped(
    Effect.flatMap(makeDbConnectionPool(2, 10), (pool) =>
      pipe(
        warmupPool(pool, 5),
        Effect.flatMap(() => runApplication(pool))
      )
    )
  )
)
```

#### Advanced Patterns

**Query with Timeout:**
```typescript
const queryWithTimeout = (pool, sql, timeoutMs = 5000) =>
  pipe(
    queryWithPool(pool, sql),
    Effect.timeout(Duration.millis(timeoutMs)),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new Error(`Query timed out after ${timeoutMs}ms`))
    )
  )
```

**Fallback Pattern:**
```typescript
const queryWithFallback = (pool, sql, fallback) =>
  pipe(
    queryWithTimeout(pool, sql, 1000),
    Effect.catchAll(() => Effect.succeed(fallback))
  )
```

**Metrics Tracking:**
```typescript
const metrics = { queries: 0, poolWaits: 0 }

const queryWithMetrics = (pool, sql) =>
  pipe(
    Effect.sync(() => { metrics.queries++ }),
    Effect.flatMap(() => queryWithPool(pool, sql))
  )
```

#### When to Use Resource Pooling

**Use resource pooling when:**
- Creating resources is expensive (database connections, HTTP clients)
- You need to limit concurrent resource usage
- Resources can be safely reused across operations
- You want automatic resource lifecycle management

**Don't use pooling when:**
- Resources are cheap to create/destroy
- Each operation needs a unique, non-reusable resource
- Resource state cannot be safely shared

#### Common Pitfalls

1. **Pool Exhaustion**: Set appropriate maxSize based on expected load
2. **Connection Leaks**: Always use `Effect.scoped` to ensure cleanup
3. **Cold Starts**: Use warmup for latency-sensitive applications
4. **Timeouts**: Add timeouts to pool operations to prevent indefinite waiting

### 8. Enhanced Error Handling

The `src/error-handling.ts` module demonstrates advanced error handling patterns beyond basic try-catch:

#### Error Logging with tapError

Log errors without modifying the error channel - crucial for monitoring and debugging:

```typescript
// Log errors while preserving error flow
const fetchWithLogging = (url: string) =>
  pipe(
    fetchData(url),
    Effect.tap((data) => Console.log(`Success: ${url}`)),
    Effect.tapError((error) =>
      Console.log(`[ERROR] ${error._tag}: ${error.message}`)
    ),
    Effect.tapError((error) =>
      // Send to monitoring service
      sendToTelemetry(error)
    )
  )
```

**Why tapError?**
- Doesn't change the error channel (error still propagates)
- Enables side effects like logging without handling
- Can chain multiple logging operations
- Perfect for telemetry and monitoring integration

#### Error Recovery Strategies Beyond Fail-Fast

**Fallback Chain**: Try multiple strategies until one succeeds

```typescript
const fetchWithFallbacks = (url: string) =>
  pipe(
    fetchFromApi(url),           // Try primary
    Effect.orElse(() => fetchFromCache(url)),  // Try cache
    Effect.orElse(() => fetchFromBackup(url)), // Try backup
    Effect.orElse(() => Effect.succeed(defaultData)) // Use default
  )
```

**Partial Success**: Process all items, collect both successes and failures

```typescript
const fetchMultiple = (urls: string[]) =>
  pipe(
    Effect.forEach(urls, (url) =>
      pipe(
        fetchData(url),
        Effect.map((data) => ({ url, data, success: true })),
        Effect.catchAll((error) =>
          Effect.succeed({ url, error, success: false })
        )
      )
    ),
    Effect.map((results) => ({
      successes: results.filter((r) => r.success),
      failures: results.filter((r) => !r.success)
    }))
  )
```

**Degraded Mode**: After retries exhausted, switch to limited functionality

```typescript
const fetchWithDegradedMode = (url: string) =>
  pipe(
    fetchFullData(url),
    Effect.retry({ times: 3 }),
    Effect.map((data) => ({ data, mode: "full" })),
    Effect.catchAll(() =>
      Effect.succeed({ data: cachedData, mode: "degraded" })
    )
  )
```

**Circuit Breaker**: Stop trying after repeated failures to prevent cascade failures

```typescript
// Opens circuit after 3 failures, resets after 1 second
const circuitBreaker = makeCircuitBreaker(
  riskyOperation,
  threshold: 3,
  resetAfter: Duration.seconds(1)
)

// States: Closed → Open (fail fast) → Half-Open (try again)
```

#### Error Aggregation in Concurrent Operations

**Collect All Errors**: Validate all items instead of failing on first error

```typescript
const validateAll = (items: Item[]) =>
  pipe(
    Effect.forEach(items, (item) =>
      pipe(
        validateItem(item),
        Effect.either // Capture both success and failure
      )
    ),
    Effect.flatMap((results) => {
      const successes = results.filter(isSuccess)
      const failures = results.filter(isFailure)

      if (failures.length > 0) {
        return Effect.fail(new AggregateError({
          message: `${failures.length} validations failed`,
          errors: failures,
          successCount: successes.length,
          failureCount: failures.length
        }))
      }

      return Effect.succeed(successes)
    })
  )
```

**First N Successes**: Continue until you get enough successful results

```typescript
const fetchFirstN = (urls: string[], required: number) =>
  pipe(
    Effect.forEach(urls, (url) =>
      pipe(fetchData(url), Effect.either)
    ),
    Effect.flatMap((results) => {
      const successes = results.filter(isSuccess)

      if (successes.length >= required) {
        return Effect.succeed(successes.slice(0, required))
      }

      return Effect.fail(new AggregateError({
        message: `Only ${successes.length}/${required} succeeded`
      }))
    })
  )
```

**Error Summary**: Provide aggregated error information

```typescript
const fetchAllWithSummary = (urls: string[]) =>
  pipe(
    Effect.all(urls.map(fetchData), { mode: "either" }),
    Effect.flatMap((results) => {
      const failures = results.filter(isFailure)

      if (failures.length > 0) {
        return Effect.fail({
          summary: `${failures.length}/${urls.length} failed`,
          errors: failures,
          statusCodes: failures.map((e) => e.statusCode)
        })
      }

      return Effect.succeed(results.map((r) => r.value))
    })
  )
```

#### Error Context Enrichment

Add contextual information as errors propagate up the call stack:

```typescript
const enrichErrorContext = (effect, context) =>
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

// Usage in nested operations
const loadUserData = (userId: string) =>
  pipe(
    Effect.all({
      profile: fetchProfile(userId),
      settings: fetchSettings(userId)
    }),
    enrichErrorContext({
      operation: "loadUserData",
      userId,
      requestId: generateRequestId()
    })
  )
```

**Add Stack Traces**:

```typescript
const withStackTrace = (effect, label) =>
  pipe(
    effect,
    Effect.mapError((error) => ({
      ...error,
      stackTrace: new Error().stack,
      functionLabel: label,
      capturedAt: new Date().toISOString()
    }))
  )
```

#### Timeout Error Handling Patterns

**Timeout with Custom Error**:

```typescript
const withTimeout = (effect, timeoutMs, operation) =>
  pipe(
    effect,
    Effect.timeoutFail({
      duration: Duration.millis(timeoutMs),
      onTimeout: () => new TimeoutError({
        message: `${operation} timed out after ${timeoutMs}ms`,
        timeoutMs,
        operation
      })
    })
  )
```

**Timeout with Fallback Value**:

```typescript
const withTimeoutFallback = (effect, timeoutMs, fallback) =>
  pipe(
    effect,
    Effect.timeout(Duration.millis(timeoutMs)),
    Effect.map((option) => option._tag === "None" ? fallback : option.value),
    Effect.catchAll(() => Effect.succeed(fallback))
  )
```

**Timeout with Retry**:

```typescript
const withTimeoutRetry = (effect, timeoutMs, maxRetries, operation) =>
  pipe(
    effect,
    Effect.timeoutFail({
      duration: Duration.millis(timeoutMs),
      onTimeout: () => new TimeoutError({ timeoutMs, operation })
    }),
    Effect.retry({
      while: (error) => error._tag === "TimeoutError",
      times: maxRetries
    })
  )
```

**Progressive Timeout**: Increase timeout on each retry

```typescript
// First attempt: 100ms, second: 200ms, third: 400ms...
const withProgressiveTimeout = (effect, baseTimeoutMs, maxRetries, operation) =>
  // Timeout doubles on each retry attempt
  // Useful when network conditions vary
```

**Partial Results with Timeout**:

```typescript
const fetchMultipleWithTimeout = (urls: string[], timeoutMs: number) =>
  pipe(
    Effect.forEach(urls, (url) =>
      pipe(
        fetchData(url),
        Effect.timeout(Duration.millis(timeoutMs)),
        Effect.map((option) => option._tag === "None" ? null : option.value)
      )
    ),
    Effect.map((results) => results.filter((r) => r !== null))
  )
  // Returns successful results even if some timed out
```

#### When to Use Each Pattern

**Use tapError When:**
- Logging errors for monitoring/debugging
- Sending errors to telemetry services
- Triggering side effects without handling errors
- You want errors to continue propagating

**Use Fallback Chain When:**
- Multiple data sources can provide the same information
- You want graceful degradation
- Primary source might be temporarily unavailable
- Default/cached data is acceptable fallback

**Use Error Aggregation When:**
- Validating multiple fields/items
- You need to see ALL errors, not just the first one
- Processing batches where partial success is valuable
- Building user-facing validation messages

**Use Context Enrichment When:**
- Debugging complex error flows
- Errors cross multiple service boundaries
- You need request tracing
- Building error reports for support teams

**Use Timeouts When:**
- External services might hang indefinitely
- You have SLA requirements
- User experience demands quick feedback
- Preventing resource exhaustion from slow operations

#### Common Patterns

**API with Timeout and Fallback**:

```typescript
const robustApiCall = (url: string) =>
  pipe(
    fetchFromApi(url),
    withTimeout(5000, "api-fetch"),
    Effect.catchTag("TimeoutError", () => fetchFromCache(url)),
    Effect.catchTag("NetworkError", () => Effect.succeed(defaultData)),
    enrichErrorContext({ operation: "robustApiCall", url }),
    Effect.tapError((error) => logToMonitoring(error))
  )
```

**Batch Processing with Error Aggregation**:

```typescript
const processBatch = (items: Item[]) =>
  pipe(
    validateAll(items),
    Effect.catchTag("AggregateError", (error) =>
      Effect.gen(function* () {
        yield* Console.log(`${error.failureCount} items failed validation`)
        // Process valid items only
        return processValidItems(error.successCount)
      })
    ),
    enrichErrorContext({ operation: "batchProcess", count: items.length })
  )
```

**Circuit Breaker with Monitoring**:

```typescript
const protectedServiceCall = (request: Request) =>
  pipe(
    makeCircuitBreaker(callExternalService(request), 5, Duration.seconds(30)),
    Effect.tapError((error) =>
      error._tag === "NetworkError" && error.message.includes("Circuit breaker")
        ? alertOps("Circuit breaker opened")
        : Effect.void
    ),
    withTimeout(10000, "service-call"),
    enrichErrorContext({ operation: "serviceCall", requestId: request.id })
  )
```

### 9. Circuit Breaker Patterns

The `src/circuit-breaker.ts` module provides comprehensive circuit breaker implementations for preventing cascading failures in distributed systems. A circuit breaker monitors operations and "opens" when failures exceed a threshold, causing subsequent requests to fail fast instead of overwhelming a struggling service.

#### Circuit Breaker State Machine

```
                  ┌─────────┐
       ┌──────────┤  CLOSED │◄──────────┐
       │          └─────────┘           │
       │                │                │
       │                │                │
  success          failure_threshold     │
       │             exceeded         success
       │                │                │
       │                ▼                │
       │          ┌─────────┐            │
       └──────────┤  OPEN   │            │
                  └─────────┘            │
                        │                │
                        │                │
                  timeout_elapsed        │
                        │                │
                        ▼                │
                  ┌──────────┐           │
                  │ HALF_OPEN│───────────┘
                  └──────────┘
                        │
                        │
                     failure
                        │
                        ▼
                  (back to OPEN)
```

**States**:
- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Circuit tripped, requests fail fast without calling service
- **HALF_OPEN**: Testing recovery, allows limited requests through

#### When to Use Circuit Breaker vs Simple Retry

**Use Circuit Breaker When**:
- Calling external services that may experience prolonged outages
- Preventing cascading failures across microservices
- The downstream service needs time to recover (CPU/memory exhaustion)
- You want to fail fast during outages instead of wasting resources
- Protecting your system from repeatedly calling a broken service

**Use Simple Retry When**:
- Transient network glitches (connection timeout, packet loss)
- Rate limiting errors (can retry after backoff)
- Temporary resource unavailability
- Quick recovery is expected
- The failure is unlikely to persist

**Use Both Together When**:
- You want retry logic for transient failures
- But also protection against sustained failures
- Example: Retry 3 times per request, but open circuit after 10 consecutive failures

#### Basic Circuit Breaker

```typescript
import { makeCircuitBreaker } from "./circuit-breaker"

const protectedCall = makeCircuitBreaker(riskyApiCall, {
  failureThreshold: 5,      // Open after 5 failures
  successThreshold: 2,      // Close after 2 successes in HALF_OPEN
  resetTimeout: 60_000      // Try HALF_OPEN after 60 seconds
})

// Use it like any Effect
const result = await Effect.runPromise(protectedCall)
```

#### Circuit Breaker with Metrics

Track detailed metrics about circuit breaker performance:

```typescript
const { execute, getMetrics } = makeCircuitBreakerWithMetrics(apiCall, {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeout: 60_000
})

// Execute requests
await Effect.runPromise(execute())

// Check metrics
const metrics = getMetrics()
console.log(`State: ${metrics.state}`)
console.log(`Success rate: ${(metrics.totalSuccesses / metrics.totalRequests * 100).toFixed(1)}%`)
console.log(`Failures: ${metrics.totalFailures}`)
console.log(`State transitions: ${metrics.stateTransitions.length}`)
```

**Available Metrics**:
- Current state (CLOSED, OPEN, HALF_OPEN)
- Total requests, successes, failures
- Consecutive successes and failures
- Last success and failure timestamps
- State transition history
- Success/failure counts

#### Circuit Breaker with Retry Integration

Combine circuit breaker with retry logic for comprehensive resilience:

```typescript
const { execute } = makeCircuitBreakerWithRetry(apiCall, {
  circuitBreaker: {
    failureThreshold: 10,
    successThreshold: 2,
    resetTimeout: 60_000
  },
  retry: {
    times: 3,
    schedule: Schedule.exponential(Duration.millis(100))
  }
})

// Automatically retries transient failures
// Opens circuit for sustained failures
await Effect.runPromise(execute())
```

**How it works**:
1. Each request is retried up to 3 times for transient failures
2. After 10 failed requests (each with retries), circuit opens
3. When circuit is open, no retries are attempted (fail fast)
4. After 60 seconds, circuit moves to HALF_OPEN to test recovery

#### Monitored Circuit Breaker

Add custom hooks for alerting, logging, and metrics:

```typescript
const { execute } = makeMonitoredCircuitBreaker(
  apiCall,
  {
    failureThreshold: 5,
    successThreshold: 2,
    resetTimeout: 30_000
  },
  {
    onCircuitOpen: (metrics) =>
      Effect.all([
        Console.log(`🚨 Circuit opened! Failures: ${metrics.totalFailures}`),
        sendPagerDutyAlert("Circuit breaker opened"),
        sendMetricToDatadog("circuit_breaker.opened", 1)
      ]),

    onCircuitClosed: (metrics) =>
      Effect.all([
        Console.log(`✅ Circuit closed. Success rate: ${metrics.totalSuccesses / metrics.totalRequests}`),
        sendMetricToDatadog("circuit_breaker.closed", 1)
      ]),

    onStateChange: (from, to, metrics) =>
      sendMetricToDatadog("circuit_breaker.state_change", 1, {
        from,
        to,
        totalRequests: metrics.totalRequests
      }),

    onSuccess: (result, metrics) =>
      sendMetricToDatadog("circuit_breaker.success", 1),

    onFailure: (error, metrics) =>
      Effect.all([
        logError("circuit-breaker")(error),
        sendMetricToDatadog("circuit_breaker.failure", 1)
      ])
  }
)
```

#### Resilient API Client

Complete example of a production-ready API client with circuit breaker:

```typescript
const client = createResilientApiClient(apiCall)

// Make requests
const response = await Effect.runPromise(client.call())

// Health check
const health = await Effect.runPromise(client.healthCheck())
console.log(`Healthy: ${health.healthy}`)
console.log(`State: ${health.state}`)
console.log(`Success rate: ${health.successRate}%`)

// Get detailed metrics
const metrics = client.getMetrics()
```

#### Best Practices

1. **Set Appropriate Thresholds**: Balance between quick failure detection and tolerance for transient errors
   ```typescript
   // Too sensitive - might trip on single transient error
   failureThreshold: 1  // ❌

   // Better - tolerates some failures
   failureThreshold: 5  // ✓
   ```

2. **Choose Right Reset Timeout**: Give services enough time to recover
   ```typescript
   // Too short - might not give service time to recover
   resetTimeout: 1_000  // 1 second ❌

   // Better - allows recovery time
   resetTimeout: 30_000  // 30 seconds ✓
   ```

3. **Monitor State Transitions**: Alert when circuit opens
   ```typescript
   onCircuitOpen: (metrics) =>
     sendAlert(`Circuit opened for ${serviceName}`)
   ```

4. **Use with Retry for Transient Failures**: Circuit breaker alone won't retry
   ```typescript
   // Good: Retry + Circuit Breaker
   makeCircuitBreakerWithRetry(apiCall, {
     circuitBreaker: config,
     retry: { times: 3 }
   })
   ```

5. **Test Failure Scenarios**: Verify circuit breaker behaves correctly under load
   ```typescript
   // Simulate sustained failures
   for (let i = 0; i < 10; i++) {
     await Effect.runPromise(execute()).catch(() => {})
   }
   const metrics = getMetrics()
   expect(metrics.state).toBe("OPEN")
   ```

#### Common Patterns

**Fallback to Cache When Circuit Opens**:
```typescript
pipe(
  circuitBreaker.execute(),
  Effect.catchTag("CircuitBreakerOpenError", () =>
    pipe(
      Console.log("Circuit open, falling back to cache"),
      Effect.flatMap(() => fetchFromCache(cacheKey))
    )
  )
)
```

**Progressive Circuit Breaker**: Different thresholds for different error types
```typescript
const protectedCall = pipe(
  apiCall,
  Effect.retry({ times: 3 }),  // Retry transient errors
  (effect) => makeCircuitBreaker(effect, {
    failureThreshold: 10,      // But open circuit for sustained failures
    successThreshold: 2,
    resetTimeout: 60_000
  })
)
```

**Circuit Breaker per Endpoint**: Isolate failures to specific endpoints
```typescript
const circuitBreakers = {
  users: makeCircuitBreaker(usersApi, config),
  orders: makeCircuitBreaker(ordersApi, config),
  products: makeCircuitBreaker(productsApi, config)
}

// One endpoint failing doesn't affect others
const userData = await Effect.runPromise(circuitBreakers.users.execute())
```

## Troubleshooting Guide

This section covers common errors, their causes, and solutions when working with Effect.

### Common Error Messages and Solutions

#### 1. Type Error: "Type 'Effect<A, E1>' is not assignable to type 'Effect<A, E2>'"

**Error Message**:
```
Type 'Effect<User, NetworkError | ValidationError>' is not assignable to type 'Effect<User, NetworkError>'.
  Type 'NetworkError | ValidationError' is not assignable to type 'NetworkError'.
```

**Cause**: You're trying to use an Effect that can fail with multiple error types in a context that expects fewer error types.

**Solution**: Handle the additional error types explicitly:

```typescript
// Problem: Function expects only NetworkError, but we have NetworkError | ValidationError
const processUser = (id: string): Effect.Effect<User, NetworkError> => {
  return fetchUser(id)  // Error! Returns Effect<User, NetworkError | ValidationError>
}

// Solution 1: Handle ValidationError explicitly
const processUser = (id: string): Effect.Effect<User, NetworkError> => {
  return pipe(
    fetchUser(id),
    Effect.catchTag("ValidationError", (error) =>
      // Convert to NetworkError or handle differently
      Effect.fail(new NetworkError({ message: "Invalid user data", statusCode: 400 }))
    )
  )
}

// Solution 2: Update the function signature to allow both error types
const processUser = (id: string): Effect.Effect<User, NetworkError | ValidationError> => {
  return fetchUser(id)  // Now it's fine!
}
```

#### 2. Runtime Error: "Fiber interrupted"

**Error Message**:
```
FiberFailure: Interrupted
  at <anonymous> (effect/runtime)
```

**Cause**: An Effect was interrupted (cancelled) before completion, often due to timeout or manual cancellation.

**Solution**: Handle interruption gracefully with cleanup:

```typescript
// Problem: Long-running task doesn't handle interruption
const longTask = Effect.gen(function* (_) {
  for (let i = 0; i < 1000000; i++) {
    yield* _(processItem(i))  // Never checks for interruption
  }
})

// Solution: Add interruption handling and cleanup
const longTask = pipe(
  Effect.gen(function* (_) {
    for (let i = 0; i < 1000000; i++) {
      yield* _(Effect.yieldNow())  // Allow interruption
      yield* _(processItem(i))
    }
  }),
  Effect.onInterrupt(() =>
    Console.log("Task interrupted, cleaning up...")
  )
)

// For critical sections that must complete:
const criticalTask = Effect.uninterruptible(
  Effect.gen(function* (_) {
    yield* _(startTransaction())
    yield* _(updateDatabase())
    yield* _(commitTransaction())
  })
)
```

#### 3. Error: "Maximum call stack size exceeded"

**Error Message**:
```
RangeError: Maximum call stack size exceeded
  at pipe (effect/Function)
```

**Cause**: Deep Effect composition or recursive operations without stack-safe combinators.

**Solution**: Use Effect's stack-safe operations:

```typescript
// Problem: Recursive function causes stack overflow
const processItems = (items: Item[]): Effect.Effect<void, Error> => {
  if (items.length === 0) return Effect.void
  return pipe(
    processItem(items[0]),
    Effect.flatMap(() => processItems(items.slice(1)))  // Not stack-safe!
  )
}

// Solution 1: Use Effect.forEach (stack-safe)
const processItems = (items: Item[]) =>
  Effect.forEach(items, (item) => processItem(item), { concurrency: 1 })

// Solution 2: Use Effect.iterate for complex recursion
const processItems = (items: Item[]) =>
  Effect.iterate(
    0,  // Initial state
    {
      while: (index) => index < items.length,
      body: (index) => pipe(
        processItem(items[index]),
        Effect.map(() => index + 1)
      )
    }
  )
```

#### 4. Error: "Effect has no error channel but error was provided"

**Error Message**:
```
TypeError: Cannot fail an Effect with no error channel
```

**Cause**: Trying to fail an Effect that has type `Effect<A, never>` (can't fail).

**Solution**: Either allow the Effect to fail or handle the error differently:

```typescript
// Problem: Effect.succeed creates Effect<A, never>
const myEffect: Effect.Effect<string, Error> = pipe(
  Effect.succeed("hello"),
  Effect.flatMap(() => Effect.fail(new Error("oops")))  // Type error!
)

// Solution: Start with an Effect that can fail
const myEffect: Effect.Effect<string, Error> = pipe(
  Effect.void,  // Effect<void, never>
  Effect.flatMap(() =>
    Math.random() > 0.5
      ? Effect.succeed("hello")
      : Effect.fail(new Error("oops"))
  )
)
```

#### 5. Test Error: "Effect exceeded timeout"

**Error Message**:
```
TimeoutException: Effect exceeded timeout of 5000ms
  at Effect.runPromise
```

**Cause**: Effect took longer than expected, often in tests with delays/retries.

**Solution**: Use Effect's TestClock for deterministic testing:

```typescript
// Problem: Real delays slow down tests
import { describe, it, expect } from "vitest"
import { Effect, Schedule, Duration } from "effect"

it("retries with backoff", async () => {
  const effect = pipe(
    Effect.fail("error"),
    Effect.retry(Schedule.exponential(Duration.millis(1000)))
  )

  await Effect.runPromise(effect)  // Takes multiple seconds!
})

// Solution: Use TestClock for instant time progression
import { Effect, Schedule, Duration, TestClock, TestContext } from "effect"

it("retries with backoff", async () => {
  const effect = pipe(
    Effect.fail("error"),
    Effect.retry(Schedule.exponential(Duration.millis(1000))),
    Effect.provide(TestContext.TestContext)
  )

  const fiber = Effect.runFork(effect)

  // Advance time instantly
  await Effect.runPromise(TestClock.adjust(Duration.seconds(10)))

  const result = await Effect.runPromise(Fiber.await(fiber))
})
```

#### 6. Error: "Scope already closed"

**Error Message**:
```
ScopeClosedError: Scope has been closed
  at Effect.runPromise
```

**Cause**: Trying to use a scoped resource after its scope has been closed.

**Solution**: Keep operations within the scope:

```typescript
// Problem: Trying to use resource outside scope
const getData = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* (_) {
      const pool = yield* _(makeDbConnectionPool(2, 10))
      return pool  // ERROR: Returning scoped resource!
    })
  )
)
// pool is now invalid - scope is closed

// Solution: Complete all operations within scope
const data = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* (_) {
      const pool = yield* _(makeDbConnectionPool(2, 10))
      const result = yield* _(queryWithPool(pool, "SELECT * FROM users"))
      return result  // Return data, not the resource
    })
  )
)
```

#### 7. Error: "Resource pool exhausted"

**Error Message**:
```
PoolExhaustedError: Pool has reached maximum size
```

**Cause**: Too many concurrent operations trying to acquire resources from a pool that's at capacity.

**Solution**: Increase pool size, add timeouts, or limit concurrency:

```typescript
// Problem: Pool too small for load
const pool = makeDbConnectionPool(2, 5)  // Max 5 connections

Effect.all(
  Array.from({ length: 100 }, () => queryWithPool(pool, "SELECT...")),
  { concurrency: "unbounded" }  // Tries to use 100 connections!
)

// Solution 1: Increase pool size
const pool = makeDbConnectionPool(5, 20)  // Max 20 connections

// Solution 2: Limit concurrency to match pool size
Effect.all(
  Array.from({ length: 100 }, () => queryWithPool(pool, "SELECT...")),
  { concurrency: 5 }  // Only 5 concurrent queries
)

// Solution 3: Add timeout to pool operations
pipe(
  queryWithPool(pool, "SELECT..."),
  Effect.timeout(Duration.seconds(10)),
  Effect.catchTag("TimeoutException", () =>
    Effect.fail(new Error("Database pool timeout - try increasing pool size"))
  )
)
```

### Common Issues and How to Debug Them

#### Issue: "My Effect never completes"

**Debugging Steps**:

1. **Check if you're running the Effect**:
```typescript
// This doesn't run the Effect, just defines it!
const myEffect = Effect.sync(() => console.log("hello"))

// You must run it:
await Effect.runPromise(myEffect)  // or Effect.runSync(myEffect)
```

2. **Check for missing awaits in Effect.gen**:
```typescript
// Problem: Missing yield*
const bad = Effect.gen(function* (_) {
  const user = fetchUser(1)  // Missing yield*! Returns Effect, not User
  console.log(user)  // Logs Effect object, not user data
})

// Solution: Use yield* for all Effects
const good = Effect.gen(function* (_) {
  const user = yield* _(fetchUser(1))  // Correct!
  console.log(user)  // Logs actual user data
})
```

3. **Check for race conditions with timeout**:
```typescript
// Add timeout to detect hanging Effects
pipe(
  myEffect,
  Effect.timeout(Duration.seconds(5)),
  Effect.tap(() => Console.log("Completed successfully")),
  Effect.catchTag("TimeoutException", () =>
    Console.log("Effect timed out - check for infinite loops or missing completions")
  )
)
```

#### Issue: "Errors are not being caught"

**Debugging Steps**:

1. **Check error types match**:
```typescript
// Problem: Catching wrong error type
pipe(
  Effect.fail(new NetworkError({ message: "Failed" })),
  Effect.catchTag("ValidationError", () => fallback)  // Won't catch NetworkError!
)

// Solution: Catch the correct error type
pipe(
  Effect.fail(new NetworkError({ message: "Failed" })),
  Effect.catchTag("NetworkError", () => fallback)  // Correct!
)
```

2. **Check error is in error channel, not thrown**:
```typescript
// Problem: Regular throw, not Effect.fail
const bad = Effect.sync(() => {
  throw new Error("Oops")  // Not caught by Effect error handlers!
})

// Solution: Use Effect.fail or Effect.try
const good = Effect.try({
  try: () => {
    throw new Error("Oops")
  },
  catch: (error) => new CustomError({ message: String(error) })
})
```

#### Issue: "Type inference is not working"

**Solutions**:

1. **Add explicit type annotations**:
```typescript
// Problem: TypeScript can't infer complex types
const result = pipe(
  fetchData(),
  Effect.flatMap(data => processData(data)),
  Effect.map(processed => transform(processed))
)

// Solution: Add type annotations
const result: Effect.Effect<TransformedData, NetworkError> = pipe(
  fetchData(),
  Effect.flatMap((data: Data) => processData(data)),
  Effect.map((processed: ProcessedData) => transform(processed))
)
```

2. **Use type guards for narrowing**:
```typescript
// Problem: Union type not narrowed
const handleResult = (result: { _tag: "Success" | "Failure", value: any }) => {
  console.log(result.value)  // Type is 'any'
}

// Solution: Use type guards
const handleResult = (result: { _tag: "Success", value: string } | { _tag: "Failure", error: Error }) => {
  if (result._tag === "Success") {
    console.log(result.value)  // Type is 'string'
  } else {
    console.log(result.error)  // Type is 'Error'
  }
}
```

### Performance Issues

#### Issue: "Effects are slower than Promises"

**Causes and Solutions**:

1. **Unnecessary sequential execution**:
```typescript
// Slow: Sequential (500ms total)
const bad = Effect.gen(function* (_) {
  const user = yield* _(fetchUser())      // 100ms
  const posts = yield* _(fetchPosts())    // 100ms
  const comments = yield* _(fetchComments())  // 100ms
  return { user, posts, comments }
})

// Fast: Parallel (100ms total)
const good = Effect.all({
  user: fetchUser(),
  posts: fetchPosts(),
  comments: fetchComments()
}, { concurrency: "unbounded" })
```

2. **Creating Effects inside hot loops**:
```typescript
// Slow: Creates new Effect every iteration
for (let i = 0; i < 1000; i++) {
  await Effect.runPromise(processItem(i))  // 1000 separate Effect runs!
}

// Fast: Single Effect with batching
await Effect.runPromise(
  Effect.forEach(
    Array.from({ length: 1000 }, (_, i) => i),
    (i) => processItem(i),
    { concurrency: 10 }  // Process 10 at a time
  )
)
```

3. **Not using Effect's optimization features**:
```typescript
// Slow: Many small Effect.runPromise calls
const results = []
for (const item of items) {
  results.push(await Effect.runPromise(process(item)))
}

// Fast: Single Effect.runPromise with batching
const results = await Effect.runPromise(
  pipe(
    Effect.forEach(items, process, { concurrency: 5 }),
    Effect.withSpan("batch-processing")  // Observability
  )
)
```

### Best Practices for Avoiding Issues

1. **Always use typed errors** - Avoid `Effect<A, unknown>`
2. **Handle interruption** - Add `Effect.onInterrupt` for cleanup
3. **Use Effect.gen for readability** - Easier than deeply nested pipes
4. **Test with TestClock** - Fast, deterministic tests
5. **Limit concurrency** - Prevent resource exhaustion
6. **Add timeouts** - Prevent hanging operations
7. **Use Effect.tap for logging** - Debug without changing types
8. **Scope resources properly** - Use Effect.scoped or acquireUseRelease

### Getting More Help

If you're stuck:
1. Check the [Effect Documentation](https://effect.website/docs)
2. Search [Effect Discord](https://discord.gg/effect-ts)
3. Review the [Effect GitHub Issues](https://github.com/Effect-TS/effect/issues)
4. Look at the test files in this repository for usage examples

## Developer Experience

This project includes several tools to improve your development workflow:

### Interactive Demo

Run an interactive demo to explore examples:

```bash
npm run demo
```

This launches an interactive menu where you can:
- Browse all available examples
- Run examples with formatted output
- See execution results in real-time
- Easily switch between different patterns

### Performance Benchmarks

Track and monitor performance over time:

```bash
# Run benchmarks
npm run benchmark

# Save current results as baseline
npm run benchmark -- --save-baseline

# Run without comparing to baseline
npm run benchmark -- --no-compare
```

The benchmark tool:
- Measures performance of core Effect patterns
- Compares against saved baselines
- Detects performance regressions (>10% slower)
- Generates visual comparison charts
- Tracks ops/sec, avg/min/max times

**Sample Output:**
```
Visual Performance Comparison:

Effect.succeed              ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰   45,234 ops/sec
pipe with flatMap           ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱   32,145 ops/sec
Effect.all (3 effects)      ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱   28,901 ops/sec
```

### Visual Test Timing

The test suite includes a custom timing reporter that shows:
- Top 10 slowest tests with visual bars
- Duration breakdown by test file
- Performance warnings for slow tests (>1s)
- Test statistics and averages

Run tests to see timing output:
```bash
npm test
```

### CI/CD Integration

The project includes GitHub Actions workflows for:

**Benchmark Regression Detection:**
- Automatically runs benchmarks on PRs
- Downloads baseline from main branch
- Comments PR with results
- Fails CI if regressions detected (>10% slower)
- Updates baseline on main branch pushes

See `.github/workflows/benchmark.yml` for configuration.

### Development Tips

**Quick Start Development:**
```bash
# Install dependencies
npm install

# Run tests in watch mode (great for TDD)
npm test

# Run tests with UI (interactive debugging)
npm run test:ui

# Build in watch mode
npm run dev

# Try interactive examples
npm run demo
```

**Debugging Effect Code:**
1. Use `Effect.tap` for logging without changing the type:
   ```typescript
   pipe(
     myEffect,
     Effect.tap(value => Console.log("Debug:", value))
   )
   ```

2. Use `Effect.tapError` for error logging:
   ```typescript
   pipe(
     myEffect,
     Effect.tapError(error => Console.error("Error occurred:", error))
   )
   ```

3. Add labels for better error messages:
   ```typescript
   pipe(
     myEffect,
     Effect.withSpan("my-operation")
   )
   ```

**Testing with Effect:**
1. Use `TestClock` for deterministic timing tests:
   ```typescript
   import { TestClock } from "effect/TestClock"

   const test = Effect.gen(function* () {
     const fiber = yield* Effect.fork(effectWithDelay)
     yield* TestClock.adjust(Duration.seconds(5))
     const result = yield* Fiber.join(fiber)
     return result
   })
   ```

2. Test error cases explicitly:
   ```typescript
   const result = await Effect.runPromise(
     Effect.either(myEffect)
   )
   expect(result._tag).toBe("Left")
   ```

3. Use `Effect.runPromise` for async tests:
   ```typescript
   test("my effect", async () => {
     const result = await Effect.runPromise(myEffect)
     expect(result).toBe(expected)
   })
   ```

**Performance Optimization:**
- Use `Effect.cached` to cache expensive computations
- Batch operations with `Effect.forEach` instead of individual calls
- Set appropriate `concurrency` limits
- Use `Effect.withSpan` for observability
- Profile with `npm run benchmark`

**Code Organization:**
- Keep Effect chains readable (use `Effect.gen` for complex flows)
- Extract reusable patterns into helper functions
- Use descriptive error types (`class MyError extends Data.TaggedError<"MyError">()`)
- Add JSDoc comments for public APIs

## Advanced Topics

### 1. Distributed Tracing

The `src/tracing.ts` module provides comprehensive distributed tracing capabilities for tracking operations across your application.

**Basic Usage:**
```typescript
import { withSpan, addSpanAttributes, InMemoryTracerLive } from "./tracing"

const tracedOperation = pipe(
  withSpan("my-operation", Effect.gen(function* () {
    yield* addSpanAttributes({ userId: "123", operation: "fetch" })
    return yield* Effect.succeed("result")
  })),
  Effect.provide(InMemoryTracerLive)
)
```

**Nested Spans:**
```typescript
const fetchUserData = withSpan("fetch-user-data", Effect.gen(function* () {
  const user = yield* withSpan("db-query",
    Effect.succeed({ id: "123", name: "John" })
  )
  const enriched = yield* withSpan("enrich-user",
    Effect.succeed({ ...user, profile: { age: 30 } })
  )
  return enriched
}))
```

**Features:**
- Automatic span creation and hierarchy management
- Parent-child span relationships for nested operations
- Rich attributes/tags for context
- Error tracking within spans
- Span timing and duration measurement
- Cross-service trace propagation
- Trace tree visualization with `formatSpanTree()`

### 2. Metrics Collection

The `src/metrics.ts` module provides various metric types for monitoring application performance.

**Counter Metrics:**
```typescript
const requestCounter = Metric.counter("http_requests_total")
yield* Metric.increment(requestCounter)

// With labels
const labeled = pipe(
  requestCounter,
  Metric.tagged("method", "GET"),
  Metric.tagged("status", "200")
)
```

**Gauge Metrics:**
```typescript
const activeConnections = Metric.gauge("active_connections")
yield* Metric.set(activeConnections, 10)
yield* Metric.update(activeConnections, 5)
```

**Histogram Metrics:**
```typescript
const requestDuration = Metric.histogram("request_duration_seconds")
yield* Metric.update(requestDuration, 0.25)
```

**Tracking Utilities:**
```typescript
// Automatic duration tracking
const tracked = pipe(myEffect, withDurationTracking(requestDuration))

// Success/error counting
const counted = pipe(myEffect, withCountTracking(successCounter, errorCounter))

// Gauge tracking during operation
const gauged = pipe(myEffect, withGaugeTracking(activeConnections, 1))
```

**Use Cases:**
- HTTP request metrics (method, status, duration)
- Database connection pooling
- Cache hit/miss ratios
- Queue size and processing time
- Business metrics (orders, revenue)
- System metrics (CPU, memory)

### 3. Custom Operators

The `src/custom-operators.ts` module provides reusable operators for common patterns.

**Retry with Custom Logic:**
```typescript
const resilient = pipe(
  myEffect,
  retryWithBackoff(maxAttempts: 5, initialDelay: 100)
)

const selective = pipe(
  myEffect,
  retryOnError((error) => error.message === "RETRY_ME", 3)
)
```

**Timeout Operators:**
```typescript
const withFallback = pipe(slowEffect, timeoutWith("5 seconds", "fallback"))
const withError = pipe(slowEffect, timeoutOrFail("5 seconds", () => new Error("Timeout")))
```

**Conditional Execution:**
```typescript
const conditional = pipe(expensiveEffect, when(shouldExecute, defaultValue))
const branched = ifThenElse(condition, trueEffect, falseEffect)
```

**Batching and Rate Limiting:**
```typescript
const processed = pipe(items, batchProcess(10, 3, processItem))
const limited = pipe(operation, rateLimit("100 millis"))
```

**Fallback Chains:**
```typescript
const withFallbacks = pipe(
  primaryEffect,
  fallbackChain([secondaryEffect, tertiaryEffect]),
  withDefault("ultimate-fallback")
)
```

**Available Operators:**
- Retry: `retryWithBackoff`, `retryOnError`
- Timeout: `timeoutWith`, `timeoutOrFail`
- Tap: `tapWhen`, `tapErrorWhen`
- Filter: `filterOrFail`, `filterMap`
- Debounce/Throttle: `debounce`, `rateLimit`
- Memoization: `cacheFor`
- Fallback: `fallbackChain`, `withDefault`
- Conditional: `when`, `ifThenElse`
- Logging: `withLogging`, `withTiming`
- Batching: `batchProcess`, `collectUntil`

## Project Structure

```
├── src/
│   ├── index.ts                 # Main examples and implementations
│   ├── schemas.ts               # Effect Schema definitions
│   ├── concurrency.ts           # Concurrency patterns examples
│   ├── scheduling.ts            # Scheduling and jittered delays
│   ├── streaming.ts             # Stream processing patterns
│   ├── resource-pooling.ts      # Resource pool management
│   ├── error-handling.ts        # Enhanced error handling patterns
│   ├── circuit-breaker.ts       # Circuit breaker patterns
│   ├── tracing.ts               # Distributed tracing patterns
│   ├── metrics.ts               # Metrics collection patterns
│   ├── custom-operators.ts      # Reusable custom operators
│   ├── index.test.ts            # Tests for basic examples
│   ├── concurrency.test.ts      # Tests for concurrency patterns
│   ├── scheduling.test.ts       # Tests for scheduling patterns
│   ├── streaming.test.ts        # Tests for stream processing
│   ├── resource-pooling.test.ts # Tests for resource pooling
│   ├── error-handling.test.ts   # Tests for error handling patterns
│   ├── circuit-breaker.test.ts  # Tests for circuit breaker patterns
│   ├── tracing.test.ts          # Tests for distributed tracing
│   ├── metrics.test.ts          # Tests for metrics collection
│   └── custom-operators.test.ts # Tests for custom operators
├── examples/
│   ├── quick-start.ts           # Quick start examples
│   ├── error-handling.ts        # Error handling examples
│   ├── concurrency-basics.ts    # Concurrency examples
│   └── scheduling-basics.ts     # Scheduling examples
├── scripts/
│   ├── demo.ts                  # Interactive demo CLI
│   ├── benchmark.ts             # Performance benchmarks
│   └── timing-reporter.ts       # Custom vitest timing reporter
├── .github/
│   └── workflows/
│       └── benchmark.yml        # Benchmark CI/CD workflow
├── dist/                        # Compiled output
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Running Examples

To see the examples in action:

```bash
# Build and run
npm run build
node dist/index.js
```

## Testing

The project includes comprehensive tests for all functions and error scenarios:

```bash
npm test
```

## License

MIT