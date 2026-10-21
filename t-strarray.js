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
local special = 'line1\\nline2\\ttabbed "quoted"'
print(special)
`;

const originalOut = runSource(parseProgram, src);
console.log('ORIGINAL OUTPUT:');
console.log(originalOut);
console.log('====');

for (const encoding of ['none','base64','xor','rc4']) {
  const ast = parseProgram(src);
  const rng = new RNG('strarr-' + encoding);
  const internalNameGen = new NameGenerator({mode:'hex', rng});
  const stats = stringArray(ast, {rng, threshold:1, encoding, rotate:true, shuffle:true, internalNameGen});
  const out = generate(ast, {compact:false});
  let transformedOut;
  try {
    const ast2 = parseProgram(out);
    const interp = new Interpreter();
    interp.run(ast2);
    transformedOut = interp.output.join('\n');
  } catch(e) {
    transformedOut = 'ERROR: ' + e.message + '\n' + e.stack;
  }
  const match = transformedOut === originalOut;
  console.log('encoding:', encoding, 'protected:', stats.stringsProtected, 'MATCH:', match);
  if (!match) {
    console.log('GOT:\n' + transformedOut);
    console.log('CODE:\n' + out);
  }
}
