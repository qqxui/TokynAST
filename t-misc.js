const { parseProgram } = require('../src/parser.js');
const { obfuscate } = require('../src/index.js');
const { runSource, Interpreter } = require('./mini-lua.js');

function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name);
  return cond;
}

let allPass = true;

// 1. Empty script
{
  const r = obfuscate('', { identifierProtection: true, compact: false });
  allPass &= check('empty script produces header only', r.code.trim() === '-- Protected by TokynAST V2.0');
}

// 2. Header present
{
  const r = obfuscate('print(1)', {});
  allPass &= check('header present', r.code.startsWith('-- Protected by TokynAST V2.0\n'));
}

// 3. Reserved names respected
{
  const src = `
local secretFn = function() return 1 end
local otherFn = function() return 2 end
print(secretFn(), otherFn())
`;
  const r = obfuscate(src, {
    identifierProtection: true, nameGenerator: 'hex', seed: 'resv-test',
    reservedNames: ['^secretFn$']
  });
  const keepsSecret = r.code.includes('secretFn');
  const renamesOther = !r.code.includes('otherFn');
  allPass &= check('reserved name "secretFn" preserved literally', keepsSecret);
  allPass &= check('non-reserved name "otherFn" renamed', renamesOther);
}

// 4. Reserved strings respected
{
  const src = `
print('KEEP_THIS_LITERAL')
print('this one can be protected')
`;
  const r = obfuscate(src, {
    constantProtection: true,
    stringArray: { enabled: true, threshold: 1, encoding: 'none' },
    seed: 'resv-str-test',
    reservedStrings: ['^KEEP_THIS_LITERAL$']
  });
  const keepsLiteral = r.code.includes('KEEP_THIS_LITERAL');
  allPass &= check('reserved string preserved literally', keepsLiteral);
}

// 5. Minify mode produces short names
{
  const src = 'local myVeryLongVariableNameHere = 42\nprint(myVeryLongVariableNameHere)\n';
  const r = obfuscate(src, { minify: true, seed: 'minify-test' });
  const noLongName = !r.code.includes('myVeryLongVariableNameHere');
  const hasShortLocal = /local [a-z]{1,2} ?=/.test(r.code);
  allPass &= check('minify removes long name', noLongName);
  allPass &= check('minify produces short local name', hasShortLocal);
  console.log('  minify output:', r.code.trim().split('\n').join(' | '));
}

// 6. Compact mode is single line (body, ignoring header)
{
  const src = 'local a = 1\nlocal b = 2\nif a < b then\n  print("less")\nend\n';
  const r = obfuscate(src, { compact: true, seed: 'compact-test' });
  const bodyLines = r.code.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('--'));
  allPass &= check('compact mode produces single body line', bodyLines.length === 1);
}

// 7. self preserved under full pipeline with heavy renaming
{
  const src = `
local Obj = {}
Obj.__index = Obj
function Obj.new() return setmetatable({v=0}, Obj) end
function Obj:add(n) self.v = self.v + n return self.v end
local o = Obj.new()
print(o:add(5), o:add(3))
`;
  const original = runSource(parseProgram, src);
  const r = obfuscate(src, {
    identifierProtection: true, nameGenerator: 'mangled-shuffle', renameGlobals: true, renameProperties: true,
    reservedNames: ['^__index$'], seed: 'self-test', layers: 2, controlFlowFlatten: 0.7, deadCodeInjection: true
  });
  let match = false;
  try {
    const ast = parseProgram(r.code);
    const interp = new Interpreter();
    interp.run(ast);
    match = interp.output.join('\n') === original;
  } catch (e) {
    console.log('  exec error:', e.message);
  }
  allPass &= check('self preserved + correct execution under heavy renaming/flatten/deadcode', match);
}

// 8. source map artifact structure
{
  const src = 'local x = 1\nprint(x)\n';
  const r = obfuscate(src, { sourceMap: true, identifierProtection: true, seed: 'smap-test' });
  const hasMap = r.sourceMap && Array.isArray(r.sourceMap.topLevelStatements) && r.sourceMap.topLevelStatements.length === 2;
  allPass &= check('source map produced with correct top-level entry count', hasMap);
}

console.log('\nALL PASS:', !!allPass);
