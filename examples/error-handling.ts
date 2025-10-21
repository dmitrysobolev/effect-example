/**
 * Error Handling - Typed Errors with Effect
 *
 * This example demonstrates:
 * - Creating typed error classes
 * - Using discriminated unions for error handling
 * - Error recovery strategies
 * - Error transformation and context enrichment
 * - Combining error handling patterns
 */

import { Effect, Console, pipe, Data } from "effect"

// ============================================================================
// 1. Defining Typed Errors
// ============================================================================

/**
 * Typed errors using classes with _tag discriminator
 * This enables exhaustive error handling with TypeScript
 */
export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly message: string
  readonly statusCode?: number
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string
  readonly field?: string
}> {}

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly message: string
  readonly query?: string
}> {}

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly message: string
  readonly resourceId: string | number
}> {}

// ============================================================================
// 2. Creating Effects That Can Fail
// ============================================================================

/**
 * Simulates fetching a user from an API
 */
const fetchUserFromApi = (userId: number): Effect.Effect<
  { id: number; name: string; email: string },
  NetworkError | NotFoundError
> =>
  Effect.gen(function* () {
    yield* Console.log(`Fetching user ${userId} from API...`)

    // Simulate different error conditions
    if (userId === 0) {
      return yield* new NetworkError({
        message: "Network connection failed",
        statusCode: 503
      })
    }

    if (userId < 0) {
      return yield* new NotFoundError({
        message: "User not found",
        resourceId: userId
      })
    }

    return {
      id: userId,
      name: `User ${userId}`,
      email: `user${userId}@example.com`
    }
  })

/**
 * Validates user data
 */
const validateUser = (user: { id: number; name: string; email: string }): Effect.Effect<
  { id: number; name: string; email: string },
  ValidationError
> =>
  Effect.gen(function* () {
    if (!user.name || user.name.length < 2) {
      return yield* new ValidationError({
        message: "Name must be at least 2 characters",
        field: "name"
      })
    }

    if (!user.email || !user.email.includes("@")) {
      return yield* new ValidationError({
        message: "Invalid email format",
        field: "email"
      })
    }

    return user
  })

// ============================================================================
// 3. Error Recovery with catchAll and catchTag
// ============================================================================

/**
 * Handle all errors uniformly
 */
const handleAllErrors = (userId: number) => pipe(
  fetchUserFromApi(userId),
  Effect.catchAll(error => {
    // Handle any error type
    console.log(`Error occurred: ${error._tag} - ${error.message}`)
    return Effect.succeed({ id: 0, name: "Guest", email: "guest@example.com" })
  })
)

/**
 * Handle specific error types differently
 */
const handleSpecificErrors = (userId: number) => pipe(
  fetchUserFromApi(userId),
  Effect.catchTags({
    NetworkError: (error) =>
      Effect.gen(function* () {
        yield* Console.log(
          `Network error (${error.statusCode}): ${error.message}. Using cached data.`
        )
        return { id: userId, name: "Cached User", email: "cached@example.com" }
      }),
    NotFoundError: (error) =>
      Effect.gen(function* () {
        yield* Console.log(`User ${error.resourceId} not found. Creating new user.`)
        return { id: userId, name: "New User", email: "newuser@example.com" }
      })
  })
)

/**
 * Handle one specific error, let others propagate
 */
const handleNetworkErrorOnly = (userId: number) => pipe(
  fetchUserFromApi(userId),
  Effect.catchTag("NetworkError", (error) =>
    Effect.gen(function* () {
      yield* Console.log(`Handling network error: ${error.message}`)
      return { id: userId, name: "Fallback User", email: "fallback@example.com" }
    })
  )
  // NotFoundError will still propagate
)

// ============================================================================
// 4. Error Transformation
// ============================================================================

/**
 * Transform one error type into another
 */
const transformNetworkError = (userId: number) => pipe(
  fetchUserFromApi(userId),
  Effect.mapError(error => {
    if (error._tag === "NetworkError") {
      return new DatabaseError({
        message: `Database unavailable due to: ${error.message}`,
        query: `SELECT * FROM users WHERE id = ${userId}`
      })
    }
    return error
  })
)

/**
 * Add context to errors
 */
const enrichErrorContext = (userId: number) => pipe(
  fetchUserFromApi(userId),
  Effect.mapError(error => {
    // Add timestamp and additional context
    return {
      ...error,
      timestamp: new Date().toISOString(),
      context: { userId, operation: "fetchUser" }
    }
  })
)

// ============================================================================
// 5. Error Composition
// ============================================================================

/**
 * Compose multiple operations that can fail with different error types
 */
const fetchAndValidateUser = (userId: number): Effect.Effect<
  { id: number; name: string; email: string },
  NetworkError | NotFoundError | ValidationError
> =>
  Effect.gen(function* () {
    const user = yield* fetchUserFromApi(userId)
    const validUser = yield* validateUser(user)
    return validUser
  })

/**
 * Handle composed errors
 */
const processUserSafely = (userId: number) => pipe(
  fetchAndValidateUser(userId),
  Effect.catchTags({
    NetworkError: (error) =>
      Effect.gen(function* () {
        yield* Console.log(`Network issue: ${error.message}`)
        return Effect.succeed({ status: "error", type: "network" })
      }),
    ValidationError: (error) =>
      Effect.gen(function* () {
        yield* Console.log(`Validation failed on ${error.field}: ${error.message}`)
        return Effect.succeed({ status: "error", type: "validation" })
      }),
    NotFoundError: (error) =>
      Effect.gen(function* () {
        yield* Console.log(`Resource not found: ${error.resourceId}`)
        return Effect.succeed({ status: "error", type: "not-found" })
      })
  })
)

// ============================================================================
// 6. Defect vs Expected Errors
// ============================================================================

/**
 * Defects are unexpected errors (bugs) that shouldn't be caught
 * Use Effect.die for programming errors
 */
const divideNumbers = (a: number, b: number): Effect.Effect<number, never> => {
  if (b === 0) {
    // This is a programming error - use die
    return Effect.die(new Error("Division by zero - this is a bug!"))
  }
  return Effect.succeed(a / b)
}

/**
 * Expected errors should use Effect.fail
 */
const parseAge = (input: string): Effect.Effect<number, ValidationError> => {
  const age = parseInt(input, 10)

  if (isNaN(age)) {
    return new ValidationError({
      message: "Age must be a valid number",
      field: "age"
    })
  }

  if (age < 0 || age > 150) {
    return new ValidationError({
      message: "Age must be between 0 and 150",
      field: "age"
    })
  }

  return Effect.succeed(age)
}

// ============================================================================
// 7. Error Logging and Debugging
// ============================================================================

/**
 * Use Effect.tapError to log errors without handling them
 */
const fetchUserWithLogging = (userId: number) => pipe(
  fetchUserFromApi(userId),
  Effect.tapError(error =>
    Console.log(`[ERROR] ${error._tag}: ${error.message}`)
  )
)

/**
 * Use Effect.tapErrorCause for detailed error information
 */
const fetchUserWithDetailedLogging = (userId: number) => pipe(
  fetchUserFromApi(userId),
  Effect.tapErrorCause(cause =>
    Console.log(`[ERROR CAUSE] ${cause}`)
  )
)

// ============================================================================
// 8. Retry with Error-Specific Logic
// ============================================================================

/**
 * Retry only on specific error types
 */
const retryOnNetworkError = (userId: number) => pipe(
  fetchUserFromApi(userId),
  Effect.retry({
    while: (error) => error._tag === "NetworkError", // Only retry network errors
    times: 3
  }),
  Effect.tap(() => Console.log("Successfully fetched after retries")),
  Effect.catchAll(error =>
    Effect.gen(function* () {
      yield* Console.log(`Failed after retries: ${error._tag}`)
      return { id: 0, name: "Fallback", email: "fallback@example.com" }
    })
  )
)

// ============================================================================
// Main Example Runner
// ============================================================================

async function main() {
  console.log("=== Typed Error Handling Examples ===\n")

  console.log("1. Successful fetch:")
  const result1 = await Effect.runPromise(fetchUserFromApi(1))
  console.log(result1)
  console.log()

  console.log("2. Handle all errors (network error):")
  const result2 = await Effect.runPromise(handleAllErrors(0))
  console.log(result2)
  console.log()

  console.log("3. Handle specific errors (not found):")
  const result3 = await Effect.runPromise(handleSpecificErrors(-1))
  console.log(result3)
  console.log()

  console.log("4. Handle specific errors (network error):")
  const result4 = await Effect.runPromise(handleSpecificErrors(0))
  console.log(result4)
  console.log()

  console.log("5. Fetch and validate user (success):")
  const result5 = await Effect.runPromise(fetchAndValidateUser(5))
  console.log(result5)
  console.log()

  console.log("6. Process user safely (network error):")
  const result6 = await Effect.runPromise(processUserSafely(0))
  console.log(result6)
  console.log()

  console.log("7. Parse age (valid):")
  const result7 = await Effect.runPromise(parseAge("25"))
  console.log("Parsed age:", result7)
  console.log()

  console.log("8. Parse age (invalid):")
  try {
    await Effect.runPromise(parseAge("invalid"))
  } catch (error: any) {
    console.log("Validation error:", error.message)
  }
  console.log()

  console.log("9. Fetch user with logging (error case):")
  try {
    await Effect.runPromise(fetchUserWithLogging(-1))
  } catch (error: any) {
    console.log("Final error:", error._tag)
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
 * This example demonstrates:
 * - Defining typed errors with TaggedError for type-safe error handling
 * - Using catchAll for uniform error handling
 * - Using catchTag/catchTags for discriminated error handling
 * - Transforming errors with mapError
 * - Composing effects with different error types
 * - Distinguishing between defects (bugs) and expected errors
 * - Logging errors with tapError
 * - Conditional retry based on error type
 *
 * Key Takeaways:
 * - Typed errors provide compile-time safety and better tooling
 * - Use Data.TaggedError for discriminated unions
 * - catchTags enables exhaustive error handling
 * - mapError transforms error types
 * - tapError logs without changing the error channel
 * - Effect.die for programming errors, Effect.fail for expected errors
 */
