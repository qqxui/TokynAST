'use strict';

const { parseStatementsFragment } = require('../parser.js');

function buildSource(names) {
  const { canaryFn, hashFn, checkFn, dumpVar, baselineVar } = names;
  return `
local function ${canaryFn}() return 1 end
local ${dumpVar} = nil
if string.dump then
  pcall(function() ${dumpVar} = string.dump(${canaryFn}) end)
end

local function ${hashFn}(s)
  local h = 0
  for __ati = 1, #s do
    h = (h * 31 + s:byte(__ati)) % 1000000007
  end
  return h
end

local ${baselineVar} = ${dumpVar} and ${hashFn}(${dumpVar}) or nil

local function ${checkFn}()
  if ${baselineVar} == nil then return end
  local __atok, __atd = pcall(string.dump, ${canaryFn})
  if __atok and __atd then
    if ${hashFn}(__atd) ~= ${baselineVar} then
      while true do end
    end
  end
end
${checkFn}()
`;
}

function injectAntiTamper(chunk, options) {
  const nameGen = options.internalNameGen;
  const names = {
    canaryFn: nameGen.next(),
    hashFn: nameGen.next(),
    checkFn: nameGen.next(),
    dumpVar: nameGen.next(),
    baselineVar: nameGen.next()
  };
  const statements = parseStatementsFragment(buildSource(names));
  chunk.body = statements.concat(chunk.body);
  return { injected: true };
}

module.exports = { injectAntiTamper };
