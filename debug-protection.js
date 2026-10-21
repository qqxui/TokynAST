'use strict';

const { parseStatementsFragment } = require('../parser.js');

function buildSource(checkFnName) {
  return `
local function ${checkFnName}()
  if type(debug) ~= "table" then return end
  if debug.gethook then
    local __dpok, __dphook = pcall(debug.gethook)
    if __dpok and __dphook ~= nil then
      while true do end
    end
  end
  if debug.sethook then
    pcall(debug.sethook, ${checkFnName}, "", 500000)
  end
end
${checkFnName}()
`;
}

function injectDebugProtection(chunk, options) {
  const nameGen = options.internalNameGen;
  const checkFnName = nameGen.next();
  const statements = parseStatementsFragment(buildSource(checkFnName));
  chunk.body = statements.concat(chunk.body);
  return { injected: true };
}

module.exports = { injectDebugProtection };
