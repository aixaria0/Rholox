import { readFileSync } from 'node:fs'
import ts from 'typescript'
/** Compile the actual product module, resolving only explicitly supplied local modules. */
export function moduleUrl(path, locals = {}, transform = source => source) {
  const source = transform(readFileSync(new URL(path, import.meta.url), 'utf8'))
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: path }).outputText
  const resolved = compiled.replace(/from (["'])([^"']+)\1/g, (_match, _quote, specifier) => `from ${JSON.stringify(locals[specifier] ?? import.meta.resolve(specifier))}`)
  return `data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`
}
