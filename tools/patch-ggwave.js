#!/usr/bin/env node
// Patch the vendored ggwave 0.4.0 Emscripten glue so it loads under the app
// shell's Content-Security-Policy ('self' + 'wasm-unsafe-eval', no
// 'unsafe-eval', connect-src 'self'). Two edits, both documented in
// app/vendor/ggwave/VENDOR-PATCH.md and app/vendor/VENDOR.md:
//
//   1. embind's createNamedFunction builds a wrapper with `new Function(...)`
//      purely to give the constructor a readable name. That is the only
//      dynamic-execution site in the file (every invoker is a closure).
//      Emscripten's own -sDYNAMIC_EXECUTION=0 variant of the same helper is
//      `Object.defineProperty(body, 'name', { value: name })`; we substitute
//      exactly that.
//   2. getBinaryPromise() fetch()es (or XHRs) the wasm even when it is
//      embedded as a data: URI, and connect-src 'self' refuses the data:
//      request with a console error before the code falls back to decoding
//      the URI inline. Newer Emscripten guards that whole branch with
//      !isDataURI(); we add the same guard, so an embedded binary is decoded
//      from the string and never requested over the network layer.
//   3. embind's craftInvokerFunction assembles every bound function's
//      invoker as JavaScript source and compiles it through
//      `new_(Function, ...)`. Emscripten's -sDYNAMIC_EXECUTION=0 build of the
//      same helper is a plain closure doing the identical marshalling
//      (argument-count check, toWireType on `this` and each argument, call,
//      destructors, fromWireType on the result); we substitute that closure.
//
// After the three edits the file contains no `new Function`, `Function(`,
// or `eval(` call site, so it runs with script-src 'self' 'wasm-unsafe-eval'.
//
// Usage: node tools/patch-ggwave.js [path]   (default app/vendor/ggwave/ggwave.js)
// Idempotent: a file that is already patched is left alone.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] || path.join(ROOT, 'app/vendor/ggwave/ggwave.js');

const EDITS = [
  {
    name: 'embind createNamedFunction without new Function',
    from: 'function createNamedFunction(name,body){name=makeLegalFunctionName(name);return new Function("body","return function "+name+"() {\\n"+\'    "use strict";\'+"    return body.apply(this, arguments);\\n"+"};\\n")(body)}',
    to: 'function createNamedFunction(name,body){name=makeLegalFunctionName(name);try{Object.defineProperty(body,"name",{value:name})}catch(e){}return body}',
  },
  {
    name: 'do not fetch() a data: URI wasm binary',
    from: 'function getBinaryPromise(){if(!wasmBinary&&(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER)){',
    to: 'function getBinaryPromise(){if(!wasmBinary&&(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER)&&!isDataURI(wasmBinaryFile)){',
  },
  {
    name: 'embind craftInvokerFunction as a closure (no Function constructor)',
    // The site is the whole minified function body, located by its start and
    // by the function that follows it; `marker` must be inside the slice.
    start: 'function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){',
    end: 'function heap32VectorToArray(',
    marker: 'new_(Function,args1)',
    to: 'function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){'
      + 'var argCount=argTypes.length;if(argCount<2){throwBindingError("argTypes array size mismatch! Must at least get return value and \'this\' types!")}'
      + 'var isClassMethodFunc=argTypes[1]!==null&&classType!==null;var needsDestructorStack=false;'
      + 'for(var i=1;i<argTypes.length;++i){if(argTypes[i]!==null&&argTypes[i].destructorFunction===undefined){needsDestructorStack=true;break}}'
      + 'var returns=argTypes[0].name!=="void";var expected=argCount-2;'
      + 'var invokerFunction=function(){'
      + 'if(arguments.length!==expected){throwBindingError("function "+humanName+" called with "+arguments.length+" arguments, expected "+expected+" args!")}'
      + 'var destructors=needsDestructorStack?[]:null;var invokerArgs=[cppTargetFunc];var wired=[];var thisWired;'
      + 'if(isClassMethodFunc){thisWired=argTypes[1].toWireType(destructors,this);invokerArgs.push(thisWired)}'
      + 'for(var j=0;j<expected;++j){wired[j]=argTypes[j+2].toWireType(destructors,arguments[j]);invokerArgs.push(wired[j])}'
      + 'var rv=cppInvokerFunc.apply(null,invokerArgs);'
      + 'if(needsDestructorStack){runDestructors(destructors)}else{for(var k=isClassMethodFunc?1:2;k<argTypes.length;++k){var param=k===1?thisWired:wired[k-2];if(argTypes[k].destructorFunction!==null){argTypes[k].destructorFunction(param)}}}'
      + 'if(returns){return argTypes[0].fromWireType(rv)}};'
      + 'try{Object.defineProperty(invokerFunction,"name",{value:makeLegalFunctionName(humanName)})}catch(e){}return invokerFunction}',
  },
];

const md5 = (s) => createHash('md5').update(s).digest('hex');
let src = fs.readFileSync(file, 'utf8');
const before = md5(src);
let applied = 0;
for (const e of EDITS) {
  if (src.includes(e.to)) { console.log(`already applied: ${e.name}`); continue; }
  if (e.start) {
    const s0 = src.indexOf(e.start);
    const s1 = s0 < 0 ? -1 : src.indexOf(e.end, s0);
    if (s0 < 0 || s1 < 0 || src.indexOf(e.start, s0 + 1) >= 0) { console.error(`cannot locate site for: ${e.name}`); process.exit(1); }
    const slice = src.slice(s0, s1);
    if (!slice.includes(e.marker)) { console.error(`site does not look right for: ${e.name}`); process.exit(1); }
    src = src.slice(0, s0) + e.to + src.slice(s1);
    applied += 1;
    console.log(`applied: ${e.name}`);
    continue;
  }
  const idx = src.indexOf(e.from);
  if (idx < 0) { console.error(`cannot find site for: ${e.name}`); process.exit(1); }
  if (src.indexOf(e.from, idx + 1) >= 0) { console.error(`site is not unique: ${e.name}`); process.exit(1); }
  src = src.replace(e.from, e.to);
  applied += 1;
  console.log(`applied: ${e.name}`);
}
if (applied) fs.writeFileSync(file, src);
console.log(`${path.relative(ROOT, file)}: md5 ${before} -> ${md5(src)} (${applied} edit${applied === 1 ? '' : 's'} applied)`);
if (/new Function\(|\beval\(|[^A-Za-z0-9_$.]Function\(/.test(src)) { console.error('dynamic execution still present'); process.exit(1); }
