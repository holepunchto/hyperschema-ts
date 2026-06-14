const { validate } = require('./lib/validate.js')

class HyperschemaValidation {
  // Validate `value` against the type `fqn` registered on a Hyperschema instance.
  // Returns { valid: boolean, errors: Array<{ path, value, message }> }.
  static validate(schema, fqn, value) {
    return validate(schema, fqn, value)
  }

  // Boolean type guard: narrows `value` to the matching type when used through
  // a typed validator (see createValidator).
  static is(schema, fqn, value) {
    return validate(schema, fqn, value).valid
  }

  // Validate and throw an aggregated error if `value` is invalid.
  static assert(schema, fqn, value) {
    const { valid, errors } = validate(schema, fqn, value)
    if (!valid) {
      const summary = errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')
      throw new Error(`Invalid ${fqn}:\n${summary}`)
    }
  }

  // Bind a schema and return a validator whose `fqn` argument is constrained to
  // the generated `SchemaTypes` keys, and whose `is`/`assert` narrow to the
  // matching generated type. Pass the generated `SchemaTypes` as the type param:
  //   const v = HyperschemaValidation.createValidator<SchemaTypes>(schema)
  static createValidator(schema) {
    return {
      validate: (fqn, value) => validate(schema, fqn, value),
      is: (fqn, value) => validate(schema, fqn, value).valid,
      assert: (fqn, value) => HyperschemaValidation.assert(schema, fqn, value)
    }
  }
}

module.exports = HyperschemaValidation
