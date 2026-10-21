const { stringToBytes, bytesToBinaryString, base64EncodeBytes, xorEncodeBytes, rc4KeystreamAndEncode } = require('../src/utils/encoding.js');

function jsBase64Decode(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const rev = {};
  for (let i = 0; i < chars.length; i++) rev[chars[i]] = i;
  const out = [];
  for (let i = 0; i < b64.length; i += 4) {
    const c1 = b64[i], c2 = b64[i+1], c3 = b64[i+2], c4 = b64[i+3];
    const n1 = rev[c1] || 0, n2 = rev[c2] || 0;
    const n3 = (c3 !== '=' && c3 !== undefined) ? rev[c3] : 0;
    const n4 = (c4 !== '=' && c4 !== undefined) ? rev[c4] : 0;
    const value = n1*262144 + n2*4096 + n3*64 + n4;
    out.push(Math.floor(value/65536) % 256);
    if (c3 !== '=' && c3 !== undefined) out.push(Math.floor(value/256) % 256);
    if (c4 !== '=' && c4 !== undefined) out.push(value % 256);
  }
  return out;
}

function jsBxor(a, b) {
  let result = 0, bitv = 1;
  while (a > 0 || b > 0) {
    const abit = a % 2, bbit = b % 2;
    if (abit !== bbit) result += bitv;
    a = (a - abit) / 2;
    b = (b - bbit) / 2;
    bitv *= 2;
  }
  return result;
}

function jsXorDecode(encBytes, keyBytes) {
  return encBytes.map((b, i) => jsBxor(b, keyBytes[i % keyBytes.length]));
}

function jsRc4Decode(encBytes, keyBytes) {
  // RC4 is symmetric -- decode == encode with same key
  return rc4KeystreamAndEncode(encBytes, keyBytes);
}

function bytesEqual(a, b) {
  return a.length === b.length && a.every((v,i) => v === b[i]);
}

const testStrings = ['Hello, World!', 'café résumé 日本語 emoji: 🎉🚀', 'line1\nline2\ttab"quote"\\backslash', '', 'a', 'special chars: \x01\x02\x7f'];

let allPass = true;
for (const s of testStrings) {
  const bytes = stringToBytes(s);

  const b64 = base64EncodeBytes(bytes);
  const b64Decoded = jsBase64Decode(b64);
  const b64Pass = bytesEqual(bytes, b64Decoded.slice(0, bytes.length));
  if (!b64Pass) allPass = false;

  const keyBytes = [12, 200, 55, 9, 163, 71, 240, 3];
  const xorEnc = xorEncodeBytes(bytes, keyBytes);
  const xorDec = jsXorDecode(xorEnc, keyBytes);
  const xorPass = bytesEqual(bytes, xorDec);
  if (!xorPass) allPass = false;

  const rc4Enc = rc4KeystreamAndEncode(bytes, keyBytes);
  const rc4Dec = jsRc4Decode(rc4Enc, keyBytes);
  const rc4Pass = bytesEqual(bytes, rc4Dec);
  if (!rc4Pass) allPass = false;

  console.log(JSON.stringify(s).slice(0,40), '| base64:', b64Pass, '| xor:', xorPass, '| rc4:', rc4Pass);
}
console.log('ALL ALGORITHMS ROUND-TRIP CORRECTLY:', allPass);
