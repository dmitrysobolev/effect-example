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
│   ├── index.test.ts            # Tests for basic examples
│   ├── concurrency.test.ts      # Tests for concurrency patterns
│   ├── scheduling.test.ts       # Tests for scheduling patterns
│   ├── streaming.test.ts        # Tests for stream processing
│   ├── resource-pooling.test.ts # Tests for resource pooling
│   ├── error-handling.test.ts   # Tests for error handling patterns
│   └── circuit-breaker.test.ts  # Tests for circuit breaker patterns
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