const { parseProgram } = require('../src/parser.js');
const { generate } = require('../src/codegen.js');
const { stringArray } = require('../src/transforms/string-array.js');
const { RNG } = require('../src/rng.js');
const { NameGenerator } = require('../src/name-generator.js');
const { runSource, Interpreter } = require('./mini-lua.js');

const src = `
local greeting = 'Hello, World!'
local name = 'Tokyn'
print(greeting)
print(name .. ' says hi')
local special = 'line1\\nline2\\ttabbed "quoted" and back\\\\slash'
print(special)
local a = 'short'
local b = 'a bit longer string here for block boundary testing'
local c = 'exactly16bytes!!'
print(a, b, c)
`;

const originalOut = runSource(parseProgram, src);
console.log('ORIGINAL:\n' + originalOut + '\n====');

const encodings = ['none', 'base64', 'xor', 'rc4', 'lcg', 'xxtea', 'chacha20'];
let allPass = true;

for (const encoding of encodings) {
  for (const doubleLayer of [false, true]) {
    if (encoding === 'none' || encoding === 'base64') {
      if (doubleLayer) continue; // not applicable
    }
    const ast = parseProgram(src);
    const rng = new RNG('strarr2-' + encoding + '-' + doubleLayer);
    const internalNameGen = new NameGenerator({ mode: 'hex', rng });
    let stats, out, transformedOut, err = null;
    try {
      stats = stringArray(ast, { rng, threshold: 1, encoding, rotate: true, shuffle: true, doubleLayer, internalNameGen });
      out = generate(ast, { compact: false });
      const ast2 = parseProgram(out);
      const interp = new Interpreter();
      interp.run(ast2);
      transformedOut = interp.output.join('\n');
    } catch (e) {
      err = e;
    }
    const match = !err && transformedOut === originalOut;
    if (!match) allPass = false;
    console.log('encoding:', encoding.padEnd(9), '| double:', String(doubleLayer).padEnd(5), '| protected:', stats ? stats.stringsProtected : '-', '| MATCH:', match, err ? ('ERROR: ' + err.message) : '');
    if (!match && !err) {
      console.log('  GOT:', JSON.stringify(transformedOut));
    }
    if (err) {
      console.log(err.stack);
    }
  }
}
console.log('\nALL PASS:', allPass);
