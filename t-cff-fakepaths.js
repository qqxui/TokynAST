const { parseProgram } = require('../src/parser.js');
const { generate } = require('../src/codegen.js');
const { controlFlowFlatten } = require('../src/transforms/control-flow-flatten.js');
const { RNG } = require('../src/rng.js');
const { NameGenerator } = require('../src/name-generator.js');
const { runSource, Interpreter } = require('./mini-lua.js');

const tests = [
`local function classify(n)
  if n < 0 then
    return 'negative'
  elseif n == 0 then
    return 'zero'
  else
    return 'positive'
  end
end
print(classify(-5), classify(0), classify(5))`,
`local function outer(n)
  local result = 0
  for i = 1, n do
    local sq = i * i
    result = result + sq
    if result > 50 then
      break
    end
  end
  return result
end
print(outer(10))`,
`local a = 1
local b = a + 1
local c = a + b
local d = c * 2
local e = d - a
print(a, b, c, d, e)`,
`for i = 1, 10 do
  if i > 5 then break end
  print('i', i)
end
print('after')`
];

let allPass = true;
let sawHopOrDecoy = false;
for (let idx = 0; idx < tests.length; idx++) {
  const src = tests[idx];
  const expected = runSource(parseProgram, src);
  const ast = parseProgram(src);
  const rng = new RNG('cff-fake-' + idx);
  const nameGen = new NameGenerator({ mode: 'hex', rng });
  const stats = controlFlowFlatten(ast, { rng, probability: 1, nameGen, fakeDensity: 0.6 });
  const out = generate(ast, { compact: false });
  if ((out.match(/__ts_/g) || []).length > 3) sawHopOrDecoy = true;
  let got, err = null;
  try {
    const ast2 = parseProgram(out);
    const interp = new Interpreter();
    interp.run(ast2);
    got = interp.output.join('\n');
  } catch (e) { err = e.message; }
  const match = got === expected;
  if (!match || err) allPass = false;
  console.log('test', idx, '| flattened:', stats.blocksFlattened, '| MATCH:', match, err || '');
  if (!match && !err) {
    console.log('  expected:', JSON.stringify(expected));
    console.log('  got     :', JSON.stringify(got));
  }
}
console.log('\nstate-var count check (many __ts_ refs = hops/decoys present):', sawHopOrDecoy);
console.log('ALL PASS:', allPass);
