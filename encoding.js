'use strict';

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function stringToBytes(str) {
  return Array.from(new TextEncoder().encode(str));
}

function bytesToBinaryString(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

function base64EncodeBytes(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const has1 = b1 !== undefined;
    const has2 = b2 !== undefined;
    const n = (b0 << 16) | ((has1 ? b1 : 0) << 8) | (has2 ? b2 : 0);
    out += B64_CHARS[(n >> 18) & 63];
    out += B64_CHARS[(n >> 12) & 63];
    out += has1 ? B64_CHARS[(n >> 6) & 63] : '=';
    out += has2 ? B64_CHARS[n & 63] : '=';
  }
  return out;
}

function xorEncodeBytes(bytes, keyBytes) {
  return bytes.map((b, i) => b ^ keyBytes[i % keyBytes.length]);
}

function rc4KeystreamAndEncode(bytes, keyBytes) {
  const S = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + keyBytes[i % keyBytes.length]) % 256;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
  }
  let i2 = 0;
  let j2 = 0;
  const out = [];
  for (let n = 0; n < bytes.length; n++) {
    i2 = (i2 + 1) % 256;
    j2 = (j2 + S[i2]) % 256;
    const tmp = S[i2];
    S[i2] = S[j2];
    S[j2] = tmp;
    const k = S[(S[i2] + S[j2]) % 256];
    out.push(bytes[n] ^ k);
  }
  return out;
}

const MOD32 = 4294967296;

function lcgSeedFromKey(keyBytes) {
  let seed = 0;
  for (let i = 0; i < keyBytes.length; i++) {
    seed = (seed + keyBytes[i] * (i + 1)) % MOD32;
  }
  return seed || 1;
}

function lcgKeystreamBytes(length, seed) {
  let x = seed;
  const out = [];
  for (let i = 0; i < length; i++) {
    x = (x * 1664525 + 1013904223) % MOD32;
    out.push(Math.floor(x / 16777216) % 256);
  }
  return out;
}

function lcgEncodeBytes(bytes, keyBytes) {
  const seed = lcgSeedFromKey(keyBytes);
  const stream = lcgKeystreamBytes(bytes.length, seed);
  return bytes.map((b, i) => b ^ stream[i]);
}

function keyBytesToWords4(keyBytes) {
  const k16 = [];
  for (let i = 0; i < 16; i++) k16.push(keyBytes[i % keyBytes.length]);
  return bytesToWordsLE(k16);
}

function bytesToWordsLE(bytes) {
  const words = [];
  for (let i = 0; i < bytes.length; i += 4) {
    const b0 = bytes[i] || 0, b1 = bytes[i + 1] || 0, b2 = bytes[i + 2] || 0, b3 = bytes[i + 3] || 0;
    words.push((b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0);
  }
  return words;
}

function wordsToBytesLE(words) {
  const bytes = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    bytes.push(w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff, (w >>> 24) & 0xff);
  }
  return bytes;
}

function xxteaMx(sum, y, z, p, e, key) {
  const a = ((z >>> 5) ^ (y << 2)) >>> 0;
  const b = ((y >>> 3) ^ (z << 4)) >>> 0;
  const c = (a + b) >>> 0;
  const d = (sum ^ y) >>> 0;
  const f = (key[(p & 3) ^ e] ^ z) >>> 0;
  const g = (d + f) >>> 0;
  return (c ^ g) >>> 0;
}

function xxteaEncryptWords(v, key) {
  const n = v.length;
  if (n < 2) return v.slice();
  const DELTA = 0x9e3779b9;
  let sum = 0;
  let z = v[n - 1];
  let rounds = 6 + Math.floor(52 / n);
  let y;
  while (rounds-- > 0) {
    sum = (sum + DELTA) >>> 0;
    const e = (sum >>> 2) & 3;
    for (let p = 0; p < n - 1; p++) {
      y = v[p + 1];
      v[p] = (v[p] + xxteaMx(sum, y, z, p, e, key)) >>> 0;
      z = v[p];
    }
    y = v[0];
    v[n - 1] = (v[n - 1] + xxteaMx(sum, y, z, n - 1, e, key)) >>> 0;
    z = v[n - 1];
  }
  return v;
}

function xxteaEncodeBytes(plainBytes, keyBytes) {
  const key4 = keyBytesToWords4(keyBytes);
  const padded = plainBytes.slice();
  while (padded.length % 4 !== 0) padded.push(0);
  const dataWords = bytesToWordsLE(padded);
  const words = [plainBytes.length >>> 0].concat(dataWords);
  const enc = xxteaEncryptWords(words, key4);
  return wordsToBytesLE(enc);
}

const CHACHA_CONST = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];

function rotl32(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function chachaQuarterRound(s, a, b, c, d) {
  s[a] = (s[a] + s[b]) >>> 0; s[d] = rotl32((s[d] ^ s[a]) >>> 0, 16);
  s[c] = (s[c] + s[d]) >>> 0; s[b] = rotl32((s[b] ^ s[c]) >>> 0, 12);
  s[a] = (s[a] + s[b]) >>> 0; s[d] = rotl32((s[d] ^ s[a]) >>> 0, 8);
  s[c] = (s[c] + s[d]) >>> 0; s[b] = rotl32((s[b] ^ s[c]) >>> 0, 7);
}

function keyBytesToWords8(keyBytes) {
  const k32 = [];
  for (let i = 0; i < 32; i++) k32.push(keyBytes[i % keyBytes.length]);
  return bytesToWordsLE(k32);
}

function chachaBlock(keyWords8, counter, nonceWords3) {
  const state = CHACHA_CONST.concat(keyWords8, [counter], nonceWords3);
  const working = state.slice();
  for (let i = 0; i < 10; i++) {
    chachaQuarterRound(working, 0, 4, 8, 12);
    chachaQuarterRound(working, 1, 5, 9, 13);
    chachaQuarterRound(working, 2, 6, 10, 14);
    chachaQuarterRound(working, 3, 7, 11, 15);
    chachaQuarterRound(working, 0, 5, 10, 15);
    chachaQuarterRound(working, 1, 6, 11, 12);
    chachaQuarterRound(working, 2, 7, 8, 13);
    chachaQuarterRound(working, 3, 4, 9, 14);
  }
  const out = [];
  for (let i = 0; i < 16; i++) out.push((working[i] + state[i]) >>> 0);
  return wordsToBytesLE(out);
}

function chacha20KeystreamBytes(length, keyBytes, nonceWords3) {
  const keyWords8 = keyBytesToWords8(keyBytes);
  const out = [];
  let counter = 1;
  while (out.length < length) {
    const block = chachaBlock(keyWords8, counter, nonceWords3);
    for (let i = 0; i < block.length && out.length < length; i++) out.push(block[i]);
    counter = (counter + 1) >>> 0;
  }
  return out;
}

function chacha20EncodeBytes(bytes, keyBytes, nonceWords3) {
  const stream = chacha20KeystreamBytes(bytes.length, keyBytes, nonceWords3);
  return bytes.map((b, i) => b ^ stream[i]);
}

function encodeStringForArray(str, encoding, keyBytes, extra) {
  const bytes = stringToBytes(str);
  if (encoding === 'base64') {
    return base64EncodeBytes(bytes);
  }
  if (encoding === 'xor') {
    return bytesToBinaryString(xorEncodeBytes(bytes, keyBytes));
  }
  if (encoding === 'rc4') {
    return bytesToBinaryString(rc4KeystreamAndEncode(bytes, keyBytes));
  }
  if (encoding === 'lcg') {
    return bytesToBinaryString(lcgEncodeBytes(bytes, keyBytes));
  }
  if (encoding === 'xxtea') {
    return bytesToBinaryString(xxteaEncodeBytes(bytes, keyBytes));
  }
  if (encoding === 'chacha20') {
    return bytesToBinaryString(chacha20EncodeBytes(bytes, keyBytes, (extra && extra.nonceWords3) || [0, 0, 0]));
  }
  return str;
}

module.exports = {
  stringToBytes, bytesToBinaryString, base64EncodeBytes,
  xorEncodeBytes, rc4KeystreamAndEncode, encodeStringForArray,
  lcgSeedFromKey, lcgKeystreamBytes, lcgEncodeBytes,
  xxteaEncodeBytes, keyBytesToWords4, bytesToWordsLE, wordsToBytesLE,
  chacha20EncodeBytes, chacha20KeystreamBytes, keyBytesToWords8, MOD32
};
