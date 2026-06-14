// Runtime validation of plain objects against a Hyperschema type.
//
// compact-encoding is mostly *silently lenient* on bad input (it will encode
// ipv4('hello') to 143.0.0.0, truncate uint8(9999) to 15, etc.) and only throws
// in a couple of cases. This walks the same resolved-type graph the codegen uses
// and rejects everything compact-encoding would either throw on OR silently
// corrupt, with a field path for each failure.

const MAX_SAFE = Number.MAX_SAFE_INTEGER

function isInt(v) {
  return typeof v === 'number' && Number.isInteger(v)
}

function isBytes(v) {
  return v instanceof Uint8Array
}

function isPlainObject(v) {
  return (
    typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date) && !isBytes(v)
  )
}

function isIPv4(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s)
  if (!m) return false
  for (let i = 1; i <= 4; i++) {
    if (Number(m[i]) > 255) return false
  }
  return true
}

function isIPv6(s) {
  if (typeof s !== 'string' || s.indexOf(':') === -1) return false
  const parts = s.split('::')
  if (parts.length > 2) return false

  const group = /^[0-9a-fA-F]{1,4}$/
  const head = parts[0] === '' ? [] : parts[0].split(':')
  const tail = parts.length === 2 ? (parts[1] === '' ? [] : parts[1].split(':')) : null

  for (const g of head) if (!group.test(g)) return false
  if (tail) for (const g of tail) if (!group.test(g)) return false

  // No compression: exactly 8 groups. With `::`: fewer groups, rest is zero-filled.
  return tail === null ? head.length === 8 : head.length + tail.length <= 7
}

// name -> { test(value) -> boolean, message }
const PRIMITIVES = new Map()

function set(name, test, message) {
  PRIMITIVES.set(name, { test, message })
}

const UINT_BITS = {
  uint1: 1,
  uint2: 2,
  uint3: 3,
  uint4: 4,
  uint5: 5,
  uint6: 6,
  uint7: 7,
  uint8: 8,
  uint16: 16,
  uint24: 24,
  uint32: 32,
  uint40: 40,
  uint48: 48,
  uint56: 56,
  uint64: 64
}
for (const [name, bits] of Object.entries(UINT_BITS)) {
  const max = bits >= 53 ? MAX_SAFE : 2 ** bits - 1
  set(name, (v) => isInt(v) && v >= 0 && v <= max, `must be an integer in [0, ${max}]`)
}

const INT_BITS = {
  int8: 8,
  int16: 16,
  int24: 24,
  int32: 32,
  int40: 40,
  int48: 48,
  int56: 56,
  int64: 64
}
for (const [name, bits] of Object.entries(INT_BITS)) {
  const max = bits >= 54 ? MAX_SAFE : 2 ** (bits - 1) - 1
  const min = bits >= 54 ? -MAX_SAFE : -(2 ** (bits - 1))
  set(name, (v) => isInt(v) && v >= min && v <= max, `must be an integer in [${min}, ${max}]`)
}

set('uint', (v) => isInt(v) && v >= 0 && v <= MAX_SAFE, 'must be a non-negative safe integer')
set('int', (v) => isInt(v) && v >= -MAX_SAFE && v <= MAX_SAFE, 'must be a safe integer')
set('lexint', (v) => isInt(v) && v >= 0 && v <= MAX_SAFE, 'must be a non-negative safe integer')
PRIMITIVES.set('port', PRIMITIVES.get('uint16'))

set('float32', (v) => typeof v === 'number' && Number.isFinite(v), 'must be a finite number')
set('float64', (v) => typeof v === 'number' && Number.isFinite(v), 'must be a finite number')

set(
  'biguint64',
  (v) => typeof v === 'bigint' && v >= 0n && v <= 0xffffffffffffffffn,
  'must be a bigint in [0, 2^64 - 1]'
)
set(
  'bigint64',
  (v) => typeof v === 'bigint' && v >= -(2n ** 63n) && v <= 2n ** 63n - 1n,
  'must be a bigint in [-2^63, 2^63 - 1]'
)
set('biguint', (v) => typeof v === 'bigint' && v >= 0n, 'must be a non-negative bigint')
set('bigint', (v) => typeof v === 'bigint', 'must be a bigint')

set('string', (v) => typeof v === 'string', 'must be a string')
PRIMITIVES.set('utf8', PRIMITIVES.get('string'))
// eslint-disable-next-line no-control-regex
set('ascii', (v) => typeof v === 'string' && /^[\x00-\x7f]*$/.test(v), 'must be an ASCII string')
set(
  'hex',
  (v) => typeof v === 'string' && v.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(v),
  'must be a hex string of even length'
)

set('buffer', isBytes, 'must be a Buffer or Uint8Array')
PRIMITIVES.set('optionalBuffer', PRIMITIVES.get('buffer'))
PRIMITIVES.set('raw', PRIMITIVES.get('buffer'))
set('fixed32', (v) => isBytes(v) && v.byteLength === 32, 'must be a 32-byte buffer')
set('fixed64', (v) => isBytes(v) && v.byteLength === 64, 'must be a 64-byte buffer')

set('bool', (v) => typeof v === 'boolean', 'must be a boolean')
set('date', (v) => v instanceof Date && Number.isFinite(v.getTime()), 'must be a valid Date')
set('none', () => true, '')
set('json', (v) => v !== undefined, 'must be JSON-serializable')

set('ipv4', (v) => typeof v === 'string' && isIPv4(v), 'must be a valid IPv4 address')
set('ipv6', (v) => typeof v === 'string' && isIPv6(v), 'must be a valid IPv6 address')
set('ip', (v) => typeof v === 'string' && (isIPv4(v) || isIPv6(v)), 'must be a valid IP address')

const ADDRESS_HOST = {
  ipv4Address: isIPv4,
  ipv6Address: isIPv6,
  ipAddress: (s) => isIPv4(s) || isIPv6(s)
}

function err(errors, path, value, message) {
  errors.push({ path, value, message })
}

function isPort(v) {
  return isInt(v) && v >= 0 && v <= 65535
}

function checkAddress(name, value, path, errors) {
  if (!isPlainObject(value)) {
    err(errors, path, value, 'must be an { host, port } object')
    return
  }
  if (typeof value.host !== 'string' || !ADDRESS_HOST[name](value.host)) {
    err(errors, path + '.host', value.host, 'must be a valid IP address')
  }
  if (!isPort(value.port)) {
    err(errors, path + '.port', value.port, 'must be a port in [0, 65535]')
  }
}

// Field-level `enum: [...]` annotation: domain membership for a field whose wire
// type stays as-is (typically `string`). Mirrors the type-level enum check.
function checkMembership(allowed, value, array, path, errors) {
  const message = `must be one of ${allowed.map((a) => JSON.stringify(a)).join(', ')}`
  const one = (val, p) => {
    if (!allowed.includes(val)) err(errors, p, val, message)
  }
  if (array) {
    if (Array.isArray(value)) value.forEach((el, i) => one(el, `${path}[${i}]`))
  } else {
    one(value, path)
  }
}

function checkValue(type, value, array, path, errors) {
  if (array) {
    if (!Array.isArray(value)) {
      err(errors, path, value, 'must be an array')
      return
    }
    for (let i = 0; i < value.length; i++) {
      checkValue(type, value[i], false, `${path}[${i}]`, errors)
    }
    return
  }

  if (type.isPrimitive) {
    if (ADDRESS_HOST[type.name]) {
      checkAddress(type.name, value, path, errors)
      return
    }
    const p = PRIMITIVES.get(type.name)
    if (p && !p.test(value)) err(errors, path, value, p.message)
    return
  }

  if (type.isAlias) {
    checkValue(type.type, value, false, path, errors)
    return
  }

  if (type.isEnum) {
    const keys = type.enum.map((e) => e.key)
    const ok = type.strings
      ? keys.includes(value)
      : isInt(value) && value >= type.offset && value < type.offset + keys.length
    if (!ok) {
      const allowed = type.strings
        ? keys.map((k) => JSON.stringify(k)).join(', ')
        : `[${type.offset}, ${type.offset + keys.length - 1}]`
      err(errors, path, value, `must be one of ${allowed}`)
    }
    return
  }

  if (type.isArray) {
    checkValue(type.type, value, true, path, errors)
    return
  }

  if (type.isRecord) {
    if (!isPlainObject(value)) {
      err(errors, path, value, 'must be an object')
      return
    }
    for (const key of Object.keys(value)) {
      checkValue(type.value, value[key], false, `${path}.${key}`, errors)
    }
    return
  }

  if (type.isStruct) {
    if (!isPlainObject(value)) {
      err(errors, path, value, 'must be an object')
      return
    }
    for (const field of type.fields) {
      const v = value[field.name]
      const present = v !== undefined && v !== null
      if (!present) {
        if (field.required) err(errors, `${path}.${field.name}`, v, 'is required')
        continue
      }
      const fieldPath = `${path}.${field.name}`
      checkValue(field.type, v, field.array, fieldPath, errors)
      if (field.description && field.description.enum) {
        checkMembership(field.description.enum, v, field.array, fieldPath, errors)
      }
    }
    return
  }

  // external / versioned: cannot validate structurally, treat as opaque
}

function validate(schema, fqn, value) {
  if (typeof schema.linkAll === 'function') schema.linkAll()

  const type = schema.resolve(fqn)
  if (!type) throw new Error(`Unknown type: ${fqn}`)

  const errors = []
  checkValue(type, value, false, fqn, errors)
  return { valid: errors.length === 0, errors }
}

module.exports = { validate, PRIMITIVES }
