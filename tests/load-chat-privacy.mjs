import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const privacy={};
new Function('exports',ts.transpileModule(await readFile(new URL('../app/resident-number.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(privacy);
export default privacy;
