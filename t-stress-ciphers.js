const { parseProgram } = require('../src/parser.js');
const { generate } = require('../src/codegen.js');
const { stringArray } = require('../src/transforms/string-array.js');
const { RNG } = require('../src/rng.js');
const { NameGenerator } = require('../src/name-generator.js');
const { runSource, Interpreter } = require('./mini-lua.js');

const src = `
local s1 = 'AAAA'
local s2 = 'BBBBBBBBBBBBBBBBBBBB'
local s3 = 'C'
print(s1)
print(s2)
print(s3)
`;
const expected = runSource(parseProgram, src);

const encodings = ['xor', 'rc4', 'lcg', 'xxtea', 'chacha20'];
let failures = [];
for (const encoding of encodings) {
  for (const doubleLayer of [false, true]) {
    for (let trial = 0; trial < 40; trial++) {
      const seed = encoding + '-' + doubleLayer + '-trial' + trial;
      const ast = parseProgram(src);
      const rng = new RNG(seed);
      const internalNameGen = new NameGenerator({ mode: 'hex', rng });
      let out, got, err = null;
      try {
        stringArray(ast, { rng, threshold: 1, encoding, rotate: false, shuffle: false, doubleLayer, internalNameGen });
        out = generate(ast, { compact: false });
        const ast2 = parseProgram(out);
        const interp = new Interpreter();
        interp.run(ast2);
        got = interp.output.join('\n');
      } catch (e) {
        err = e.message;
      }
      if (err || got !== expected) {
        failures.push({ seed, encoding, doubleLayer, err, got });
      }
    }
  }
}
console.log('Total failures:', failures.length, 'out of', encodings.length * 2 * 40);
failures.slice(0, 10).forEach(f => console.log(JSON.stringify(f).slice(0, 200)));

// repeat same seed twice to verify determinism is now fixed
const seed = 'determinism-check';
const ast1 = parseProgram(src);
const rng1 = new RNG(seed);
const ng1 = new NameGenerator({ mode: 'hex', rng: rng1 });
stringArray(ast1, { rng: rng1, threshold: 1, encoding: 'chacha20', doubleLayer: true, internalNameGen: ng1 });
const out1 = generate(ast1, { compact: false });

const ast2 = parseProgram(src);
const rng2 = new RNG(seed);
const ng2 = new NameGenerator({ mode: 'hex', rng: rng2 });
stringArray(ast2, { rng: rng2, threshold: 1, encoding: 'chacha20', doubleLayer: true, internalNameGen: ng2 });
const out2 = generate(ast2, { compact: false });

console.log('\nDeterminism fixed (same seed -> identical output):', out1 === out2);
