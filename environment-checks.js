'use strict';

const { parseStatementsFragment } = require('../parser.js');

function buildSource(fnName) {
  return `
local function ${fnName}()
  if type(_G) == "table" then
    local __ecexpected = {
      print = "function", pairs = "function", ipairs = "function", type = "function",
      tostring = "function", tonumber = "function", pcall = "function", error = "function",
      assert = "function", setmetatable = "function", select = "function",
      string = "table", table = "table", math = "table"
    }
    for __ecname, __eckind in pairs(__ecexpected) do
      if type(_G[__ecname]) ~= __eckind then
        while true do end
      end
    end
    local __ecmarkers = {
      "getgenv", "getrenv", "getreg", "getgc", "hookfunction", "hookmetamethod",
      "checkcaller", "identifyexecutor", "getexecutorname", "is_sirhurt_closure"
    }
    for __ecmi = 1, #__ecmarkers do
      if _G[__ecmarkers[__ecmi]] ~= nil then
        while true do end
      end
    end
  end
  if type(os) == "table" and type(os.clock) == "function" then
    local __ecok0, __ect0 = pcall(os.clock)
    if __ecok0 then
      local __ecx = 0
      for __eci = 1, 200000 do __ecx = __ecx + __eci end
      local __ecok1, __ect1 = pcall(os.clock)
      if __ecok1 and (__ect1 - __ect0) > 2.5 then
        while true do end
      end
    end
  end
end
${fnName}()
`;
}

function injectEnvironmentChecks(chunk, options) {
  const nameGen = options.internalNameGen;
  const fnName = nameGen.next();
  const statements = parseStatementsFragment(buildSource(fnName));
  chunk.body = statements.concat(chunk.body);
  return { injected: true };
}

module.exports = { injectEnvironmentChecks };
