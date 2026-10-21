'use strict';

const KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
  'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return',
  'then', 'true', 'until', 'while', 'continue'
]);

const PUNCT_3 = ['...', '..=', '//='];
const PUNCT_2 = ['==', '~=', '<=', '>=', '..', '::', '+=', '-=', '*=', '/=', '%=', '^=', '->'];
const PUNCT_1 = ['+', '-', '*', '/', '%', '^', '#', '<', '>', '=', '(', ')', '{', '}', '[', ']',
  ';', ':', ',', '.', '&', '|', '?', '~'];

class LexError extends Error {
  constructor(message, line, col) {
    super(`${message} (line ${line}, col ${col})`);
    this.line = line;
    this.col = col;
  }
}

class Lexer {
  constructor(source) {
    this.src = source;
    this.pos = 0;
    this.line = 1;
    this.col = 1;
    this.len = source.length;
  }

  error(msg) {
    throw new LexError(msg, this.line, this.col);
  }

  peekChar(offset = 0) {
    return this.src[this.pos + offset];
  }

  advance() {
    const ch = this.src[this.pos];
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  match(str) {
    return this.src.startsWith(str, this.pos);
  }

  isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  isHexDigit(ch) {
    return this.isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
  }

  isAlpha(ch) {
    return ch === '_' || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  }

  isAlphaNum(ch) {
    return this.isAlpha(ch) || this.isDigit(ch);
  }

  skipWhitespaceAndComments() {
    for (;;) {
      const ch = this.peekChar();
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance();
        continue;
      }
      if (this.match('--')) {
        this.pos += 2;
        this.col += 2;
        const level = this.tryLongBracketLevel();
        if (level !== null) {
          this.readLongBracket(level);
        } else {
          while (this.pos < this.len && this.peekChar() !== '\n') this.advance();
        }
        continue;
      }
      break;
    }
  }

  tryLongBracketLevel() {
    if (this.peekChar() !== '[') return null;
    let i = this.pos + 1;
    let level = 0;
    while (this.src[i] === '=') {
      level++;
      i++;
    }
    if (this.src[i] === '[') {
      const consumed = i + 1 - this.pos;
      for (let k = 0; k < consumed; k++) this.advance();
      return level;
    }
    return null;
  }

  readLongBracket(level) {
    if (this.peekChar() === '\n') this.advance();
    const closer = ']' + '='.repeat(level) + ']';
    const start = this.pos;
    const idx = this.src.indexOf(closer, this.pos);
    if (idx === -1) this.error('unterminated long bracket');
    const content = this.src.slice(start, idx);
    for (let i = start; i < idx + closer.length; i++) this.advance();
    return content;
  }

  readNumber() {
    const startLine = this.line, startCol = this.col;
    let raw = '';
    if (this.peekChar() === '0' && (this.peekChar(1) === 'x' || this.peekChar(1) === 'X')) {
      raw += this.advance();
      raw += this.advance();
      while (this.isHexDigit(this.peekChar()) || this.peekChar() === '_') raw += this.advance();
      if (this.peekChar() === '.') {
        raw += this.advance();
        while (this.isHexDigit(this.peekChar()) || this.peekChar() === '_') raw += this.advance();
      }
      if (this.peekChar() === 'p' || this.peekChar() === 'P') {
        raw += this.advance();
        if (this.peekChar() === '+' || this.peekChar() === '-') raw += this.advance();
        while (this.isDigit(this.peekChar())) raw += this.advance();
      }
      const clean = raw.replace(/_/g, '');
      return { type: 'Number', value: Number(clean), raw, line: startLine, col: startCol };
    }
    if (this.peekChar() === '0' && (this.peekChar(1) === 'b' || this.peekChar(1) === 'B')) {
      raw += this.advance();
      raw += this.advance();
      let bits = '';
      while (this.peekChar() === '0' || this.peekChar() === '1' || this.peekChar() === '_') {
        const c = this.advance();
        raw += c;
        if (c !== '_') bits += c;
      }
      return { type: 'Number', value: parseInt(bits, 2), raw, line: startLine, col: startCol };
    }
    while (this.isDigit(this.peekChar()) || this.peekChar() === '_') raw += this.advance();
    if (this.peekChar() === '.' && this.isDigit(this.peekChar(1))) {
      raw += this.advance();
      while (this.isDigit(this.peekChar()) || this.peekChar() === '_') raw += this.advance();
    } else if (this.peekChar() === '.' && !this.isDigit(this.peekChar(1)) && this.peekChar(1) !== '.') {
      raw += this.advance();
    }
    if (this.peekChar() === 'e' || this.peekChar() === 'E') {
      raw += this.advance();
      if (this.peekChar() === '+' || this.peekChar() === '-') raw += this.advance();
      while (this.isDigit(this.peekChar())) raw += this.advance();
    }
    const clean = raw.replace(/_/g, '');
    return { type: 'Number', value: Number(clean), raw, line: startLine, col: startCol };
  }

  readEscape() {
    const ch = this.advance();
    switch (ch) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'a': return '\x07';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case '\\': return '\\';
      case '"': return '"';
      case "'": return "'";
      case '\n': return '\n';
      case 'z': {
        while (/\s/.test(this.peekChar())) this.advance();
        return '';
      }
      case 'x': {
        let hex = '';
        hex += this.advance();
        hex += this.advance();
        return String.fromCharCode(parseInt(hex, 16));
      }
      case 'u': {
        if (this.peekChar() === '{') {
          this.advance();
          let hex = '';
          while (this.peekChar() !== '}') hex += this.advance();
          this.advance();
          return String.fromCodePoint(parseInt(hex, 16));
        }
        return 'u';
      }
      default: {
        if (this.isDigit(ch)) {
          let dec = ch;
          for (let i = 0; i < 2 && this.isDigit(this.peekChar()); i++) dec += this.advance();
          return String.fromCharCode(parseInt(dec, 10));
        }
        return ch;
      }
    }
  }

  readQuotedString(quote) {
    const startLine = this.line, startCol = this.col;
    this.advance();
    let value = '';
    while (this.peekChar() !== quote) {
      if (this.pos >= this.len) this.error('unterminated string');
      if (this.peekChar() === '\n') this.error('unterminated string');
      if (this.peekChar() === '\\') {
        this.advance();
        value += this.readEscape();
      } else {
        value += this.advance();
      }
    }
    this.advance();
    return { type: 'String', value, line: startLine, col: startCol };
  }

  readInterpString() {
    const startLine = this.line, startCol = this.col;
    this.advance();
    const parts = [];
    let strBuf = '';
    while (this.peekChar() !== '`') {
      if (this.pos >= this.len) this.error('unterminated interpolated string');
      if (this.peekChar() === '\\') {
        this.advance();
        strBuf += this.readEscape();
        continue;
      }
      if (this.peekChar() === '{') {
        parts.push({ kind: 'string', value: strBuf });
        strBuf = '';
        this.advance();
        let depth = 1;
        let exprSrc = '';
        while (depth > 0) {
          if (this.pos >= this.len) this.error('unterminated interpolation expression');
          const c = this.peekChar();
          if (c === '{') depth++;
          if (c === '}') {
            depth--;
            if (depth === 0) {
              this.advance();
              break;
            }
          }
          exprSrc += this.advance();
        }
        parts.push({ kind: 'expr', source: exprSrc });
        continue;
      }
      strBuf += this.advance();
    }
    parts.push({ kind: 'string', value: strBuf });
    this.advance();
    return { type: 'InterpString', parts, line: startLine, col: startCol };
  }

  readIdentifier() {
    const startLine = this.line, startCol = this.col;
    let name = '';
    while (this.isAlphaNum(this.peekChar())) name += this.advance();
    const type = KEYWORDS.has(name) ? 'Keyword' : 'Identifier';
    return { type, value: name, line: startLine, col: startCol };
  }

  next() {
    this.skipWhitespaceAndComments();
    const startLine = this.line, startCol = this.col;
    if (this.pos >= this.len) return { type: 'EOF', value: null, line: startLine, col: startCol };

    const ch = this.peekChar();

    if (this.isDigit(ch) || (ch === '.' && this.isDigit(this.peekChar(1)))) {
      return this.readNumber();
    }

    if (this.isAlpha(ch)) {
      return this.readIdentifier();
    }

    if (ch === '"' || ch === "'") {
      return this.readQuotedString(ch);
    }

    if (ch === '`') {
      return this.readInterpString();
    }

    if (ch === '[') {
      const save = { pos: this.pos, line: this.line, col: this.col };
      const level = this.tryLongBracketLevel();
      if (level !== null) {
        const content = this.readLongBracket(level);
        return { type: 'String', value: content, line: save.line, col: save.col, isLong: true, level };
      }
      this.pos = save.pos;
      this.line = save.line;
      this.col = save.col;
    }

    for (const p of PUNCT_3) {
      if (this.match(p)) {
        for (let i = 0; i < p.length; i++) this.advance();
        return { type: 'Punct', value: p, line: startLine, col: startCol };
      }
    }
    for (const p of PUNCT_2) {
      if (this.match(p)) {
        for (let i = 0; i < p.length; i++) this.advance();
        return { type: 'Punct', value: p, line: startLine, col: startCol };
      }
    }
    for (const p of PUNCT_1) {
      if (this.match(p)) {
        this.advance();
        return { type: 'Punct', value: p, line: startLine, col: startCol };
      }
    }

    this.error(`unexpected character '${ch}'`);
  }

  tokenize() {
    const tokens = [];
    for (;;) {
      const tok = this.next();
      tokens.push(tok);
      if (tok.type === 'EOF') break;
    }
    return tokens;
  }
}

module.exports = { Lexer, LexError, KEYWORDS };
