const { parseProgram } = require('../src/parser.js');
const { obfuscate } = require('../src/index.js');
const { runSource, Interpreter } = require('./mini-lua.js');

const sample = `
local Account = {}
Account.__index = Account

function Account.new(owner, balance)
  local self = setmetatable({}, Account)
  self.owner = owner
  self.balance = balance or 0
  self.history = {}
  return self
end

function Account:deposit(amount)
  if amount <= 0 then
    error('deposit must be positive')
  end
  self.balance = self.balance + amount
  table.insert(self.history, 'deposit:' .. amount)
  return self.balance
end

function Account:withdraw(amount)
  if amount > self.balance then
    return false, 'insufficient funds'
  end
  self.balance = self.balance - amount
  table.insert(self.history, 'withdraw:' .. amount)
  return true
end

local function sumList(list)
  local total = 0
  for i = 1, #list do
    total = total + list[i]
  end
  return total
end

local function classify(n)
  if n < 0 then
    return 'negative'
  elseif n == 0 then
    return 'zero'
  else
    return 'positive'
  end
end

local acc = Account.new('Alice', 100)
acc:deposit(50)
local ok, err = acc:withdraw(200)
print(ok, err)
acc:withdraw(30)
print('balance', acc.balance)

for _, record in ipairs(acc.history) do
  print('history:', record)
end

local nums = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10}
print('sum', sumList(nums))

local evens = {}
for i = 1, #nums do
  if nums[i] % 2 == 0 then
    table.insert(evens, nums[i])
  end
end
print('evens count', #evens)

for i = 1, 5 do
  print(i, classify(i - 3))
end

local counter = 0
local function increment()
  counter = counter + 1
  return counter
end
print(increment(), increment(), increment())

local greeting = 'Hello, ' .. acc.owner .. '! Balance: ' .. acc.balance
print(greeting)

local i = 0
while i < 5 do
  i = i + 1
  if i == 3 then
    print('skip three')
  else
    print('tick', i)
  end
end
`;

const originalOutput = runSource(parseProgram, sample);

const presets = {
  light: {
    seed: 'preset-light',
    layers: 1,
    compact: false,
    identifierProtection: true,
    nameGenerator: 'hex',
    renameGlobals: false,
    renameProperties: false,
    constantProtection: true,
    stringArray: { enabled: true, threshold: 0.8, rotate: false, shuffle: false, encoding: 'none' },
    numbersToExpressions: false,
    splitStrings: false,
    deadCodeInjection: false,
    controlFlowFlatten: 0,
    wrappers: { count: 0, type: 'function' },
    debugProtection: false,
    antiTamper: false
  },
  balanced: {
    seed: 'preset-balanced',
    layers: 2,
    compact: false,
    identifierProtection: true,
    nameGenerator: 'mangled',
    renameGlobals: true,
    renameProperties: true,
    reservedNames: ['^__index$'],
    constantProtection: true,
    stringArray: { enabled: true, threshold: 0.85, rotate: true, shuffle: false, encoding: 'base64' },
    numbersToExpressions: true,
    splitStrings: true,
    deadCodeInjection: true,
    controlFlowFlatten: 0.5,
    wrappers: { count: 2, type: 'mixed' },
    debugProtection: true,
    antiTamper: true
  },
  max: {
    seed: 'preset-max',
    layers: 3,
    compact: true,
    minify: true,
    identifierProtection: true,
    nameGenerator: 'mangled-shuffle',
    identifierPrefix: 'tk',
    randomPrefix: true,
    renameGlobals: true,
    renameProperties: true,
    reservedNames: ['^__index$'],
    constantProtection: true,
    stringArray: { enabled: true, threshold: 1, rotate: true, shuffle: true, encoding: 'rc4' },
    numbersToExpressions: true,
    splitStrings: true,
    deadCodeInjection: true,
    controlFlowFlatten: 1,
    wrappers: { count: 3, type: 'variable' },
    sourceMap: true,
    debugProtection: true,
    antiTamper: true
  }
};

let allPass = true;
for (const [name, opts] of Object.entries(presets)) {
  let result;
  try {
    result = obfuscate(sample, opts);
  } catch (e) {
    console.log('=== preset', name, '=== BUILD ERROR:', e.message);
    console.log(e.stack);
    allPass = false;
    continue;
  }

  let reparsed;
  try {
    reparsed = parseProgram(result.code);
  } catch (e) {
    console.log('=== preset', name, '=== REPARSE ERROR:', e.message);
    allPass = false;
    continue;
  }

  let transformedOutput;
  let execError = null;
  try {
    const interp = new Interpreter();
    interp.run(reparsed);
    transformedOutput = interp.output.join('\n');
  } catch (e) {
    execError = e.message;
  }

  const match = transformedOutput === originalOutput;
  if (!match || execError) allPass = false;
  console.log('=== preset', name, '===');
  console.log('  size:', result.code.length, 'bytes | stats:', JSON.stringify(result.stats));
  console.log('  reparse OK, exec error:', execError, '| output MATCH:', match);
  if (!match && !execError) {
    console.log('  --- DIFF ---');
    console.log('  ORIGINAL:', JSON.stringify(originalOutput.slice(0,300)));
    console.log('  GOT     :', JSON.stringify(transformedOutput.slice(0,300)));
  }
  if (execError) {
    console.log('  CODE SNIPPET (first 2000 chars):\n', result.code.slice(0, 2000));
  }
}

console.log('\n=== DETERMINISM CHECK ===');
const r1 = obfuscate(sample, presets.balanced);
const r2 = obfuscate(sample, presets.balanced);
const sameSeeedSame = r1.code === r2.code;
console.log('same seed -> identical output:', sameSeeedSame);
if (!sameSeeedSame) allPass = false;

const r3 = obfuscate(sample, Object.assign({}, presets.balanced, { seed: 'different-seed' }));
const differentSeedDifferent = r1.code !== r3.code;
console.log('different seed -> different output:', differentSeedDifferent);
if (!differentSeedDifferent) allPass = false;

console.log('\nALL PASS:', allPass);
