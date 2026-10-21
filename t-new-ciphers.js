const enc = require('../src/utils/encoding.js');

function xxteaMx(sum, y, z, p, e, key) {
  const a = ((z >>> 5) ^ (y << 2)) >>> 0;
  const b = ((y >>> 3) ^ (z << 4)) >>> 0;
  const c = (a + b) >>> 0;
  const d = (sum ^ y) >>> 0;
  const f = (key[(p & 3) ^ e] ^ z) >>> 0;
  const g = (d + f) >>> 0;
  return (c ^ g) >>> 0;
}
function xxteaDecryptWords(v, key) {
  const n = v.length;
  if (n < 2) return v.slice();
  const DELTA = 0x9e3779b9;
  let rounds = 6 + Math.floor(52 / n);
  let sum = (rounds * DELTA) >>> 0;
  let y = v[0];
  let z;
  while (rounds-- > 0) {
    const e = (sum >>> 2) & 3;
    for (let p = n - 1; p > 0; p--) {
      z = v[p - 1];
      v[p] = (v[p] - xxteaMx(sum, y, z, p, e, key)) >>> 0;
      y = v[p];
    }
    z = v[n - 1];
    v[0] = (v[0] - xxteaMx(sum, y, z, 0, e, key)) >>> 0;
    y = v[0];
    sum = (sum - DELTA) >>> 0;
  }
  return v;
}

function xxteaDecodeBytes(cipherBytes, keyBytes) {
  const key4 = enc.keyBytesToWords4(keyBytes);
  const words = enc.bytesToWordsLE(cipherBytes);
  const dec = xxteaDecryptWords(words, key4);
  const origLen = dec[0];
  const dataWords = dec.slice(1);
  const bytes = enc.wordsToBytesLE(dataWords);
  return bytes.slice(0, origLen);
}

function bytesEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const testStrings = [
  'Hello, World!', 'café résumé 日本語 emoji: 🎉🚀', '', 'a', 'ab', 'abc', 'abcd', 'abcde',
  'The quick brown fox jumps over the lazy dog, repeatedly, many times, to make a longer string for testing block boundaries.',
  'special chars: \x01\x02\x7f\xff'
];
const keyBytes = [12, 200, 55, 9, 163, 71, 240, 3, 88, 201];

let allPass = true;
console.log('--- XXTEA round-trip ---');
for (const s of testStrings) {
  const bytes = enc.stringToBytes(s);
  const encBytes = enc.xxteaEncodeBytes(bytes, keyBytes);
  const decBytes = xxteaDecodeBytes(encBytes, keyBytes);
  const pass = bytesEqual(bytes, decBytes);
  if (!pass) allPass = false;
  console.log(JSON.stringify(s).slice(0, 50), '|', pass);
}

console.log('--- LCG round-trip (symmetric XOR keystream) ---');
for (const s of testStrings) {
  const bytes = enc.stringToBytes(s);
  const encBytes = enc.lcgEncodeBytes(bytes, keyBytes);
  const decBytes = enc.lcgEncodeBytes(encBytes, keyBytes); // symmetric: encode again = decode
  const pass = bytesEqual(bytes, decBytes);
  if (!pass) allPass = false;
  console.log(JSON.stringify(s).slice(0, 50), '|', pass);
}

console.log('--- ChaCha20 round-trip (symmetric XOR keystream) ---');
const nonce = [111, 222, 333];
for (const s of testStrings) {
  const bytes = enc.stringToBytes(s);
  const encBytes = enc.chacha20EncodeBytes(bytes, keyBytes, nonce);
  const decBytes = enc.chacha20EncodeBytes(encBytes, keyBytes, nonce);
  const pass = bytesEqual(bytes, decBytes);
  if (!pass) allPass = false;
  console.log(JSON.stringify(s).slice(0, 50), '|', pass);
}

console.log('\nALL NEW CIPHERS JS-SIDE ROUND-TRIP PASS:', allPass);
