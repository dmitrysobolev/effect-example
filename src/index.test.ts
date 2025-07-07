import { describe, it, expect } from 'vitest'
import { Effect, pipe } from 'effect'

// Import the functions and classes from index.ts
import { 
  NetworkError, 
  ValidationError, 
  fetchUser, 
  validateUser, 
  processUser, 
  safeProcessUser 
} from './index'

describe('Effect Examples Tests', () => {
  describe('fetchUser', () => {
    it('should return a user for valid ID', async () => {
      const result = await Effect.runPromise(fetchUser(1))
      expect(result).toEqual({
        id: 1,
        name: 'User 1',
        email: 'user1@example.com'
      })
    })

    it('should fail with NetworkError for invalid ID', async () => {
      try {
        await Effect.runPromise(fetchUser(-1))
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        const cause = JSON.parse(error.message)
        expect(cause._tag).toBe('NetworkError')
        expect(cause.message).toBe('Invalid user ID')
      }
    })
  })

  describe('validateUser', () => {
    it('should validate user with valid email', async () => {
      const user = { id: 1, name: 'Test', email: 'test@example.com' }
      const result = await Effect.runPromise(validateUser(user))
      expect(result).toEqual(user)
    })

    it('should fail with ValidationError for invalid email', async () => {
      const user = { id: 1, name: 'Test', email: 'invalid-email' }
      try {
        await Effect.runPromise(validateUser(user))
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        const cause = JSON.parse(error.message)
        expect(cause._tag).toBe('ValidationError')
        expect(cause.message).toBe('Invalid email format')
      }
    })
  })

  describe('processUser', () => {
    it('should process valid user successfully', async () => {
      const result = await Effect.runPromise(processUser(1))
      expect(result).toEqual({
        id: 1,
        name: 'User 1',
        email: 'user1@example.com'
      })
    })

    it('should fail on network error', async () => {
      try {
        await Effect.runPromise(processUser(-1))
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        const cause = JSON.parse(error.message)
        expect(cause._tag).toBe('NetworkError')
      }
    })
  })

  describe('safeProcessUser', () => {
    it('should always succeed with valid user', async () => {
      const result = await Effect.runPromise(safeProcessUser(1))
      expect(result).toEqual({
        id: 1,
        name: 'User 1',
        email: 'user1@example.com'
      })
    })

    it('should return error object on network error', async () => {
      const result = await Effect.runPromise(safeProcessUser(-1))
      expect(result).toEqual({ error: 'Network issue occurred' })
    })

    it('should return error object on validation error', async () => {
      // Create a custom fetchUser that returns invalid email
      const customFetchUser = (id: number) => 
        Effect.succeed({ id, name: `User ${id}`, email: 'no-at-sign' })
      
      const customProcessUser = (id: number) => pipe(
        customFetchUser(id),
        Effect.flatMap(validateUser)
      )

      const customSafeProcessUser = (id: number) => pipe(
        customProcessUser(id),
        Effect.catchAll(error => {
          switch (error._tag) {
            case "NetworkError":
              return Effect.succeed({ error: "Network issue occurred" })
            case "ValidationError":
              return Effect.succeed({ error: "Validation failed" })
          }
        })
      )

      const result = await Effect.runPromise(customSafeProcessUser(1))
      expect(result).toEqual({ error: 'Validation failed' })
    })
  })

  describe('Effect combinators', () => {
    it('should combine multiple effects with Effect.all', async () => {
      const effects = [
        Effect.succeed(10),
        Effect.succeed(20),
        Effect.succeed(30)
      ]
      const result = await Effect.runPromise(Effect.all(effects))
      expect(result).toEqual([10, 20, 30])
    })

    it('should map over effect values', async () => {
      const result = await Effect.runPromise(
        pipe(
          Effect.succeed(5),
          Effect.map(n => n * 2)
        )
      )
      expect(result).toBe(10)
    })
  })
})