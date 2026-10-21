const fs = require('fs');
const { parseProgram } = require('../src/parser.js');
const { generate } = require('../src/codegen.js');
const { stringArray } = require('../src/transforms/string-array.js');
const { RNG } = require('../src/rng.js');
const { NameGenerator } = require('../src/name-generator.js');
const { Interpreter } = require('./mini-lua.js');

const src = `
local s1 = 'AAAA'
local s2 = 'BBBBBBBBBBBBBBBBBBBB'
local s3 = 'C'
print(s1)
print(s2)
print(s3)
`;

let allPass = true;
for (const encoding of ['xor', 'rc4', 'lcg', 'xxtea', 'chacha20']) {
  const ast = parseProgram(src);
  const rng = new RNG('file-rt-' + encoding);
  const internalNameGen = new NameGenerator({ mode: 'hex', rng });
  stringArray(ast, { rng, threshold: 1, encoding, doubleLayer: true, internalNameGen });
  const out = generate(ast, { compact: false });

  // REAL file write as UTF-8, then read back -- this is the step that was never tested before
  const filePath = '/tmp/roundtrip-' + encoding + '.lua';
  fs.writeFileSync(filePath, out, 'utf8');
  const readBack = fs.readFileSync(filePath, 'utf8');

  const ast2 = parseProgram(readBack);
  const interp = new Interpreter();
  interp.run(ast2);
  const got = interp.output.join('\n');
  const expected = 'AAAA\nBBBBBBBBBBBBBBBBBBBB\nC';
  const match = got === expected;
  if (!match) allPass = false;
  console.log(encoding, '| file round-trip MATCH:', match, match ? '' : ('GOT: ' + JSON.stringify(got)));
}
console.log('\nFILE ROUND-TRIP ALL PASS:', allPass);
