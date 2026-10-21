const { parseProgram } = require('../src/parser.js');
const { generate } = require('../src/codegen.js');
const { injectEnvironmentChecks } = require('../src/transforms/environment-checks.js');
const { RNG } = require('../src/rng.js');
const { NameGenerator } = require('../src/name-generator.js');
const { Interpreter, LuaTable } = require('./mini-lua.js');

function buildOut(seed) {
  const src = `print('ok')`;
  const ast = parseProgram(src);
  const rng = new RNG(seed);
  const nameGen = new NameGenerator({ mode: 'hex', rng });
  injectEnvironmentChecks(ast, { internalNameGen: nameGen });
  return generate(ast, { compact: false });
}

function runWithG(out, gTable) {
  const ast = parseProgram(out);
  const interp = new Interpreter();
  interp.maxSteps = 50000;
  interp.globals.declare('_G', gTable);
  try {
    interp.run(ast);
    return { ok: true, output: interp.output.join('\n') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function makeGoodG(interp) {
  const g = new LuaTable();
  const fnTypes = ['print','pairs','ipairs','type','tostring','tonumber','pcall','error','assert','setmetatable','select'];
  fnTypes.forEach(n => g.map.set(n, () => []));
  g.map.set('string', new LuaTable());
  g.map.set('table', new LuaTable());
  g.map.set('math', new LuaTable());
  return g;
}

const out = buildOut('envcheck-detect-test');

// case 1: everything present correctly -> should run fine, no infinite loop
{
  const g = makeGoodG();
  const r = runWithG(out, g);
  console.log('good env -> ok:', r.ok, r.ok ? r.output : r.error);
}

// case 2: a marker present -> should infinite-loop (step limit exceeded)
{
  const g = makeGoodG();
  g.map.set('getgenv', () => []);
  const r = runWithG(out, g);
  console.log('marker present -> correctly triggers (expect step-limit error):', !r.ok, r.ok ? r.output : r.error);
}

// case 3: a core global has wrong type -> should infinite-loop
{
  const g = makeGoodG();
  g.map.set('pairs', 'not a function');
  const r = runWithG(out, g);
  console.log('type mismatch -> correctly triggers (expect step-limit error):', !r.ok, r.ok ? r.output : r.error);
}

// case 4: a core global missing entirely -> should infinite-loop
{
  const g = makeGoodG();
  g.map.delete ? null : null;
  g.map.set('setmetatable', undefined);
  const r = runWithG(out, g);
  console.log('missing global -> correctly triggers (expect step-limit error):', !r.ok, r.ok ? r.output : r.error);
}
