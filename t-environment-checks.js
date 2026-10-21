const { parseProgram } = require('../src/parser.js');
const { generate } = require('../src/codegen.js');
const { injectEnvironmentChecks } = require('../src/transforms/environment-checks.js');
const { RNG } = require('../src/rng.js');
const { NameGenerator } = require('../src/name-generator.js');
const { runSource, Interpreter } = require('./mini-lua.js');

const src = `
local function greet(name) return 'Hello, ' .. name end
print(greet('World'))
print(greet('Tokyn'))
`;
const expected = runSource(parseProgram, src);

const ast = parseProgram(src);
const rng = new RNG('envcheck-test');
const nameGen = new NameGenerator({ mode: 'hex', rng });
injectEnvironmentChecks(ast, { internalNameGen: nameGen });
const out = generate(ast, { compact: false });
console.log(out.slice(0, 600));
console.log('...');

const ast2 = parseProgram(out);
const interp = new Interpreter();
interp.run(ast2);
console.log('MATCH:', interp.output.join('\n') === expected);
