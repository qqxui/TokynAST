'use strict';

const MANGLED_CHARS = ['I', 'l', '1', 'O', '0', 'o'];
const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function base26Name(n) {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let s = '';
  let v = n + 1;
  while (v > 0) {
    v -= 1;
    s = letters[v % 26] + s;
    v = Math.floor(v / 26);
  }
  return s;
}

class NameGenerator {
  constructor(options) {
    this.mode = (options && options.mode) || 'mangled';
    this.rng = options.rng;
    this.used = new Set(['self']);
    this.minifyCounter = 0;
    let prefix = (options && options.prefix) || '';
    if (options && options.randomPrefix) {
      prefix = (prefix ? prefix + '_' : '_') + this.randAlpha(4);
    }
    this.prefix = prefix;
    this.mangledPool = this.mode === 'mangled-shuffle'
      ? this.rng.shuffle(MANGLED_CHARS)
      : MANGLED_CHARS.slice();
  }

  randAlpha(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += ALPHA[this.rng.int(0, ALPHA.length)];
    return s;
  }

  generateRaw() {
    switch (this.mode) {
      case 'hex': {
        let s = '_0x';
        const len = 4 + this.rng.int(0, 3);
        for (let i = 0; i < len; i++) s += '0123456789abcdef'[this.rng.int(0, 16)];
        return s;
      }
      case 'minify':
        return base26Name(this.minifyCounter++);
      case 'mangled':
      case 'mangled-shuffle':
      default: {
        const len = 6 + this.rng.int(0, 5);
        let s = '';
        for (let i = 0; i < len; i++) s += this.mangledPool[this.rng.int(0, this.mangledPool.length)];
        if (!/^[A-Za-z_]/.test(s)) s = 'I' + s;
        return s;
      }
    }
  }

  next() {
    for (;;) {
      const raw = this.generateRaw();
      const full = this.mode === 'minify' ? raw : (this.prefix ? this.prefix + raw : raw);
      if (!this.used.has(full)) {
        this.used.add(full);
        return full;
      }
    }
  }

  reserve(name) {
    this.used.add(name);
  }
}

module.exports = { NameGenerator, base26Name };
