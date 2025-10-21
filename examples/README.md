# Effect Examples - Getting Started

This directory contains beginner-friendly examples to help you learn the Effect library. Each example focuses on a specific aspect of Effect and includes extensive comments and documentation.

## Setup

Before running the examples, make sure you have installed the dependencies:

```bash
npm install
```

## Running Examples

You can run any example using the `npm run example` command:

```bash
# Quick start - basic Effect patterns
npm run example examples/quick-start.ts

# Error handling - typed errors
npm run example examples/error-handling.ts

# Concurrency - parallel and race patterns
npm run example examples/concurrency-basics.ts

# Scheduling - retry and backoff patterns
npm run example examples/scheduling-basics.ts
```

## Examples Overview

### 1. Quick Start (`quick-start.ts`)

**What you'll learn:**
- Creating basic effects with `Effect.succeed`, `Effect.fail`, and `Effect.sync`
- Transforming values with `Effect.map`
- Chaining effects with `Effect.flatMap`
- Using generator syntax (`Effect.gen`) for cleaner code
- Combining multiple effects with `Effect.all`
- Basic error handling with `Effect.catchAll`
- Practical example: User registration flow

**Key concepts:**
- Effects are lazy - they only execute when you run them
- Generator syntax is the recommended approach
- `yield*` unwraps Effect values (similar to `await` for Promises)
- `pipe()` enables functional composition

**Expected output:**
You'll see examples of successful operations, value transformations, and a complete user registration flow with validation.

---

### 2. Error Handling (`error-handling.ts`)

**What you'll learn:**
- Defining typed error classes with `Data.TaggedError`
- Creating effects that can fail with specific error types
- Handling all errors uniformly with `Effect.catchAll`
- Handling specific error types with `Effect.catchTag` and `Effect.catchTags`
- Transforming errors with `Effect.mapError`
- Composing effects with different error types
- Distinguishing between defects (bugs) and expected errors
- Logging errors with `Effect.tapError`
- Conditional retry based on error type

**Key concepts:**
- Typed errors provide compile-time safety
- Use `Data.TaggedError` for discriminated unions
- `catchTags` enables exhaustive error handling
- `Effect.die` for programming errors, `Effect.fail` for expected errors
- `tapError` logs without changing the error

**Expected output:**
You'll see different error types being handled differently, error transformation, and recovery strategies in action.

---

### 3. Concurrency Basics (`concurrency-basics.ts`)

**What you'll learn:**
- Running effects sequentially vs in parallel
- Racing effects with `Effect.race` (first to complete wins)
- Controlling concurrency with limits
- Working with fibers (lightweight threads)
- Interrupting and cancelling operations
- Uninterruptible regions for critical sections
- Practical patterns for parallel data processing

**Key concepts:**
- Parallel execution is faster for independent operations
- `Effect.all` with `concurrency: "unbounded"` for full parallelism
- `Effect.all` with `concurrency: N` to limit concurrent operations
- `Effect.race` for "first wins" scenarios (timeouts, fallbacks)
- `Effect.fork` / `Fiber.join` for background processing
- Interruption allows cancelling long-running tasks

**Expected output:**
You'll see timing differences between sequential and parallel execution, race conditions, and fiber management in action.

**When to use:**
- **Sequential** (`concurrency: 1`): Order matters, state dependencies
- **Parallel** (`unbounded`): Independent operations, maximize speed
- **Limited** (`concurrency: N`): Rate limiting, resource constraints
- **Race**: Timeouts, fastest source, fallback strategies
- **Fibers**: Long-running background tasks

---

### 4. Scheduling Basics (`scheduling-basics.ts`)

**What you'll learn:**
- Basic retry patterns with `Effect.retry`
- Exponential backoff strategies
- Adding jitter to avoid thundering herd problem
- Alternative backoff strategies (linear, fibonacci)
- Scheduled recurring tasks with `Effect.repeat`
- Time-based scheduling with elapsed time limits
- Conditional retry (only retry on specific errors)
- Practical examples: database connections, API calls, health checks

**Key concepts:**
- `Effect.retry` adds retry logic to any effect
- Schedules define timing and count of retries
- Exponential backoff with jitter is best for most cases
- `Schedule.compose` combines retry count and timing
- `Schedule.tapOutput` logs retry attempts
- Conditional retry filters which errors to retry

**Expected output:**
You'll see retry attempts with various backoff strategies, timing information for each retry, and practical scenarios like database connection retries.

**When to use:**
- **Exponential backoff**: Network calls, API requests, database connections
- **Jitter**: Multiple clients accessing the same resource
- **Linear**: Predictable retry intervals needed
- **Fixed**: Simple scenarios with known recovery time
- **Time limits**: Prevent indefinite retries
- **Conditional**: Different handling for different error types

---

## Learning Path

We recommend following this order:

1. **Start with `quick-start.ts`** - Learn the fundamentals
2. **Move to `error-handling.ts`** - Understand typed error handling
3. **Try `concurrency-basics.ts`** - Learn parallel processing
4. **Finish with `scheduling-basics.ts`** - Master retry patterns

## Common Patterns

### Running an Effect

```typescript
// Run and get a Promise
const result = await Effect.runPromise(myEffect)

// Run with callback
Effect.runCallback(myEffect, (exit) => {
  if (Exit.isSuccess(exit)) {
    console.log(exit.value)
  }
})
```

### Generator Syntax (Recommended)

```typescript
const program = Effect.gen(function* () {
  const x = yield* Effect.succeed(10)
  const y = yield* Effect.succeed(20)
  return x + y
})
```

### Error Handling

```typescript
const safe = pipe(
  riskyOperation,
  Effect.catchTag("NetworkError", (error) =>
    Effect.succeed(fallbackValue)
  )
)
```

### Parallel Processing

```typescript
const results = yield* Effect.all(
  [task1, task2, task3],
  { concurrency: "unbounded" }
)
```

### Retry with Backoff

```typescript
const robust = pipe(
  flakyOperation,
  Effect.retry(
    Schedule.jittered(Schedule.exponential(Duration.millis(100)))
  )
)
```

## Next Steps

After completing these examples:

1. Check out the main source code in `src/` for more advanced patterns
2. Read the tests in `src/*.test.ts` to see how patterns are tested
3. Explore the [Effect documentation](https://effect.website/docs/introduction)
4. Try building your own examples combining multiple patterns

## Troubleshooting

**Q: I get TypeScript errors when running examples**
- Make sure you have run `npm install` first
- Check that you're using TypeScript 5.0 or higher

**Q: The examples take a long time to run**
- Some examples include delays to demonstrate timing
- This is normal and helps visualize concurrency and scheduling

**Q: Randomized examples produce different output**
- Examples using `Random.next` or `flakyOperation` are intentionally random
- Run them multiple times to see different behaviors
- This demonstrates how retry and error handling work in practice

## Additional Resources

- [Effect Documentation](https://effect.website/docs)
- [Effect GitHub Repository](https://github.com/Effect-TS/effect)
- [Effect Discord Community](https://discord.gg/effect-ts)

---

Happy learning! If you have questions or find issues, please open an issue in the repository.
