'use strict';

const { transformStatement, transformStatements } = require('../ast.js');
const { parseStatementsFragment } = require('../parser.js');
const { formatString } = require('../codegen.js');
const { compileRegexes, matchesAny } = require('./rename-identifiers.js');
const {
  stringToBytes, bytesToBinaryString, base64EncodeBytes, xorEncodeBytes, rc4KeystreamAndEncode,
  lcgSeedFromKey, lcgKeystreamBytes, lcgEncodeBytes, xxteaEncodeBytes, chacha20EncodeBytes, MOD32
} = require('../utils/encoding.js');

const KEYED_ALGOS = new Set(['xor', 'rc4', 'lcg', 'xxtea', 'chacha20']);
const DOUBLE_LAYER_OFFSET = 500000;

function luaStringLiteralFromBytes(binaryByteString) {
  let out = '"';
  for (let i = 0; i < binaryByteString.length; i++) {
    out += '\\' + String(binaryByteString.charCodeAt(i)).padStart(3, '0');
  }
  return out + '"';
}

function luaStringLiteralFromText(text) {
  return formatString(text);
}

function deriveSubKeyBytesJS(baseKeyBytes, idx, outLen) {
  const baseSeed = lcgSeedFromKey(baseKeyBytes);
  const seed = (baseSeed + idx * 2654435761) % MOD32 || 1;
  return lcgKeystreamBytes(outLen, seed);
}

function keyLenForAlgo(encoding, baseLen) {
  if (encoding === 'xxtea') return 16;
  if (encoding === 'chacha20') return 32;
  return baseLen;
}

function oneLayerEncode(encoding, inputBytes, baseKeyBytes, idx) {
  const keyLen = keyLenForAlgo(encoding, baseKeyBytes.length);
  const subKey = deriveSubKeyBytesJS(baseKeyBytes, idx, keyLen);
  if (encoding === 'xor') return xorEncodeBytes(inputBytes, subKey);
  if (encoding === 'rc4') return rc4KeystreamAndEncode(inputBytes, subKey);
  if (encoding === 'lcg') return lcgEncodeBytes(inputBytes, subKey);
  if (encoding === 'xxtea') return xxteaEncodeBytes(inputBytes, subKey);
  if (encoding === 'chacha20') return chacha20EncodeBytes(inputBytes, subKey, [0, 0, 0]);
  return inputBytes;
}

function encodeEntryKeyed(plainStr, encoding, baseKeyBytes, physIndex, doubleLayer) {
  let bytes = stringToBytes(plainStr);
  if (doubleLayer) {
    bytes = oneLayerEncode(encoding, bytes, baseKeyBytes, physIndex + DOUBLE_LAYER_OFFSET);
  }
  bytes = oneLayerEncode(encoding, bytes, baseKeyBytes, physIndex);
  return bytes;
}

function buildBase64Decoder(fnName) {
  return `
local function ${fnName}(data)
  local b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  local rev = {}
  for i = 1, #b64chars do rev[b64chars:sub(i,i)] = i - 1 end
  local out = {}
  local i = 1
  while i <= #data do
    local c1 = data:sub(i,i)
    local c2 = data:sub(i+1,i+1)
    local c3 = data:sub(i+2,i+2)
    local c4 = data:sub(i+3,i+3)
    local n1 = rev[c1] or 0
    local n2 = rev[c2] or 0
    local n3 = (c3 ~= "=" and c3 ~= "") and rev[c3] or 0
    local n4 = (c4 ~= "=" and c4 ~= "") and rev[c4] or 0
    local value = n1*262144 + n2*4096 + n3*64 + n4
    out[#out+1] = string.char(math.floor(value/65536) % 256)
    if c3 ~= "=" and c3 ~= "" then out[#out+1] = string.char(math.floor(value/256) % 256) end
    if c4 ~= "=" and c4 ~= "" then out[#out+1] = string.char(value % 256) end
    i = i + 4
  end
  return table.concat(out)
end
`;
}

function buildBxorHelper(fnName) {
  return `
local function ${fnName}(a, b)
  local result, bitv = 0, 1
  while a > 0 or b > 0 do
    local abit, bbit = a % 2, b % 2
    if abit ~= bbit then result = result + bitv end
    a = (a - abit) / 2
    b = (b - bbit) / 2
    bitv = bitv * 2
  end
  return result
end
`;
}

function buildDeriveSubKeyHelper(fnName) {
  return `
local function ${fnName}(baseKey, idx, outLen)
  local baseSeed = 0
  for i = 1, #baseKey do baseSeed = (baseSeed + baseKey:byte(i) * i) % 4294967296 end
  if baseSeed == 0 then baseSeed = 1 end
  local seed = (baseSeed + idx * 2654435761) % 4294967296
  if seed == 0 then seed = 1 end
  local out = {}
  local x = seed
  for i = 1, outLen do
    x = (x * 1664525 + 1013904223) % 4294967296
    out[i] = string.char(math.floor(x / 16777216) % 256)
  end
  return table.concat(out)
end
`;
}

function buildXorDecoder(fnName, bxorName) {
  return `
local function ${fnName}(data, key)
  local out = {}
  local klen = #key
  for i = 1, #data do
    out[i] = string.char(${bxorName}(data:byte(i), key:byte(((i - 1) % klen) + 1)))
  end
  return table.concat(out)
end
`;
}

function buildRc4Decoder(fnName, bxorName) {
  return `
local function ${fnName}(data, key)
  local S = {}
  for i = 0, 255 do S[i] = i end
  local j = 0
  local klen = #key
  for i = 0, 255 do
    j = (j + S[i] + key:byte((i % klen) + 1)) % 256
    S[i], S[j] = S[j], S[i]
  end
  local i2, j2 = 0, 0
  local out = {}
  for n = 1, #data do
    i2 = (i2 + 1) % 256
    j2 = (j2 + S[i2]) % 256
    S[i2], S[j2] = S[j2], S[i2]
    local k = S[(S[i2] + S[j2]) % 256]
    out[n] = string.char(${bxorName}(data:byte(n), k))
  end
  return table.concat(out)
end
`;
}

function buildLcgDecoder(fnName, bxorName) {
  return `
local function ${fnName}(data, key)
  local seed = 0
  for i = 1, #key do seed = (seed + key:byte(i) * i) % 4294967296 end
  if seed == 0 then seed = 1 end
  local out = {}
  local x = seed
  for i = 1, #data do
    x = (x * 1664525 + 1013904223) % 4294967296
    local streamByte = math.floor(x / 16777216) % 256
    out[i] = string.char(${bxorName}(data:byte(i), streamByte))
  end
  return table.concat(out)
end
`;
}

function buildXxteaDecoder(fnName, bxorName) {
  return `
local function ${fnName}(data, key)
  local function b2w(d)
    local words = {}
    local n = #d
    local i = 1
    while i <= n do
      local b0 = d:byte(i) or 0
      local b1 = d:byte(i+1) or 0
      local b2 = d:byte(i+2) or 0
      local b3 = d:byte(i+3) or 0
      words[#words+1] = b0 + b1*256 + b2*65536 + b3*16777216
      i = i + 4
    end
    return words
  end
  local function key4(keyStr)
    local klen = #keyStr
    local function kb(i) return keyStr:byte((i % klen) + 1) end
    local words = {}
    for w = 0, 3 do
      words[w+1] = kb(w*4) + kb(w*4+1)*256 + kb(w*4+2)*65536 + kb(w*4+3)*16777216
    end
    return words
  end
  local function mx(sum, y, z, p, e, k)
    local a = ${bxorName}(math.floor(z / 32) % 4294967296, (y * 4) % 4294967296)
    local b = ${bxorName}(math.floor(y / 8) % 4294967296, (z * 16) % 4294967296)
    local c = (a + b) % 4294967296
    local d = ${bxorName}(sum, y)
    local idx = ${bxorName}(p % 4, e) + 1
    local f = ${bxorName}(k[idx], z)
    local g = (d + f) % 4294967296
    return ${bxorName}(c, g)
  end
  local words = b2w(data)
  local k = key4(key)
  local n = #words
  if n < 2 then return data end
  local DELTA = 2654435769
  local rounds = 6 + math.floor(52 / n)
  local sum = (rounds * DELTA) % 4294967296
  local y = words[1]
  local z, e
  while rounds > 0 do
    e = math.floor(sum / 4) % 4
    for p = n, 2, -1 do
      z = words[p - 1]
      words[p] = (words[p] - mx(sum, y, z, p - 1, e, k)) % 4294967296
      y = words[p]
    end
    z = words[n]
    words[1] = (words[1] - mx(sum, y, z, 0, e, k)) % 4294967296
    y = words[1]
    sum = (sum - DELTA) % 4294967296
    rounds = rounds - 1
  end
  local origLen = words[1]
  local bytes = {}
  for i = 2, n do
    local w = words[i]
    bytes[#bytes+1] = w % 256
    bytes[#bytes+1] = math.floor(w / 256) % 256
    bytes[#bytes+1] = math.floor(w / 65536) % 256
    bytes[#bytes+1] = math.floor(w / 16777216) % 256
  end
  local out = {}
  for i = 1, origLen do out[i] = string.char(bytes[i]) end
  return table.concat(out)
end
`;
}

function buildChacha20Decoder(fnName, bxorName) {
  return `
local function ${fnName}(data, key)
  local function rotl(x, n)
    return ((x * (2 ^ n)) % 4294967296) + math.floor(x / (2 ^ (32 - n)))
  end
  local function key8(keyStr)
    local klen = #keyStr
    local function kb(i) return keyStr:byte((i % klen) + 1) end
    local words = {}
    for w = 0, 7 do
      words[w+1] = kb(w*4) + kb(w*4+1)*256 + kb(w*4+2)*65536 + kb(w*4+3)*16777216
    end
    return words
  end
  local CONST = {0x61707865, 0x3320646e, 0x79622d32, 0x6b206574}
  local function qr(s, a, b, c, d)
    s[a] = (s[a] + s[b]) % 4294967296
    s[d] = rotl(${bxorName}(s[d], s[a]), 16)
    s[c] = (s[c] + s[d]) % 4294967296
    s[b] = rotl(${bxorName}(s[b], s[c]), 12)
    s[a] = (s[a] + s[b]) % 4294967296
    s[d] = rotl(${bxorName}(s[d], s[a]), 8)
    s[c] = (s[c] + s[d]) % 4294967296
    s[b] = rotl(${bxorName}(s[b], s[c]), 7)
  end
  local function block(keyWords, counter)
    local state = {}
    for i = 1, 4 do state[i] = CONST[i] end
    for i = 1, 8 do state[4+i] = keyWords[i] end
    state[13] = counter
    state[14], state[15], state[16] = 0, 0, 0
    local w = {}
    for i = 1, 16 do w[i] = state[i] end
    for round = 1, 10 do
      qr(w, 1, 5, 9, 13); qr(w, 2, 6, 10, 14); qr(w, 3, 7, 11, 15); qr(w, 4, 8, 12, 16)
      qr(w, 1, 6, 11, 16); qr(w, 2, 7, 12, 13); qr(w, 3, 8, 9, 14); qr(w, 4, 5, 10, 15)
    end
    local out = {}
    for i = 1, 16 do out[i] = (w[i] + state[i]) % 4294967296 end
    local bytes = {}
    for i = 1, 16 do
      local v = out[i]
      bytes[#bytes+1] = v % 256
      bytes[#bytes+1] = math.floor(v / 256) % 256
      bytes[#bytes+1] = math.floor(v / 65536) % 256
      bytes[#bytes+1] = math.floor(v / 16777216) % 256
    end
    return bytes
  end
  local keyWords = key8(key)
  local out = {}
  local counter = 1
  local blockBytes = nil
  local blockPos = 65
  for i = 1, #data do
    if blockPos > 64 then
      blockBytes = block(keyWords, counter)
      counter = counter + 1
      blockPos = 1
    end
    out[i] = string.char(${bxorName}(data:byte(i), blockBytes[blockPos]))
    blockPos = blockPos + 1
  end
  return table.concat(out)
end
`;
}

function buildKeyReconstruction(keyVar, partA, partB, bxorName) {
  return `
local ${keyVar}
do
  local __kpa = ${partA}
  local __kpb = ${partB}
  local __kparts = {}
  for __ki = 1, #__kpa do __kparts[__ki] = string.char(${bxorName}(__kpa:byte(__ki), __kpb:byte(__ki))) end
  ${keyVar} = table.concat(__kparts)
end
`;
}

function decoderBuilderFor(encoding) {
  if (encoding === 'xor') return buildXorDecoder;
  if (encoding === 'rc4') return buildRc4Decoder;
  if (encoding === 'lcg') return buildLcgDecoder;
  if (encoding === 'xxtea') return buildXxteaDecoder;
  if (encoding === 'chacha20') return buildChacha20Decoder;
  return null;
}

function buildSetupSource(opts) {
  const {
    arrayName, accessorName, encoding, luaEntries, baseKeyBytes,
    decoderFnName, bxorFnName, deriveFnName, keyVar, doubleLayer, rng
  } = opts;

  let src = `local ${arrayName} = {${luaEntries.join(', ')}}\n`;

  if (encoding === 'base64') {
    src += buildBase64Decoder(decoderFnName);
    src += `for __sai = 1, #${arrayName} do ${arrayName}[__sai] = ${decoderFnName}(${arrayName}[__sai]) end\n`;
  } else if (KEYED_ALGOS.has(encoding)) {
    src += buildBxorHelper(bxorFnName);
    const builder = decoderBuilderFor(encoding);
    src += builder(decoderFnName, bxorFnName);
    src += buildDeriveSubKeyHelper(deriveFnName);

    const halfLen = baseKeyBytes.length;
    const half1 = baseKeyBytes.map(() => rng.int(0, 256));
    const half2 = baseKeyBytes.map((b, i) => b ^ half1[i]);
    const partALiteral = luaStringLiteralFromBytes(bytesToBinaryString(half1));
    const partBLiteral = luaStringLiteralFromBytes(bytesToBinaryString(half2));
    src += buildKeyReconstruction(keyVar, partALiteral, partBLiteral, bxorFnName);

    const keyLen = keyLenForAlgo(encoding, halfLen);
    src += `for __sai = 1, #${arrayName} do\n`;
    src += `  local __subk1 = ${deriveFnName}(${keyVar}, __sai, ${keyLen})\n`;
    src += `  local __dec = ${decoderFnName}(${arrayName}[__sai], __subk1)\n`;
    if (doubleLayer) {
      src += `  local __subk2 = ${deriveFnName}(${keyVar}, __sai + ${DOUBLE_LAYER_OFFSET}, ${keyLen})\n`;
      src += `  __dec = ${decoderFnName}(__dec, __subk2)\n`;
    }
    src += `  ${arrayName}[__sai] = __dec\n`;
    src += `end\n`;
  }

  src += `local function ${accessorName}(__idx) return ${arrayName}[__idx] end\n`;
  return src;
}

function stringArray(chunk, options) {
  const rng = options.rng;
  const threshold = options.threshold === undefined ? 0.75 : options.threshold;
  const reservedStringRegexes = compileRegexes(options.reservedStrings);
  const encoding = options.encoding || 'none';
  const rotate = !!options.rotate;
  const shuffle = !!options.shuffle;
  const doubleLayer = !!options.doubleLayer && KEYED_ALGOS.has(encoding);
  const internalNameGen = options.internalNameGen;

  const collected = [];
  const callNodes = [];

  function visitor(node) {
    if (node.type !== 'StringLiteral') return undefined;
    if (matchesAny(node.value, reservedStringRegexes)) return undefined;
    if (!rng.bool(threshold)) return undefined;
    const logicalIndex = collected.length;
    collected.push(node.value);
    const callNode = {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: '' },
      args: [{ type: 'NumericLiteral', value: 0 }]
    };
    callNodes.push(callNode);
    return callNode;
  }
  for (let i = 0; i < chunk.body.length; i++) {
    chunk.body[i] = transformStatement(chunk.body[i], { expr: visitor });
  }

  const n = collected.length;
  if (n === 0) return { stringsProtected: 0 };

  let physicalOrder = Array.from({ length: n }, (_, i) => i);
  if (rotate) {
    const r = rng.int(1, n + 1);
    physicalOrder = physicalOrder.slice(r).concat(physicalOrder.slice(0, r));
  }
  if (shuffle) {
    physicalOrder = rng.shuffle(physicalOrder);
  }
  const logicalToPhysical = new Array(n);
  physicalOrder.forEach((logicalIdx, physPos) => { logicalToPhysical[logicalIdx] = physPos; });

  callNodes.forEach((callNode, logicalIdx) => {
    callNode.args[0].value = logicalToPhysical[logicalIdx] + 1;
  });

  const arrayName = internalNameGen.next();
  const accessorName = internalNameGen.next();
  const decoderFnName = internalNameGen.next();
  const bxorFnName = internalNameGen.next();
  const deriveFnName = internalNameGen.next();
  const keyVar = internalNameGen.next();

  callNodes.forEach((callNode) => { callNode.callee.name = accessorName; });

  let baseKeyBytes = null;
  if (KEYED_ALGOS.has(encoding)) {
    baseKeyBytes = [];
    const keyLen = 8 + rng.int(0, 8);
    for (let i = 0; i < keyLen; i++) baseKeyBytes.push(rng.int(1, 256));
  }

  const luaEntries = physicalOrder.map((logicalIdx, physPos) => {
    const str = collected[logicalIdx];
    const physIndex1Based = physPos + 1;
    if (encoding === 'base64') {
      return luaStringLiteralFromText(base64EncodeBytes(stringToBytes(str)));
    }
    if (KEYED_ALGOS.has(encoding)) {
      const encBytes = encodeEntryKeyed(str, encoding, baseKeyBytes, physIndex1Based, doubleLayer);
      return luaStringLiteralFromBytes(bytesToBinaryString(encBytes));
    }
    return luaStringLiteralFromText(str);
  });

  const setupSource = buildSetupSource({
    arrayName, accessorName, encoding, luaEntries, baseKeyBytes,
    decoderFnName, bxorFnName, deriveFnName, keyVar, doubleLayer, rng
  });
  let setupStatements = parseStatementsFragment(setupSource);
  setupStatements = transformStatements(setupStatements, {
    expr(node) {
      if (node.type === 'StringLiteral') node.rawBytes = true;
      return undefined;
    }
  });
  chunk.body = setupStatements.concat(chunk.body);

  return { stringsProtected: n };
}

module.exports = { stringArray };
