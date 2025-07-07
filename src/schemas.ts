import { Schema } from "effect"

export const UserSchema = Schema.Struct({
  id: Schema.Number.pipe(
    Schema.positive(),
    Schema.int(),
    Schema.annotations({
      title: "User ID",
      description: "A positive integer representing the user's unique identifier"
    })
  ),
  name: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(100),
    Schema.annotations({
      title: "User Name",
      description: "The user's full name"
    })
  ),
  email: Schema.String.pipe(
    Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
    Schema.annotations({
      title: "Email Address",
      description: "A valid email address",
      examples: ["user@example.com"]
    })
  )
})

export type User = Schema.Schema.Type<typeof UserSchema>

export const parseUser = Schema.decode(UserSchema)
export const parseUserSync = Schema.decodeSync(UserSchema)
export const validateUser = Schema.validate(UserSchema)
export const validateUserSync = Schema.validateSync(UserSchema)
export const isUser = Schema.is(UserSchema)