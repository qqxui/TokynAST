const { parseProgram } = require('../src/parser.js');
const { generate } = require('../src/codegen.js');
const { injectDebugProtection } = require('../src/transforms/debug-protection.js');
const { injectAntiTamper } = require('../src/transforms/anti-tamper.js');
const { RNG } = require('../src/rng.js');
const { NameGenerator } = require('../src/name-generator.js');
const { runSource, Interpreter } = require('./mini-lua.js');

const src = `
local function greet(name)
  return 'Hello, ' .. name .. '!'
end
print(greet('World'))
print(greet('Tokyn'))
`;

const originalOut = runSource(parseProgram, src);

const ast = parseProgram(src);
const rng = new RNG('protections-test');
const nameGen = new NameGenerator({mode:'hex', rng});
injectDebugProtection(ast, {internalNameGen: nameGen});
injectAntiTamper(ast, {internalNameGen: nameGen});
const out = generate(ast, {compact:false});
console.log(out);
console.log('====');

const ast2 = parseProgram(out);
const interp = new Interpreter();
interp.run(ast2);
const transformedOut = interp.output.join('\n');
console.log('MATCH:', transformedOut === originalOut);
