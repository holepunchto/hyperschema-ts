export interface HyperschemaTSOptions {
  /** Override the output path (defaults to `<dir>/types.d.ts`). */
  filename?: string
  /** Map of external fully-qualified type name -> TS expression to use for it. */
  externals?: Record<string, string>
}

/**
 * Generates TypeScript type declarations from a Hyperschema instance.
 * Pass the same `schema` you pass to `Hyperschema.toDisk`.
 */
export default class HyperschemaTS {
  /** Generate the `.ts` source as a string. */
  static toCode(hyperschema: any, opts?: HyperschemaTSOptions): string

  /** Write the generated declarations to disk. Mirrors `Hyperschema.toDisk`. */
  static toDisk(
    hyperschema: any,
    dir?: string | HyperschemaTSOptions,
    opts?: HyperschemaTSOptions
  ): string

  /** Convert a hyperschema fully-qualified name (e.g. `@example/my-struct`) to its TS type name. */
  static typeName(fqn: string): string
}
