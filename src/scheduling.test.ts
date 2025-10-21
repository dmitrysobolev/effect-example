import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import {
  retryWithLogging,
  flakyApiCall,
  repeatWithJitter,
  retryWithFullJitter,
} from "./scheduling"

describe("Scheduling and Jittered Delays", () => {
  describe("Retry with Jitter", () => {
    it("should eventually succeed with flaky operation", async () => {
      // Low failure rate to ensure eventual success within retries
      const result = await Effect.runPromise(
        retryWithLogging(flakyApiCall("TestAPI", 0.2), "TestAPI", 10)
      )

      expect(result).toBe("TestAPI result")
    }, 15000)

    it("should retry failing operation and eventually succeed", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 3) {
          return Effect.fail(new Error("Retry me"))
        }
        return Effect.succeed("success")
      })

      const result = await Effect.runPromise(
        retryWithFullJitter(effect, 5)
      )

      expect(result).toBe("success")
      expect(attempts).toBe(3)
    })
  })

  describe("Recurring Tasks", () => {
    it("should repeat task multiple times", async () => {
      let executions = 0
      const task = Effect.sync(() => {
        executions++
        return executions
      })

      await Effect.runPromise(repeatWithJitter(task, 3))

      // Effect.repeat executes once initially, then repeats (times - 1) more
      expect(executions).toBe(3)
    })
  })

  describe("Jitter Benefits", () => {
    it("should demonstrate retry with exponential backoff", async () => {
      let attempts = 0
      const effect = Effect.suspend(() => {
        attempts++
        if (attempts < 4) {
          return Effect.fail(new Error("Retry"))
        }
        return Effect.succeed("done")
      })

      const result = await Effect.runPromise(
        retryWithFullJitter(effect, 10)
      )

      expect(result).toBe("done")
      expect(attempts).toBe(4)
    })
  })
})
