/**
 * Quick Start - Basic Effect Patterns
 *
 * This example demonstrates the fundamental building blocks of Effect:
 * - Creating and running effects
 * - Chaining operations with pipe and flatMap
 * - Using generator syntax for cleaner code
 * - Combining multiple effects
 */

import { Effect, Console, pipe } from "effect"

// ============================================================================
// 1. Creating Simple Effects
// ============================================================================

/**
 * Effect.succeed creates an effect that always succeeds
 */
const simpleSuccess = Effect.succeed(42)

/**
 * Effect.fail creates an effect that always fails
 */
const simpleFailure = Effect.fail(new Error("Something went wrong"))

/**
 * Effect.sync wraps a synchronous side effect
 */
const syncEffect = Effect.sync(() => {
  console.log("Performing side effect...")
  return "Sync result"
})

/**
 * Effect.promise wraps a Promise
 */
const promiseEffect = Effect.promise(() =>
  Promise.resolve("Promise result")
)

// ============================================================================
// 2. Chaining Effects with pipe
// ============================================================================

/**
 * Use pipe and Effect.map to transform values
 */
const doubleNumber = (n: number) => pipe(
  Effect.succeed(n),
  Effect.map(x => x * 2),
  Effect.tap(result => Console.log(`Doubled: ${result}`))
)

/**
 * Use Effect.flatMap to chain effects that depend on previous results
 */
const fetchAndProcess = pipe(
  Effect.succeed({ id: 1, value: 100 }),
  Effect.flatMap(data =>
    Effect.succeed(data.value * 2)
  ),
  Effect.tap(result => Console.log(`Processed: ${result}`))
)

// ============================================================================
// 3. Generator Syntax (Recommended)
// ============================================================================

/**
 * Generator syntax provides a cleaner way to work with multiple effects
 * The yield* syntax unwraps Effect values, similar to async/await
 */
const generatorExample = Effect.gen(function* () {
  // Yield effects to unwrap their values
  const x = yield* Effect.succeed(10)
  const y = yield* Effect.succeed(20)

  // Use Console.log for logging within effects
  yield* Console.log(`x = ${x}, y = ${y}`)

  // Return the final result
  return x + y
})

/**
 * More complex generator example with multiple steps
 */
const multiStepProcess = Effect.gen(function* () {
  yield* Console.log("Step 1: Starting process...")

  const data = yield* Effect.succeed({ name: "Alice", score: 85 })
  yield* Console.log(`Step 2: Got data for ${data.name}`)

  const processed = yield* Effect.succeed(data.score * 1.1)
  yield* Console.log(`Step 3: Processed score: ${processed}`)

  return { ...data, finalScore: processed }
})

// ============================================================================
// 4. Combining Multiple Effects
// ============================================================================

/**
 * Effect.all runs multiple effects and collects results
 */
const combineEffects = pipe(
  Effect.all([
    Effect.succeed(1),
    Effect.succeed(2),
    Effect.succeed(3),
  ]),
  Effect.map(numbers => numbers.reduce((a, b) => a + b, 0)),
  Effect.tap(sum => Console.log(`Sum: ${sum}`))
)

/**
 * Effect.all with object structure
 */
const combineEffectsAsObject = pipe(
  Effect.all({
    user: Effect.succeed({ id: 1, name: "Bob" }),
    posts: Effect.succeed([1, 2, 3]),
    settings: Effect.succeed({ theme: "dark" }),
  }),
  Effect.tap(result =>
    Console.log(`User ${result.user.name} has ${result.posts.length} posts`)
  )
)

// ============================================================================
// 5. Error Handling Basics
// ============================================================================

/**
 * Use Effect.catchAll to handle errors
 */
const withErrorHandling = pipe(
  Effect.fail(new Error("Something failed")),
  Effect.catchAll(error => {
    console.log(`Caught error: ${error.message}`)
    return Effect.succeed("Default value")
  })
)

/**
 * Use Effect.catchTag for discriminated error handling (shown in error-handling.ts)
 */

// ============================================================================
// 6. Practical Example: User Registration
// ============================================================================

interface User {
  id: number
  name: string
  email: string
}

/**
 * Simulates validating user input
 */
const validateInput = (name: string, email: string) =>
  Effect.gen(function* () {
    yield* Console.log("Validating input...")

    if (!name || name.length < 2) {
      return yield* Effect.fail(new Error("Name must be at least 2 characters"))
    }

    if (!email || !email.includes("@")) {
      return yield* Effect.fail(new Error("Invalid email format"))
    }

    return { name, email }
  })

/**
 * Simulates saving user to database
 */
const saveUser = (data: { name: string; email: string }) =>
  Effect.gen(function* () {
    yield* Console.log(`Saving user: ${data.name}`)

    // Simulate database save
    const user: User = {
      id: Math.floor(Math.random() * 1000),
      ...data
    }

    return user
  })

/**
 * Complete user registration flow
 */
const registerUser = (name: string, email: string) =>
  Effect.gen(function* () {
    yield* Console.log("Starting user registration...")

    const validData = yield* validateInput(name, email)
    const user = yield* saveUser(validData)

    yield* Console.log(`User registered successfully: ${user.id}`)

    return user
  })

// ============================================================================
// Main Example Runner
// ============================================================================

async function main() {
  console.log("=== Effect Quick Start Examples ===\n")

  console.log("1. Simple success:")
  console.log(await Effect.runPromise(simpleSuccess))
  console.log()

  console.log("2. Sync effect:")
  console.log(await Effect.runPromise(syncEffect))
  console.log()

  console.log("3. Double number:")
  await Effect.runPromise(doubleNumber(21))
  console.log()

  console.log("4. Fetch and process:")
  await Effect.runPromise(fetchAndProcess)
  console.log()

  console.log("5. Generator example:")
  console.log(await Effect.runPromise(generatorExample))
  console.log()

  console.log("6. Multi-step process:")
  const result = await Effect.runPromise(multiStepProcess)
  console.log("Final result:", result)
  console.log()

  console.log("7. Combine effects (array):")
  console.log(await Effect.runPromise(combineEffects))
  console.log()

  console.log("8. Combine effects (object):")
  await Effect.runPromise(combineEffectsAsObject)
  console.log()

  console.log("9. Error handling:")
  console.log(await Effect.runPromise(withErrorHandling))
  console.log()

  console.log("10. User registration (success):")
  const user1 = await Effect.runPromise(registerUser("Alice", "alice@example.com"))
  console.log("Registered:", user1)
  console.log()

  console.log("11. User registration (validation failure):")
  try {
    await Effect.runPromise(registerUser("A", "invalid-email"))
  } catch (error) {
    console.log("Registration failed:", (error as Error).message)
  }
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
 * The examples above demonstrate:
 * - Creating basic effects with succeed/fail/sync
 * - Transforming values with map
 * - Chaining dependent operations with flatMap
 * - Using generator syntax for cleaner code
 * - Combining multiple effects with Effect.all
 * - Basic error handling
 * - A practical user registration example
 *
 * Key Takeaways:
 * - Effects are lazy - they only run when you call Effect.runPromise()
 * - Generator syntax (Effect.gen) is the recommended way to write Effect code
 * - Use yield* to unwrap Effect values
 * - pipe() is useful for composing transformations
 * - Effect.all() combines multiple effects into one
 */
