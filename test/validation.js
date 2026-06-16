const test = require('brittle')
const c = require('compact-encoding')

const Hyperschema = require('hyperschema')
const Validation = require('../validation.cjs')

// Register an alias per primitive so we can validate a bare primitive by fqn.
function primSchema() {
  const schema = Hyperschema.from(null)
  const ns = schema.namespace('p')
  const prims = [
    'uint',
    'uint8',
    'int8',
    'float64',
    'bigint64',
    'string',
    'hex',
    'ascii',
    'bool',
    'date',
    'buffer',
    'fixed32',
    'ipv4',
    'ipv6',
    'ip'
  ]
  for (const t of prims) ns.register({ name: t, alias: t })
  ns.register({ name: 'addr', alias: 'ipAddress' })
  return schema
}

function ok(t, schema, type, value) {
  const r = Validation.validate(schema, `@p/${type}`, value)
  t.ok(r.valid, `${type} accepts ${JSON.stringify(String(value))}: ${JSON.stringify(r.errors)}`)
}

function bad(t, schema, type, value) {
  const r = Validation.validate(schema, `@p/${type}`, value)
  t.absent(r.valid, `${type} rejects ${JSON.stringify(String(value))}`)
}

test('numeric ranges match compact-encoding bounds', (t) => {
  const s = primSchema()
  ok(t, s, 'uint8', 255)
  bad(t, s, 'uint8', 256)
  bad(t, s, 'uint8', -1)
  bad(t, s, 'uint8', 1.5)
  ok(t, s, 'int8', -128)
  ok(t, s, 'int8', 127)
  bad(t, s, 'int8', 128)
  ok(t, s, 'uint', 0)
  bad(t, s, 'uint', -5)
  ok(t, s, 'float64', 3.14)
  bad(t, s, 'float64', 'nope')
})

test('bigint types require bigint in range', (t) => {
  const s = primSchema()
  ok(t, s, 'bigint64', 5n)
  bad(t, s, 'bigint64', 5)
  bad(t, s, 'bigint64', 2n ** 63n)
})

test('string subtypes', (t) => {
  const s = primSchema()
  ok(t, s, 'string', 'hi')
  bad(t, s, 'string', 5)
  ok(t, s, 'hex', 'deadbeef')
  bad(t, s, 'hex', 'zz')
  bad(t, s, 'hex', 'f') // odd length
  ok(t, s, 'ascii', 'plain')
  bad(t, s, 'ascii', 'café')
})

test('buffers and fixed sizes', (t) => {
  const s = primSchema()
  ok(t, s, 'buffer', Buffer.from('x'))
  bad(t, s, 'buffer', 'x')
  ok(t, s, 'fixed32', Buffer.alloc(32))
  bad(t, s, 'fixed32', Buffer.alloc(31))
})

test('bool and date', (t) => {
  const s = primSchema()
  ok(t, s, 'bool', true)
  bad(t, s, 'bool', 1)
  ok(t, s, 'date', new Date())
  bad(t, s, 'date', Date.now())
  bad(t, s, 'date', new Date('nonsense'))
})

test('ip strings', (t) => {
  const s = primSchema()
  ok(t, s, 'ipv4', '1.2.3.4')
  bad(t, s, 'ipv4', 'hello')
  bad(t, s, 'ipv4', '999.1.2.3')
  bad(t, s, 'ipv4', '1.2')
  ok(t, s, 'ipv6', '2001:db8::1')
  bad(t, s, 'ipv6', '1.2.3.4')
  ok(t, s, 'ip', '1.2.3.4')
  ok(t, s, 'ip', '::1')
})

test('ipAddress is an { host, port } object', (t) => {
  const s = primSchema()
  ok(t, s, 'addr', { host: '1.2.3.4', port: 8080 })
  bad(t, s, 'addr', '1.2.3.4')
  bad(t, s, 'addr', { host: 'nope', port: 80 })
  bad(t, s, 'addr', { host: '1.2.3.4', port: 99999 })
})

test('validator is in lockstep with compact-encoding', (t) => {
  const s = primSchema()

  // Cases ce silently corrupts — the validator must reject them.
  t.absent(Validation.validate(s, '@p/ipv4', 'hello').valid)
  t.not(c.decode(c.ipv4, c.encode(c.ipv4, 'hello')), 'hello', 'ce silently corrupts bad ipv4')

  t.absent(Validation.validate(s, '@p/uint8', 9999).valid)
  t.not(c.decode(c.uint8, c.encode(c.uint8, 9999)), 9999, 'ce silently truncates uint8')

  // Cases ce throws on — the validator must also reject them.
  t.absent(Validation.validate(s, '@p/uint', -5).valid)
  t.exception(() => c.encode(c.uint, -5))

  // Accepted values round-trip cleanly through ce.
  t.is(c.decode(c.uint8, c.encode(c.uint8, 255)), 255)
  t.is(c.decode(c.ipv4, c.encode(c.ipv4, '1.2.3.4')), '1.2.3.4')
})

test('json validation is in lockstep with compact-encoding', (t) => {
  const schema = Hyperschema.from(null)
  const ns = schema.namespace('example')
  ns.register({ name: 'doc', fields: [{ name: 'payload', type: 'json' }] })

  const accepts = (value) => Validation.validate(schema, '@example/doc', { payload: value }).valid
  const roundTrips = (value) => {
    try {
      c.decode(c.json, c.encode(c.json, value))
      return true
    } catch {
      return false
    }
  }

  const circular = {}
  circular.self = circular

  // Serializable values: validator accepts and ce round-trips. `{ fn }` is
  // included because ce (like JSON) silently drops the function rather than
  // throwing, so the validator must not reject it. NaN and Date stringify to a
  // valid (if lossy) JSON value, so they are accepted, matching ce.
  for (const v of [{ a: 1 }, [1, 2, 3], 'str', 42, true, { fn: () => {} }, NaN, new Date(0)]) {
    t.ok(accepts(v), `accepts ${JSON.stringify(v)}`)
    t.ok(roundTrips(v), 'ce round-trips it')
  }

  // Non-serializable values: ce throws, so the validator must reject them. A
  // top-level symbol stringifies to undefined; a throwing toJSON must be caught
  // and rejected, not propagated out of validate().
  const throwingToJSON = {
    toJSON() {
      throw new Error('boom')
    }
  }
  for (const v of [() => {}, 10n, { b: 1n }, circular, Symbol('x'), throwingToJSON]) {
    t.absent(accepts(v), 'rejects non-serializable value')
    t.absent(roundTrips(v), 'ce throws on it')
  }
})

// ---- structural validation ----

function structSchema() {
  const schema = Hyperschema.from(null)
  const ns = schema.namespace('example')
  ns.register({ name: 'color', enum: ['red', 'green', 'blue'], strings: true })
  ns.register({ name: 'level', enum: ['low', 'high'] })
  ns.register({ name: 'counts', record: true, key: 'string', value: 'uint' })
  ns.register({
    name: 'sub',
    fields: [{ name: 'n', type: 'uint', required: true }]
  })
  ns.register({
    name: 'request',
    fields: [
      { name: 'id', type: 'uint', required: true },
      { name: 'tags', type: 'string', array: true },
      { name: 'colour', type: '@example/color' },
      { name: 'lvl', type: '@example/level' },
      { name: 'lookup', type: '@example/counts' },
      { name: 'meta', type: '@example/sub' }
    ]
  })
  return schema
}

test('struct: required field missing is rejected', (t) => {
  const s = structSchema()
  const r = Validation.validate(s, '@example/request', { tags: ['a'] })
  t.absent(r.valid)
  t.ok(r.errors.some((e) => e.path === '@example/request.id' && e.message === 'is required'))
})

test('struct: valid object passes', (t) => {
  const s = structSchema()
  const r = Validation.validate(s, '@example/request', {
    id: 1,
    tags: ['a', 'b'],
    colour: 'green',
    lvl: 1,
    lookup: { a: 1, b: 2 },
    meta: { n: 3 }
  })
  t.ok(r.valid, JSON.stringify(r.errors))
})

test('struct: arrays, enums, records and nested structs are checked', (t) => {
  const s = structSchema()

  t.absent(Validation.validate(s, '@example/request', { id: 1, tags: 'notarray' }).valid)
  t.absent(Validation.validate(s, '@example/request', { id: 1, tags: [1, 2] }).valid)
  t.absent(Validation.validate(s, '@example/request', { id: 1, colour: 'purple' }).valid)
  t.absent(Validation.validate(s, '@example/request', { id: 1, lvl: 99 }).valid)
  t.absent(Validation.validate(s, '@example/request', { id: 1, lookup: { a: -1 } }).valid)
  t.absent(Validation.validate(s, '@example/request', { id: 1, meta: { n: 'x' } }).valid)
})

test('assert throws an aggregated error', (t) => {
  const s = structSchema()
  t.exception(
    () => Validation.assert(s, '@example/request', { tags: 'bad' }),
    /Invalid @example\/request/
  )
  t.execution(() => Validation.assert(s, '@example/request', { id: 1 }))
})

test('createValidator binds the schema across validate/is/assert', (t) => {
  const s = structSchema()
  const v = Validation.createValidator(s)

  const good = { id: 1, colour: 'green' }
  const bad = { colour: 'purple' }

  t.ok(v.validate('@example/request', good).valid)
  t.absent(v.validate('@example/request', bad).valid)

  t.ok(v.is('@example/request', good))
  t.absent(v.is('@example/request', bad))

  t.execution(() => v.assert('@example/request', good))
  t.exception(() => v.assert('@example/request', bad))
})

test('static is mirrors validate().valid', (t) => {
  const s = structSchema()
  t.ok(Validation.is(s, '@example/request', { id: 1 }))
  t.absent(Validation.is(s, '@example/request', { colour: 'nope' }))
})

test('field-level enum annotation enforces membership on string fields', (t) => {
  const schema = Hyperschema.from(null)
  const ns = schema.namespace('example')
  ns.register({
    name: 'agent',
    fields: [
      { name: 'state', type: 'string', required: true, enum: ['queued', 'running', 'done'] },
      { name: 'roles', type: 'string', array: true, enum: ['admin', 'user'] }
    ]
  })

  // base type still checked: state must be a string
  t.absent(Validation.validate(schema, '@example/agent', { state: 5 }).valid)

  // membership enforced
  const bad = Validation.validate(schema, '@example/agent', { state: 'paused' })
  t.absent(bad.valid)
  t.ok(
    bad.errors.some((e) => e.path === '@example/agent.state' && /must be one of/.test(e.message))
  )

  t.ok(Validation.validate(schema, '@example/agent', { state: 'running' }).valid)

  // membership applies element-wise for arrays
  t.absent(
    Validation.validate(schema, '@example/agent', { state: 'done', roles: ['admin', 'ghost'] })
      .valid
  )
  t.ok(
    Validation.validate(schema, '@example/agent', { state: 'done', roles: ['admin', 'user'] }).valid
  )
})
