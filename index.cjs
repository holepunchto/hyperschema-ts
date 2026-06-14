const fs = require('fs')
const p = require('path')

const { emit, typeName } = require('./lib/codegen.js')

const CODE_FILE_NAME = 'types.d.ts'

class HyperschemaTS {
  // Generate a TypeScript declaration string from a (resolved) Hyperschema instance.
  static toCode(hyperschema, opts = {}) {
    if (typeof hyperschema.linkAll === 'function') hyperschema.linkAll()
    return emit(hyperschema, opts)
  }

  // Mirror Hyperschema.toDisk(schema, dir?, opts?).
  static toDisk(hyperschema, dir, opts) {
    if (typeof dir === 'object' && dir) {
      opts = dir
      dir = null
    }
    opts = opts || {}

    if (typeof hyperschema.linkAll === 'function') hyperschema.linkAll()

    if (!dir) dir = hyperschema.dir

    const codePath = opts.filename || p.join(p.resolve(dir), CODE_FILE_NAME)
    fs.mkdirSync(p.dirname(codePath), { recursive: true })
    fs.writeFileSync(codePath, emit(hyperschema, opts), { encoding: 'utf-8' })

    return codePath
  }

  static typeName = typeName
}

module.exports = HyperschemaTS
