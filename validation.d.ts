export interface ValidationError {
  /** Dotted path to the offending value, e.g. `@example/request.host`. */
  path: string
  /** The value that failed validation. */
  value: unknown
  /** Human-readable reason. */
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/**
 * A schema-bound validator whose `fqn` is constrained to the generated
 * `SchemaTypes` keys, and whose `is`/`assert` narrow `value` to the matching
 * generated type. `M` is the generated `SchemaTypes` interface.
 */
export interface TypedValidator<M> {
  /** Rich result; `fqn` is constrained to known types but `value` is not narrowed. */
  validate<K extends keyof M>(fqn: K, value: unknown): ValidationResult
  /** Boolean type guard that narrows `value` to `M[K]`. */
  is<K extends keyof M>(fqn: K, value: unknown): value is M[K]
  /** Assertion that narrows `value` to `M[K]` or throws. */
  assert<K extends keyof M>(fqn: K, value: unknown): asserts value is M[K]
}

/**
 * Validates plain objects against a Hyperschema type before they are passed to
 * compact-encoding. Rejects everything compact-encoding would throw on or
 * silently corrupt (out-of-range numbers, malformed IPs, wrong buffer sizes, …).
 */
export default class HyperschemaValidation {
  /** Validate `value` against the type `fqn` registered on `schema`. */
  static validate(schema: any, fqn: string, value: unknown): ValidationResult

  /** Boolean check that `value` is a valid `fqn`. */
  static is(schema: any, fqn: string, value: unknown): boolean

  /** Validate and throw an aggregated error if `value` is invalid. */
  static assert(schema: any, fqn: string, value: unknown): void

  /**
   * Bind a schema and return a validator typed against the generated `SchemaTypes`.
   *
   * ```ts
   * import HyperschemaValidation from 'hyperschema-ts/validation'
   * import type { SchemaTypes } from './schema/types'
   *
   * const v = HyperschemaValidation.createValidator<SchemaTypes>(schema)
   * if (v.is('@example/request', value)) value.id // value: ExampleRequest
   * ```
   */
  static createValidator<M = Record<string, unknown>>(schema: any): TypedValidator<M>
}
