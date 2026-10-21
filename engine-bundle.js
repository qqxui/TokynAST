/* ===== Tokyn AST engine bundle (generated from src/, do not hand-edit) ===== */
const Mod_lexer = (function() {
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

return { Lexer, LexError, KEYWORDS };

})();

const Mod_ast = (function() {
function transformExpr(expr, visitor) {
  if (!expr) return expr;
  const replaced = (visitor.expr && visitor.expr(expr)) || expr;
  switch (replaced.type) {
    case 'BinaryExpression':
      replaced.left = transformExpr(replaced.left, visitor);
      replaced.right = transformExpr(replaced.right, visitor);
      break;
    case 'UnaryExpression':
      replaced.argument = transformExpr(replaced.argument, visitor);
      break;
    case 'MemberExpression':
      replaced.object = transformExpr(replaced.object, visitor);
      if (replaced.computed) replaced.property = transformExpr(replaced.property, visitor);
      break;
    case 'CallExpression':
      replaced.callee = transformExpr(replaced.callee, visitor);
      replaced.args = replaced.args.map((a) => transformExpr(a, visitor));
      break;
    case 'MethodCallExpression':
      replaced.object = transformExpr(replaced.object, visitor);
      replaced.args = replaced.args.map((a) => transformExpr(a, visitor));
      break;
    case 'ParenExpression':
      replaced.expression = transformExpr(replaced.expression, visitor);
      break;
    case 'TableConstructor':
      replaced.fields = replaced.fields.map((f) => {
        const nf = Object.assign({}, f);
        if (nf.kind === 'key') nf.key = transformExpr(nf.key, visitor);
        nf.value = transformExpr(nf.value, visitor);
        return nf;
      });
      break;
    case 'FunctionExpression':
      replaced.body = transformStatements(replaced.body, visitor);
      break;
    case 'IfExpression':
      replaced.clauses = replaced.clauses.map((c) => ({
        condition: transformExpr(c.condition, visitor),
        body: transformExpr(c.body, visitor)
      }));
      replaced.elseBody = transformExpr(replaced.elseBody, visitor);
      break;
    case 'StringInterpolation':
      replaced.parts = replaced.parts.map((p) =>
        p.kind === 'expr' ? { kind: 'expr', expr: transformExpr(p.expr, visitor) } : p
      );
      break;
    default:
      break;
  }
  return replaced;
}

function transformStatement(stmt, visitor) {
  const replaced = (visitor.statement && visitor.statement(stmt)) || stmt;
  const vexpr = (e) => transformExpr(e, visitor);
  switch (replaced.type) {
    case 'LocalStatement':
      replaced.init = replaced.init.map(vexpr);
      break;
    case 'AssignmentStatement':
      replaced.targets = replaced.targets.map(vexpr);
      replaced.init = replaced.init.map(vexpr);
      break;
    case 'CallStatement':
      replaced.call = vexpr(replaced.call);
      break;
    case 'DoStatement':
      replaced.body = transformStatements(replaced.body, visitor);
      break;
    case 'WhileStatement':
      replaced.condition = vexpr(replaced.condition);
      replaced.body = transformStatements(replaced.body, visitor);
      break;
    case 'RepeatStatement':
      replaced.body = transformStatements(replaced.body, visitor);
      replaced.condition = vexpr(replaced.condition);
      break;
    case 'IfStatement':
      replaced.clauses = replaced.clauses.map((c) => ({
        condition: c.condition ? vexpr(c.condition) : null,
        body: transformStatements(c.body, visitor)
      }));
      break;
    case 'NumericForStatement':
      replaced.start = vexpr(replaced.start);
      replaced.limit = vexpr(replaced.limit);
      replaced.step = replaced.step ? vexpr(replaced.step) : null;
      replaced.body = transformStatements(replaced.body, visitor);
      break;
    case 'GenericForStatement':
      replaced.exprs = replaced.exprs.map(vexpr);
      replaced.body = transformStatements(replaced.body, visitor);
      break;
    case 'FunctionDeclaration':
      replaced.body = transformStatements(replaced.body, visitor);
      break;
    case 'ReturnStatement':
      replaced.args = replaced.args.map(vexpr);
      break;
    default:
      break;
  }
  return replaced;
}

function transformStatements(stmts, visitor) {
  const out = [];
  for (const stmt of stmts) {
    const r = transformStatement(stmt, visitor);
    if (Array.isArray(r)) out.push(...r);
    else if (r) out.push(r);
  }
  return out;
}

function cloneShallow(node) {
  return Object.assign({}, node);
}

return { transformExpr, transformStatement, transformStatements, cloneShallow };

})();

const Mod_rng = (function() {
function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return (seed >>> 0) || 1;
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

class RNG {
  constructor(seed) {
    const resolved = seed === undefined || seed === null || seed === ''
      ? `${Date.now()}_${Math.random()}`
      : seed;
    this.state = hashSeed(resolved);
  }

  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min)) + min;
  }

  bool(p) {
    return this.next() < (p === undefined ? 0.5 : p);
  }

  pick(arr) {
    return arr[this.int(0, arr.length)];
  }

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }
}

return { RNG, hashSeed };

})();

const Mod_name_generator = (function() {
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

return { NameGenerator, base26Name };

})();

const Mod_scope = (function() {
class Scope {
  constructor(parent) {
    this.parent = parent;
    this.bindings = new Map();
  }

  declare(name, kind) {
    const binding = { name, kind, newName: null };
    this.bindings.set(name, binding);
    return binding;
  }

  resolve(name) {
    let s = this;
    while (s) {
      if (s.bindings.has(name)) return s.bindings.get(name);
      s = s.parent;
    }
    return null;
  }
}

class Binder {
  constructor() {
    this.globalsAssigned = new Set();
    this.globalsReferenced = new Set();
    this.allBindings = [];
  }

  bindChunk(chunk) {
    const root = new Scope(null);
    this.visitStatements(chunk.body, root);
    return root;
  }

  declareBinding(scope, name, kind) {
    const b = scope.declare(name, kind);
    this.allBindings.push(b);
    return b;
  }

  visitStatements(stmts, scope) {
    for (const stmt of stmts) this.visitStatement(stmt, scope);
  }

  visitStatement(stmt, scope) {
    switch (stmt.type) {
      case 'LocalStatement':
        for (const e of stmt.init) this.visitExpr(e, scope);
        stmt.names.forEach((n) => {
          n.$binding = this.declareBinding(scope, n.name, 'local');
        });
        break;
      case 'AssignmentStatement':
        for (const e of stmt.init) this.visitExpr(e, scope);
        for (const t of stmt.targets) this.visitAssignTarget(t, scope);
        break;
      case 'CallStatement':
        this.visitExpr(stmt.call, scope);
        break;
      case 'DoStatement':
        this.visitStatements(stmt.body, new Scope(scope));
        break;
      case 'WhileStatement':
        this.visitExpr(stmt.condition, scope);
        this.visitStatements(stmt.body, new Scope(scope));
        break;
      case 'RepeatStatement': {
        const inner = new Scope(scope);
        this.visitStatements(stmt.body, inner);
        this.visitExpr(stmt.condition, inner);
        break;
      }
      case 'IfStatement':
        for (const clause of stmt.clauses) {
          if (clause.condition) this.visitExpr(clause.condition, scope);
          this.visitStatements(clause.body, new Scope(scope));
        }
        break;
      case 'NumericForStatement': {
        this.visitExpr(stmt.start, scope);
        this.visitExpr(stmt.limit, scope);
        if (stmt.step) this.visitExpr(stmt.step, scope);
        const inner = new Scope(scope);
        stmt.$varBinding = this.declareBinding(inner, stmt.variable, 'for');
        this.visitStatements(stmt.body, inner);
        break;
      }
      case 'GenericForStatement': {
        for (const e of stmt.exprs) this.visitExpr(e, scope);
        const inner = new Scope(scope);
        stmt.$varBindings = stmt.names.map((n) => this.declareBinding(inner, n, 'for'));
        this.visitStatements(stmt.body, inner);
        break;
      }
      case 'FunctionDeclaration':
        if (stmt.isLocal) {
          stmt.target.$binding = this.declareBinding(scope, stmt.target.name, 'local');
          this.visitFunctionBody(stmt, scope);
        } else {
          this.visitAssignTarget(stmt.target, scope);
          this.visitFunctionBody(stmt, scope);
        }
        break;
      case 'ReturnStatement':
        for (const e of stmt.args) this.visitExpr(e, scope);
        break;
      default:
        break;
    }
  }

  visitFunctionBody(fn, enclosingScope) {
    const inner = new Scope(enclosingScope);
    fn.$paramBindings = fn.params.map((p) => {
      const b = this.declareBinding(inner, p.name, 'param');
      if (p.implicit) b.protected = true;
      return b;
    });
    this.visitStatements(fn.body, inner);
  }

  visitAssignTarget(target, scope) {
    if (target.type === 'Identifier') {
      const binding = scope.resolve(target.name);
      if (binding) {
        target.$binding = binding;
      } else {
        this.globalsAssigned.add(target.name);
        target.$global = target.name;
      }
    } else {
      this.visitExpr(target, scope);
    }
  }

  visitExpr(expr, scope) {
    if (!expr) return;
    switch (expr.type) {
      case 'Identifier': {
        const binding = scope.resolve(expr.name);
        if (binding) {
          expr.$binding = binding;
        } else {
          this.globalsReferenced.add(expr.name);
          expr.$global = expr.name;
        }
        break;
      }
      case 'BinaryExpression':
        this.visitExpr(expr.left, scope);
        this.visitExpr(expr.right, scope);
        break;
      case 'UnaryExpression':
        this.visitExpr(expr.argument, scope);
        break;
      case 'MemberExpression':
        this.visitExpr(expr.object, scope);
        if (expr.computed) this.visitExpr(expr.property, scope);
        break;
      case 'CallExpression':
        this.visitExpr(expr.callee, scope);
        expr.args.forEach((a) => this.visitExpr(a, scope));
        break;
      case 'MethodCallExpression':
        this.visitExpr(expr.object, scope);
        expr.args.forEach((a) => this.visitExpr(a, scope));
        break;
      case 'ParenExpression':
        this.visitExpr(expr.expression, scope);
        break;
      case 'TableConstructor':
        expr.fields.forEach((f) => {
          if (f.kind === 'key') this.visitExpr(f.key, scope);
          this.visitExpr(f.value, scope);
        });
        break;
      case 'FunctionExpression':
        this.visitFunctionBody(expr, scope);
        break;
      case 'IfExpression':
        expr.clauses.forEach((c) => {
          this.visitExpr(c.condition, scope);
          this.visitExpr(c.body, scope);
        });
        this.visitExpr(expr.elseBody, scope);
        break;
      case 'StringInterpolation':
        expr.parts.forEach((p) => {
          if (p.kind === 'expr') this.visitExpr(p.expr, scope);
        });
        break;
      default:
        break;
    }
  }
}

return { Scope, Binder };

})();

const Mod_utils_encoding = (function() {
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

return {
  stringToBytes, bytesToBinaryString, base64EncodeBytes,
  xorEncodeBytes, rc4KeystreamAndEncode, encodeStringForArray,
  lcgSeedFromKey, lcgKeystreamBytes, lcgEncodeBytes,
  xxteaEncodeBytes, keyBytesToWords4, bytesToWordsLE, wordsToBytesLE,
  chacha20EncodeBytes, chacha20KeystreamBytes, keyBytesToWords8, MOD32
};

})();

const Mod_parser = (function() {
const { Lexer } = Mod_lexer;

const BIN_PREC = {
  or: 1, and: 2,
  '<': 3, '>': 3, '<=': 3, '>=': 3, '~=': 3, '==': 3,
  '..': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '//': 6, '%': 6,
  '^': 8
};
const RIGHT_ASSOC = new Set(['..', '^']);
const UNARY_PREC = 7;
const BLOCK_END = new Set(['end', 'else', 'elseif', 'until']);
const COMPOUND_OPS = new Set(['+=', '-=', '*=', '/=', '%=', '^=', '..=', '//=']);
const TYPE_PRIMITIVES = new Set(['nil', 'true', 'false']);

class ParseError extends Error {
  constructor(message, line, col) {
    super(`${message} (line ${line}, col ${col})`);
    this.line = line;
    this.col = col;
  }
}

class Parser {
  constructor(source) {
    this.source = source;
    this.tokens = new Lexer(source).tokenize();
    this.pos = 0;
  }

  peek(offset = 0) {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  advance() {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }

  error(msg) {
    const t = this.peek();
    throw new ParseError(msg, t.line, t.col);
  }

  isKeyword(tok, value) {
    return tok.type === 'Keyword' && tok.value === value;
  }

  isPunct(tok, value) {
    return tok.type === 'Punct' && tok.value === value;
  }

  checkKeyword(value) {
    return this.isKeyword(this.peek(), value);
  }

  checkPunct(value) {
    return this.isPunct(this.peek(), value);
  }

  expectPunct(value) {
    if (!this.checkPunct(value)) this.error(`expected '${value}'`);
    return this.advance();
  }

  expectKeyword(value) {
    if (!this.checkKeyword(value)) this.error(`expected '${value}'`);
    return this.advance();
  }

  expectName() {
    const t = this.peek();
    if (t.type !== 'Identifier') this.error('expected identifier');
    this.advance();
    return t.value;
  }

  isBlockEnd(tok) {
    return tok.type === 'EOF' || (tok.type === 'Keyword' && BLOCK_END.has(tok.value));
  }

  parseChunk() {
    const body = this.parseBlock();
    if (this.peek().type !== 'EOF') this.error('unexpected token after chunk');
    return { type: 'Chunk', body };
  }

  parseBlock() {
    const body = [];
    while (!this.isBlockEnd(this.peek())) {
      const stmt = this.parseStatement();
      if (stmt) body.push(stmt);
      if (stmt && stmt.type === 'ReturnStatement') break;
    }
    return body;
  }

  parseStatement() {
    const startLine = this.peek().line;
    const stmt = this.parseStatementInner();
    if (stmt) stmt.$line = startLine;
    return stmt;
  }

  parseStatementInner() {
    const tok = this.peek();

    if (this.isPunct(tok, ';')) {
      this.advance();
      return null;
    }

    if (this.isPunct(tok, '::')) return this.parseLabelStatement();

    if (tok.type === 'Keyword') {
      switch (tok.value) {
        case 'break': this.advance(); return { type: 'BreakStatement' };
        case 'continue': this.advance(); return { type: 'ContinueStatement' };
        case 'goto': {
          this.advance();
          const label = this.expectName();
          return { type: 'GotoStatement', label };
        }
        case 'do': {
          this.advance();
          const body = this.parseBlock();
          this.expectKeyword('end');
          return { type: 'DoStatement', body };
        }
        case 'while': return this.parseWhileStatement();
        case 'repeat': return this.parseRepeatStatement();
        case 'if': return this.parseIfStatement();
        case 'for': return this.parseForStatement();
        case 'function': return this.parseFunctionDeclaration();
        case 'local': return this.parseLocalStatementOrFunction();
        case 'return': return this.parseReturnStatement();
        default: break;
      }
    }

    if (tok.type === 'Identifier' && tok.value === 'export' &&
        this.peek(1).type === 'Identifier' && this.peek(1).value === 'type') {
      this.advance();
      return this.parseTypeAliasStatement();
    }
    if (tok.type === 'Identifier' && tok.value === 'type' &&
        this.peek(1).type === 'Identifier') {
      return this.parseTypeAliasStatement();
    }

    return this.parseExprStatement();
  }

  parseTypeAliasStatement() {
    this.advance();
    this.expectName();
    if (this.checkPunct('<')) this.skipAngleGenerics();
    this.expectPunct('=');
    this.skipTypeAnnotation();
    return null;
  }

  skipAngleGenerics() {
    this.expectPunct('<');
    let depth = 1;
    while (depth > 0) {
      const t = this.peek();
      if (t.type === 'EOF') this.error('unterminated generics list');
      if (this.isPunct(t, '<')) depth++;
      else if (this.isPunct(t, '>')) depth--;
      this.advance();
    }
  }

  parseLabelStatement() {
    this.expectPunct('::');
    const name = this.expectName();
    this.expectPunct('::');
    return { type: 'LabelStatement', name };
  }

  parseWhileStatement() {
    this.advance();
    const condition = this.parseExpr(0);
    this.expectKeyword('do');
    const body = this.parseBlock();
    this.expectKeyword('end');
    return { type: 'WhileStatement', condition, body };
  }

  parseRepeatStatement() {
    this.advance();
    const body = this.parseBlock();
    this.expectKeyword('until');
    const condition = this.parseExpr(0);
    return { type: 'RepeatStatement', body, condition };
  }

  parseIfStatement() {
    this.advance();
    const clauses = [];
    let condition = this.parseExpr(0);
    this.expectKeyword('then');
    let body = this.parseBlock();
    clauses.push({ condition, body });
    while (this.checkKeyword('elseif')) {
      this.advance();
      condition = this.parseExpr(0);
      this.expectKeyword('then');
      body = this.parseBlock();
      clauses.push({ condition, body });
    }
    if (this.checkKeyword('else')) {
      this.advance();
      body = this.parseBlock();
      clauses.push({ condition: null, body });
    }
    this.expectKeyword('end');
    return { type: 'IfStatement', clauses };
  }

  parseForStatement() {
    this.advance();
    const name1 = this.expectName();
    if (this.checkPunct(':')) {
      this.advance();
      this.skipTypeAnnotation();
    }
    if (this.checkPunct('=')) {
      this.advance();
      const start = this.parseExpr(0);
      this.expectPunct(',');
      const limit = this.parseExpr(0);
      let step = null;
      if (this.checkPunct(',')) {
        this.advance();
        step = this.parseExpr(0);
      }
      this.expectKeyword('do');
      const body = this.parseBlock();
      this.expectKeyword('end');
      return { type: 'NumericForStatement', variable: name1, start, limit, step, body };
    }
    const names = [name1];
    while (this.checkPunct(',')) {
      this.advance();
      const n = this.expectName();
      if (this.checkPunct(':')) {
        this.advance();
        this.skipTypeAnnotation();
      }
      names.push(n);
    }
    this.expectKeyword('in');
    const exprs = this.parseExprList();
    this.expectKeyword('do');
    const body = this.parseBlock();
    this.expectKeyword('end');
    return { type: 'GenericForStatement', names, exprs, body };
  }

  parseFunctionDeclaration() {
    this.advance();
    let target = { type: 'Identifier', name: this.expectName() };
    let isMethod = false;
    while (this.checkPunct('.')) {
      this.advance();
      const prop = this.expectName();
      target = { type: 'MemberExpression', object: target, property: prop, computed: false };
    }
    if (this.checkPunct(':')) {
      this.advance();
      const prop = this.expectName();
      target = { type: 'MemberExpression', object: target, property: prop, computed: false };
      isMethod = true;
    }
    const fn = this.parseFunctionBody(isMethod);
    return {
      type: 'FunctionDeclaration', target, isLocal: false, isMethod,
      params: fn.params, hasVararg: fn.hasVararg, body: fn.body
    };
  }

  parseLocalStatementOrFunction() {
    this.advance();
    if (this.checkKeyword('function')) {
      this.advance();
      const name = this.expectName();
      const fn = this.parseFunctionBody(false);
      return {
        type: 'FunctionDeclaration',
        target: { type: 'Identifier', name },
        isLocal: true, isMethod: false,
        params: fn.params, hasVararg: fn.hasVararg, body: fn.body
      };
    }
    const names = [];
    for (;;) {
      const name = this.expectName();
      let attrib = null;
      if (this.checkPunct('<')) {
        this.advance();
        attrib = this.expectName();
        this.expectPunct('>');
      }
      if (this.checkPunct(':')) {
        this.advance();
        this.skipTypeAnnotation();
      }
      names.push({ name, attrib });
      if (this.checkPunct(',')) {
        this.advance();
        continue;
      }
      break;
    }
    let init = [];
    if (this.checkPunct('=')) {
      this.advance();
      init = this.parseExprList();
    }
    return { type: 'LocalStatement', names, init };
  }

  parseReturnStatement() {
    this.advance();
    let args = [];
    const t = this.peek();
    if (!this.isBlockEnd(t) && !this.isPunct(t, ';')) {
      args = this.parseExprList();
    }
    if (this.checkPunct(';')) this.advance();
    return { type: 'ReturnStatement', args };
  }

  parseExprStatement() {
    const first = this.parseSuffixedExpr(false);
    if (this.checkPunct('=') || this.checkPunct(',')) {
      const targets = [first];
      while (this.checkPunct(',')) {
        this.advance();
        targets.push(this.parseSuffixedExpr(false));
      }
      this.expectPunct('=');
      const init = this.parseExprList();
      return { type: 'AssignmentStatement', targets, init, operator: '=' };
    }
    const t = this.peek();
    if (t.type === 'Punct' && COMPOUND_OPS.has(t.value)) {
      this.advance();
      const value = this.parseExpr(0);
      return { type: 'AssignmentStatement', targets: [first], init: [value], operator: t.value };
    }
    if (first.type !== 'CallExpression' && first.type !== 'MethodCallExpression') {
      this.error('syntax error: expression used as a statement');
    }
    return { type: 'CallStatement', call: first };
  }

  parseExprList() {
    const list = [this.parseExpr(0)];
    while (this.checkPunct(',')) {
      this.advance();
      list.push(this.parseExpr(0));
    }
    return list;
  }

  parseFunctionBody(isMethod) {
    this.expectPunct('(');
    const params = [];
    let hasVararg = false;
    if (isMethod) params.push({ name: 'self', implicit: true });
    if (this.checkPunct('<')) this.skipAngleGenerics();
    if (!this.checkPunct(')')) {
      for (;;) {
        if (this.checkPunct('...')) {
          this.advance();
          hasVararg = true;
          if (this.checkPunct(':')) {
            this.advance();
            this.skipTypeAnnotation();
          }
          break;
        }
        const name = this.expectName();
        if (this.checkPunct('?')) this.advance();
        if (this.checkPunct(':')) {
          this.advance();
          this.skipTypeAnnotation();
        }
        params.push({ name });
        if (this.checkPunct(',')) {
          this.advance();
          continue;
        }
        break;
      }
    }
    this.expectPunct(')');
    if (this.checkPunct(':')) {
      this.advance();
      this.skipTypeAnnotation();
    }
    const body = this.parseBlock();
    this.expectKeyword('end');
    return { params, hasVararg, body };
  }

  skipTypeAnnotation() {
    this.skipSingleType();
    while (this.checkPunct('|') || this.checkPunct('&')) {
      this.advance();
      this.skipSingleType();
    }
  }

  skipSingleType() {
    const t = this.peek();
    if (this.isPunct(t, '(')) {
      this.advance();
      let depth = 1;
      while (depth > 0) {
        const c = this.peek();
        if (c.type === 'EOF') this.error('unterminated type');
        if (this.isPunct(c, '(')) depth++;
        else if (this.isPunct(c, ')')) depth--;
        this.advance();
      }
      if (this.checkPunct('->')) {
        this.advance();
        this.skipSingleType();
      }
    } else if (this.isPunct(t, '{')) {
      this.advance();
      let depth = 1;
      while (depth > 0) {
        const c = this.peek();
        if (c.type === 'EOF') this.error('unterminated type');
        if (this.isPunct(c, '{')) depth++;
        else if (this.isPunct(c, '}')) depth--;
        this.advance();
      }
    } else if (t.type === 'Identifier' || (t.type === 'Keyword' && TYPE_PRIMITIVES.has(t.value)) || t.type === 'String') {
      this.advance();
      while (this.checkPunct('.')) {
        this.advance();
        this.advance();
      }
      if (this.checkPunct('<')) this.skipAngleGenerics();
    } else if (t.type !== 'EOF') {
      this.advance();
    }
    if (this.checkPunct('?')) this.advance();
  }

  parseExpr(minPrec) {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      let op = null;
      if (t.type === 'Keyword' && (t.value === 'and' || t.value === 'or')) op = t.value;
      else if (t.type === 'Punct' && Object.prototype.hasOwnProperty.call(BIN_PREC, t.value)) op = t.value;
      if (op === null) break;
      const prec = BIN_PREC[op];
      if (prec < minPrec) break;
      this.advance();
      const nextMin = RIGHT_ASSOC.has(op) ? prec : prec + 1;
      const right = this.parseExpr(nextMin);
      left = { type: 'BinaryExpression', operator: op, left, right };
    }
    return left;
  }

  parseUnary() {
    const t = this.peek();
    if (this.isKeyword(t, 'not') || this.isPunct(t, '-') || this.isPunct(t, '#')) {
      this.advance();
      const operator = t.value;
      const argument = this.parseExpr(UNARY_PREC);
      return { type: 'UnaryExpression', operator, argument };
    }
    return this.parseSuffixedExpr(true);
  }

  parseSuffixedExpr(allowTypeAssert) {
    let base = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (this.isPunct(t, '.')) {
        this.advance();
        const property = this.expectName();
        base = { type: 'MemberExpression', object: base, property, computed: false };
      } else if (this.isPunct(t, '[')) {
        this.advance();
        const property = this.parseExpr(0);
        this.expectPunct(']');
        base = { type: 'MemberExpression', object: base, property, computed: true };
      } else if (this.isPunct(t, ':')) {
        this.advance();
        const method = this.expectName();
        const args = this.parseArgs();
        base = { type: 'MethodCallExpression', object: base, method, args };
      } else if (this.isPunct(t, '(') || t.type === 'String' || t.type === 'InterpString' || this.isPunct(t, '{')) {
        const args = this.parseArgs();
        base = { type: 'CallExpression', callee: base, args };
      } else if (allowTypeAssert && this.isPunct(t, '::') && !this.looksLikeLabelAhead()) {
        this.advance();
        this.skipTypeAnnotation();
      } else {
        break;
      }
    }
    return base;
  }

  looksLikeLabelAhead() {
    return this.peek(1).type === 'Identifier' && this.isPunct(this.peek(2), '::');
  }

  parseArgs() {
    const t = this.peek();
    if (this.isPunct(t, '(')) {
      this.advance();
      let args = [];
      if (!this.checkPunct(')')) args = this.parseExprList();
      this.expectPunct(')');
      return args;
    }
    if (t.type === 'String' || t.type === 'InterpString') {
      return [this.parsePrimary()];
    }
    if (this.isPunct(t, '{')) {
      return [this.parseTableConstructor()];
    }
    this.error('expected function arguments');
  }

  parsePrimary() {
    const t = this.peek();
    if (t.type === 'Number') {
      this.advance();
      return { type: 'NumericLiteral', value: t.value, raw: t.raw };
    }
    if (t.type === 'String') {
      this.advance();
      return { type: 'StringLiteral', value: t.value };
    }
    if (t.type === 'InterpString') {
      this.advance();
      return this.buildInterpString(t);
    }
    if (this.isKeyword(t, 'nil')) {
      this.advance();
      return { type: 'NilLiteral' };
    }
    if (this.isKeyword(t, 'true') || this.isKeyword(t, 'false')) {
      this.advance();
      return { type: 'BooleanLiteral', value: t.value === 'true' };
    }
    if (this.isPunct(t, '...')) {
      this.advance();
      return { type: 'VarargExpression' };
    }
    if (this.isKeyword(t, 'function')) {
      this.advance();
      const fn = this.parseFunctionBody(false);
      return { type: 'FunctionExpression', params: fn.params, hasVararg: fn.hasVararg, body: fn.body };
    }
    if (this.isKeyword(t, 'if')) {
      return this.parseIfExpression();
    }
    if (this.isPunct(t, '(')) {
      this.advance();
      const expression = this.parseExpr(0);
      this.expectPunct(')');
      return { type: 'ParenExpression', expression };
    }
    if (this.isPunct(t, '{')) {
      return this.parseTableConstructor();
    }
    if (t.type === 'Identifier') {
      this.advance();
      return { type: 'Identifier', name: t.value };
    }
    this.error(`unexpected token '${t.value === null ? 'EOF' : t.value}'`);
  }

  parseIfExpression() {
    this.advance();
    const clauses = [];
    let condition = this.parseExpr(0);
    this.expectKeyword('then');
    let body = this.parseExpr(0);
    clauses.push({ condition, body });
    while (this.checkKeyword('elseif')) {
      this.advance();
      condition = this.parseExpr(0);
      this.expectKeyword('then');
      body = this.parseExpr(0);
      clauses.push({ condition, body });
    }
    this.expectKeyword('else');
    const elseBody = this.parseExpr(0);
    return { type: 'IfExpression', clauses, elseBody };
  }

  parseTableConstructor() {
    this.expectPunct('{');
    const fields = [];
    while (!this.checkPunct('}')) {
      if (this.checkPunct('[')) {
        this.advance();
        const key = this.parseExpr(0);
        this.expectPunct(']');
        this.expectPunct('=');
        const value = this.parseExpr(0);
        fields.push({ kind: 'key', key, value });
      } else if (this.peek().type === 'Identifier' && this.isPunct(this.peek(1), '=')) {
        const key = this.advance().value;
        this.advance();
        const value = this.parseExpr(0);
        fields.push({ kind: 'name', key, value });
      } else {
        const value = this.parseExpr(0);
        fields.push({ kind: 'item', value });
      }
      if (this.checkPunct(',') || this.checkPunct(';')) {
        this.advance();
      } else {
        break;
      }
    }
    this.expectPunct('}');
    return { type: 'TableConstructor', fields };
  }

  buildInterpString(tok) {
    const parts = tok.parts.map((p) => {
      if (p.kind === 'string') return { kind: 'string', value: p.value };
      const sub = new Parser(p.source);
      const expr = sub.parseExpr(0);
      if (sub.peek().type !== 'EOF') sub.error('unexpected token in interpolation expression');
      return { kind: 'expr', expr };
    });
    return { type: 'StringInterpolation', parts };
  }
}

function parseProgram(source) {
  return new Parser(source).parseChunk();
}

function parseStatementsFragment(source) {
  const p = new Parser(source);
  const body = p.parseBlock();
  if (p.peek().type !== 'EOF') p.error('unexpected token after fragment');
  return body;
}

function parseExpressionFragment(source) {
  const p = new Parser(source);
  const expr = p.parseExpr(0);
  if (p.peek().type !== 'EOF') p.error('unexpected token after expression fragment');
  return expr;
}

return { Parser, ParseError, parseProgram, parseStatementsFragment, parseExpressionFragment };

})();

const Mod_codegen = (function() {
const BIN_PREC = {
  or: 1, and: 2,
  '<': 3, '>': 3, '<=': 3, '>=': 3, '~=': 3, '==': 3,
  '..': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '//': 6, '%': 6,
  '^': 8
};
const RIGHT_ASSOC = new Set(['..', '^']);
const UNARY_PREC = 7;
const PREFIX_SAFE = new Set(['Identifier', 'MemberExpression', 'CallExpression', 'MethodCallExpression', 'ParenExpression']);

function isWordChar(c) {
  return c !== undefined && /[A-Za-z0-9_]/.test(c);
}

class Writer {
  constructor(compact) {
    this.compact = compact;
    this.buf = [];
    this.lastChar = '';
    this.indentLevel = 0;
  }

  needsSeparator(a, b) {
    if (isWordChar(a) && isWordChar(b)) return true;
    if (a === '-' && b === '-') return true;
    if (a === '.' && b === '.') return true;
    if (a === ':' && b === ':') return true;
    if (a === '/' && b === '/') return true;
    if (a === '=' && b === '=') return true;
    if (a === '<' && b === '=') return true;
    if (a === '>' && b === '=') return true;
    if (a === '~' && b === '=') return true;
    return false;
  }

  token(text) {
    if (text.length === 0) return;
    if (this.buf.length > 0 && this.needsSeparator(this.lastChar, text[0])) {
      this.buf.push(' ');
    }
    this.buf.push(text);
    this.lastChar = text[text.length - 1];
  }

  sp() {
    if (!this.compact) this.token(' ');
  }

  nl() {
    if (!this.compact) {
      this.buf.push('\n' + '  '.repeat(this.indentLevel));
      this.lastChar = '\n';
    }
  }

  indent() { this.indentLevel++; }
  dedent() { this.indentLevel--; }

  toString() {
    return this.buf.join('');
  }
}

function formatNumber(value) {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  let s = String(value);
  if (s.includes('e')) s = s.replace('e+', 'e');
  return s;
}

function escapeControl(ch) {
  const code = ch.charCodeAt(0);
  if (code < 32 || code === 127) return '\\' + code;
  return ch;
}

function formatString(value) {
  let out = '"';
  for (const ch of value) {
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else out += escapeControl(ch);
  }
  return out + '"';
}

function formatStringRawBytes(value) {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 32 && code <= 126 && code !== 34 && code !== 92) {
      out += value[i];
    } else {
      out += '\\' + String(code).padStart(3, '0');
    }
  }
  return out + '"';
}

function formatInterpPart(value) {
  let out = '';
  for (const ch of value) {
    if (ch === '\\') out += '\\\\';
    else if (ch === '`') out += '\\`';
    else if (ch === '{') out += '\\{';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else out += escapeControl(ch);
  }
  return out;
}

class Codegen {
  constructor(options) {
    this.w = new Writer(!!(options && options.compact));
  }

  generate(chunk) {
    this.emitStatements(chunk.body);
    return this.w.toString();
  }

  emitStatements(stmts) {
    this.w.indent();
    for (const stmt of stmts) {
      this.w.nl();
      this.emitStatement(stmt);
    }
    this.w.dedent();
  }

  emitBlockKeywordBody(body) {
    this.emitStatements(body);
    this.w.nl();
  }

  emitCommaList(items, fn) {
    items.forEach((item, i) => {
      if (i > 0) {
        this.w.token(',');
        this.w.sp();
      }
      fn(item);
    });
  }

  emitStatement(stmt) {
    const w = this.w;
    switch (stmt.type) {
      case 'LocalStatement': {
        w.token('local');
        w.sp();
        this.emitCommaList(stmt.names, (n) => {
          w.token(n.name);
          if (n.attrib === 'close') {
            w.token('<');
            w.token('close');
            w.token('>');
          }
        });
        if (stmt.init.length > 0) {
          w.sp();
          w.token('=');
          w.sp();
          this.emitCommaList(stmt.init, (e) => this.emitExpr(e, 0));
        }
        break;
      }
      case 'AssignmentStatement': {
        this.emitCommaList(stmt.targets, (t) => this.emitExpr(t, 0));
        w.sp();
        w.token(stmt.operator);
        w.sp();
        this.emitCommaList(stmt.init, (e) => this.emitExpr(e, 0));
        break;
      }
      case 'CallStatement':
        this.emitExpr(stmt.call, 0);
        break;
      case 'DoStatement':
        w.token('do');
        this.emitBlockKeywordBody(stmt.body);
        w.token('end');
        break;
      case 'WhileStatement':
        w.token('while');
        w.sp();
        this.emitExpr(stmt.condition, 0);
        w.sp();
        w.token('do');
        this.emitBlockKeywordBody(stmt.body);
        w.token('end');
        break;
      case 'RepeatStatement':
        w.token('repeat');
        this.emitBlockKeywordBody(stmt.body);
        w.token('until');
        w.sp();
        this.emitExpr(stmt.condition, 0);
        break;
      case 'IfStatement':
        stmt.clauses.forEach((clause, i) => {
          if (clause.condition !== null) {
            w.token(i === 0 ? 'if' : 'elseif');
            w.sp();
            this.emitExpr(clause.condition, 0);
            w.sp();
            w.token('then');
          } else {
            w.token('else');
          }
          this.emitBlockKeywordBody(clause.body);
        });
        w.token('end');
        break;
      case 'NumericForStatement':
        w.token('for');
        w.sp();
        w.token(stmt.variable);
        w.sp();
        w.token('=');
        w.sp();
        this.emitExpr(stmt.start, 0);
        w.token(',');
        w.sp();
        this.emitExpr(stmt.limit, 0);
        if (stmt.step) {
          w.token(',');
          w.sp();
          this.emitExpr(stmt.step, 0);
        }
        w.sp();
        w.token('do');
        this.emitBlockKeywordBody(stmt.body);
        w.token('end');
        break;
      case 'GenericForStatement':
        w.token('for');
        w.sp();
        this.emitCommaList(stmt.names, (n) => w.token(n));
        w.sp();
        w.token('in');
        w.sp();
        this.emitCommaList(stmt.exprs, (e) => this.emitExpr(e, 0));
        w.sp();
        w.token('do');
        this.emitBlockKeywordBody(stmt.body);
        w.token('end');
        break;
      case 'FunctionDeclaration': {
        if (stmt.isLocal) {
          w.token('local');
          w.sp();
          w.token('function');
          w.sp();
          w.token(stmt.target.name);
        } else {
          w.token('function');
          w.sp();
          this.emitFunctionName(stmt.target, stmt.isMethod);
        }
        this.emitParamsAndBody(stmt.params, stmt.hasVararg, stmt.body, stmt.isMethod);
        break;
      }
      case 'ReturnStatement':
        w.token('return');
        if (stmt.args.length > 0) {
          w.sp();
          this.emitCommaList(stmt.args, (e) => this.emitExpr(e, 0));
        }
        break;
      case 'BreakStatement':
        w.token('break');
        break;
      case 'ContinueStatement':
        w.token('continue');
        break;
      case 'GotoStatement':
        w.token('goto');
        w.sp();
        w.token(stmt.label);
        break;
      case 'LabelStatement':
        w.token('::');
        w.token(stmt.name);
        w.token('::');
        break;
      default:
        throw new Error('unknown statement type ' + stmt.type);
    }
  }

  emitFunctionName(target, isMethod) {
    if (target.type === 'Identifier') {
      this.w.token(target.name);
      return;
    }
    this.emitFunctionName(target.object, false);
    this.w.token(isMethod ? ':' : '.');
    this.w.token(target.property);
  }

  emitParamsAndBody(params, hasVararg, body, isMethod) {
    const w = this.w;
    w.token('(');
    const visibleParams = isMethod ? params.slice(1) : params;
    this.emitCommaList(visibleParams, (p) => w.token(p.name));
    if (hasVararg) {
      if (visibleParams.length > 0) {
        w.token(',');
        w.sp();
      }
      w.token('...');
    }
    w.token(')');
    this.emitBlockKeywordBody(body);
    w.token('end');
  }

  needsPrefixParens(node) {
    return !PREFIX_SAFE.has(node.type);
  }

  emitPrefixBase(node) {
    if (this.needsPrefixParens(node)) {
      this.w.token('(');
      this.emitExpr(node, 0);
      this.w.token(')');
    } else {
      this.emitExpr(node, 1000);
    }
  }

  emitExpr(node, contextPrec) {
    const w = this.w;
    switch (node.type) {
      case 'NumericLiteral':
        w.token(formatNumber(node.value));
        break;
      case 'StringLiteral':
        w.token(node.rawBytes ? formatStringRawBytes(node.value) : formatString(node.value));
        break;
      case 'BooleanLiteral':
        w.token(node.value ? 'true' : 'false');
        break;
      case 'NilLiteral':
        w.token('nil');
        break;
      case 'VarargExpression':
        w.token('...');
        break;
      case 'Identifier':
        w.token(node.name);
        break;
      case 'ParenExpression':
        w.token('(');
        this.emitExpr(node.expression, 0);
        w.token(')');
        break;
      case 'UnaryExpression': {
        w.token(node.operator);
        if (node.operator === 'not') w.sp();
        const argNeedsParens = node.argument.type === 'BinaryExpression' &&
          BIN_PREC[node.argument.operator] < UNARY_PREC;
        if (argNeedsParens) {
          w.token('(');
          this.emitExpr(node.argument, 0);
          w.token(')');
        } else {
          this.emitExpr(node.argument, UNARY_PREC);
        }
        break;
      }
      case 'BinaryExpression': {
        const prec = BIN_PREC[node.operator];
        const rightAssoc = RIGHT_ASSOC.has(node.operator);
        const leftNeedsParens = node.left.type === 'BinaryExpression' &&
          (BIN_PREC[node.left.operator] < prec || (BIN_PREC[node.left.operator] === prec && rightAssoc));
        const rightNeedsParens = node.right.type === 'BinaryExpression' &&
          (BIN_PREC[node.right.operator] < prec || (BIN_PREC[node.right.operator] === prec && !rightAssoc));
        const outerNeedsParens = prec < contextPrec;
        if (outerNeedsParens) w.token('(');
        if (leftNeedsParens) {
          w.token('(');
          this.emitExpr(node.left, 0);
          w.token(')');
        } else {
          this.emitExpr(node.left, prec);
        }
        w.sp();
        w.token(node.operator);
        w.sp();
        if (rightNeedsParens) {
          w.token('(');
          this.emitExpr(node.right, 0);
          w.token(')');
        } else {
          this.emitExpr(node.right, prec);
        }
        if (outerNeedsParens) w.token(')');
        break;
      }
      case 'MemberExpression':
        this.emitPrefixBase(node.object);
        if (node.computed) {
          w.token('[');
          this.emitExpr(node.property, 0);
          w.token(']');
        } else {
          w.token('.');
          w.token(node.property);
        }
        break;
      case 'CallExpression':
        this.emitPrefixBase(node.callee);
        w.token('(');
        this.emitCommaList(node.args, (a) => this.emitExpr(a, 0));
        w.token(')');
        break;
      case 'MethodCallExpression':
        this.emitPrefixBase(node.object);
        w.token(':');
        w.token(node.method);
        w.token('(');
        this.emitCommaList(node.args, (a) => this.emitExpr(a, 0));
        w.token(')');
        break;
      case 'FunctionExpression':
        w.token('function');
        this.emitParamsAndBody(node.params, node.hasVararg, node.body, false);
        break;
      case 'TableConstructor':
        w.token('{');
        node.fields.forEach((f, i) => {
          if (i > 0) {
            w.token(',');
            w.sp();
          }
          if (f.kind === 'key') {
            w.token('[');
            this.emitExpr(f.key, 0);
            w.token(']');
            w.token('=');
            this.emitExpr(f.value, 0);
          } else if (f.kind === 'name') {
            w.token(f.key);
            w.token('=');
            this.emitExpr(f.value, 0);
          } else {
            this.emitExpr(f.value, 0);
          }
        });
        w.token('}');
        break;
      case 'IfExpression':
        node.clauses.forEach((clause, i) => {
          w.token(i === 0 ? 'if' : 'elseif');
          w.sp();
          this.emitExpr(clause.condition, 0);
          w.sp();
          w.token('then');
          w.sp();
          this.emitExpr(clause.body, 0);
          w.sp();
        });
        w.token('else');
        w.sp();
        this.emitExpr(node.elseBody, 0);
        break;
      case 'StringInterpolation':
        w.token('`');
        for (const part of node.parts) {
          if (part.kind === 'string') {
            w.token(formatInterpPart(part.value));
          } else {
            w.token('{');
            this.emitExpr(part.expr, 0);
            w.token('}');
          }
        }
        w.token('`');
        break;
      default:
        throw new Error('unknown expression type ' + node.type);
    }
  }
}

function generate(chunk, options) {
  return new Codegen(options).generate(chunk);
}

return { generate, formatNumber, formatString, formatStringRawBytes, Writer };

})();

const Mod_transforms_rename_identifiers = (function() {
const { Binder } = Mod_scope;
const { NameGenerator } = Mod_name_generator;

const DEFAULT_PROTECTED_GLOBALS = new Set([
  '_G', '_ENV', 'string', 'table', 'math', 'os', 'io', 'coroutine', 'debug',
  'bit32', 'utf8', 'buffer', 'vector',
  'game', 'workspace', 'script', 'plugin', 'shared', '_VERSION',
  'print', 'pairs', 'ipairs', 'next', 'type', 'tostring', 'tonumber',
  'pcall', 'xpcall', 'error', 'assert', 'select', 'unpack', 'rawget',
  'rawset', 'rawequal', 'rawlen', 'setmetatable', 'getmetatable',
  'require', 'loadstring', 'load', 'collectgarbage', 'newproxy',
  'typeof', 'wait', 'spawn', 'delay', 'tick', 'warn'
]);

function compileRegexes(patterns) {
  if (!patterns) return [];
  const list = Array.isArray(patterns) ? patterns : [patterns];
  const out = [];
  for (const p of list) {
    if (!p) continue;
    try {
      out.push(new RegExp(p));
    } catch (e) {
      /* skip invalid pattern */
    }
  }
  return out;
}

function matchesAny(name, regexes) {
  return regexes.some((r) => r.test(name));
}

function renameIdentifierNode(id, globalRenameMap) {
  if (id.$binding) {
    if (id.$binding.newName) id.name = id.$binding.newName;
  } else if (id.$global) {
    if (globalRenameMap.has(id.$global)) id.name = globalRenameMap.get(id.$global);
  }
}

function applyRenames(chunk, globalRenameMap) {
  function walkStmts(stmts) {
    for (const s of stmts) walkStmt(s);
  }

  function renameParams(fn) {
    if (!fn.$paramBindings) return;
    fn.params.forEach((p, i) => {
      const b = fn.$paramBindings[i];
      if (b && b.newName) p.name = b.newName;
    });
  }

  function walkStmt(stmt) {
    switch (stmt.type) {
      case 'LocalStatement':
        stmt.init.forEach(walkExpr);
        stmt.names.forEach((n) => {
          if (n.$binding && n.$binding.newName) n.name = n.$binding.newName;
        });
        break;
      case 'AssignmentStatement':
        stmt.init.forEach(walkExpr);
        stmt.targets.forEach(walkExpr);
        break;
      case 'CallStatement':
        walkExpr(stmt.call);
        break;
      case 'DoStatement':
        walkStmts(stmt.body);
        break;
      case 'WhileStatement':
        walkExpr(stmt.condition);
        walkStmts(stmt.body);
        break;
      case 'RepeatStatement':
        walkStmts(stmt.body);
        walkExpr(stmt.condition);
        break;
      case 'IfStatement':
        stmt.clauses.forEach((c) => {
          if (c.condition) walkExpr(c.condition);
          walkStmts(c.body);
        });
        break;
      case 'NumericForStatement':
        walkExpr(stmt.start);
        walkExpr(stmt.limit);
        if (stmt.step) walkExpr(stmt.step);
        if (stmt.$varBinding && stmt.$varBinding.newName) stmt.variable = stmt.$varBinding.newName;
        walkStmts(stmt.body);
        break;
      case 'GenericForStatement':
        stmt.exprs.forEach(walkExpr);
        if (stmt.$varBindings) {
          stmt.names = stmt.names.map((n, i) => {
            const b = stmt.$varBindings[i];
            return b && b.newName ? b.newName : n;
          });
        }
        walkStmts(stmt.body);
        break;
      case 'FunctionDeclaration':
        if (stmt.isLocal) {
          if (stmt.target.$binding && stmt.target.$binding.newName) {
            stmt.target.name = stmt.target.$binding.newName;
          }
        } else {
          walkExpr(stmt.target);
        }
        renameParams(stmt);
        walkStmts(stmt.body);
        break;
      case 'ReturnStatement':
        stmt.args.forEach(walkExpr);
        break;
      default:
        break;
    }
  }

  function walkExpr(expr) {
    if (!expr) return;
    switch (expr.type) {
      case 'Identifier':
        renameIdentifierNode(expr, globalRenameMap);
        break;
      case 'BinaryExpression':
        walkExpr(expr.left);
        walkExpr(expr.right);
        break;
      case 'UnaryExpression':
        walkExpr(expr.argument);
        break;
      case 'MemberExpression':
        walkExpr(expr.object);
        if (expr.computed) walkExpr(expr.property);
        break;
      case 'CallExpression':
        walkExpr(expr.callee);
        expr.args.forEach(walkExpr);
        break;
      case 'MethodCallExpression':
        walkExpr(expr.object);
        expr.args.forEach(walkExpr);
        break;
      case 'ParenExpression':
        walkExpr(expr.expression);
        break;
      case 'TableConstructor':
        expr.fields.forEach((f) => {
          if (f.kind === 'key') walkExpr(f.key);
          walkExpr(f.value);
        });
        break;
      case 'FunctionExpression':
        renameParams(expr);
        walkStmts(expr.body);
        break;
      case 'IfExpression':
        expr.clauses.forEach((c) => {
          walkExpr(c.condition);
          walkExpr(c.body);
        });
        walkExpr(expr.elseBody);
        break;
      case 'StringInterpolation':
        expr.parts.forEach((p) => {
          if (p.kind === 'expr') walkExpr(p.expr);
        });
        break;
      default:
        break;
    }
  }

  walkStmts(chunk.body);
}

function renameIdentifiers(chunk, options) {
  const binder = new Binder();
  binder.bindChunk(chunk);

  const reservedNameRegexes = compileRegexes(options.reservedNames);

  const nameGen = new NameGenerator({
    mode: options.mode,
    rng: options.rng,
    prefix: options.renameGlobals ? options.prefix : '',
    randomPrefix: options.renameGlobals ? options.randomPrefix : false
  });

  for (const binding of binder.allBindings) {
    if (binding.protected) continue;
    if (matchesAny(binding.name, reservedNameRegexes)) continue;
    binding.newName = nameGen.next();
  }

  const globalRenameMap = new Map();
  if (options.renameGlobals) {
    for (const name of binder.globalsAssigned) {
      if (DEFAULT_PROTECTED_GLOBALS.has(name)) continue;
      if (matchesAny(name, reservedNameRegexes)) continue;
      globalRenameMap.set(name, nameGen.next());
    }
  }

  applyRenames(chunk, globalRenameMap);

  const localRenameList = binder.allBindings
    .filter((b) => b.newName)
    .map((b) => ({ original: b.name, renamed: b.newName, kind: b.kind }));

  return {
    renamedLocals: localRenameList.length,
    renamedGlobals: globalRenameMap.size,
    localRenameList,
    globalRenameMap: Object.fromEntries(globalRenameMap)
  };
}

return { renameIdentifiers, DEFAULT_PROTECTED_GLOBALS, compileRegexes, matchesAny };

})();

const Mod_transforms_rename_properties = (function() {
const { NameGenerator } = Mod_name_generator;
const { compileRegexes, matchesAny } = Mod_transforms_rename_identifiers;

const DEFAULT_PROTECTED_PROPERTIES = new Set([
  'format', 'insert', 'remove', 'sort', 'concat', 'gsub', 'gmatch', 'gfind', 'find', 'match',
  'sub', 'len', 'upper', 'lower', 'rep', 'byte', 'char', 'reverse', 'split', 'pack', 'unpack',
  'random', 'randomseed', 'floor', 'ceil', 'abs', 'max', 'min', 'sqrt', 'huge', 'pi', 'sin',
  'cos', 'tan', 'atan', 'atan2', 'exp', 'log', 'fmod', 'modf', 'pow', 'clamp', 'sign', 'noise',
  'now', 'time', 'date', 'clock', 'difftime', 'exit', 'getenv', 'rename', 'tmpname',
  'open', 'close', 'read', 'write', 'lines', 'flush', 'seek', 'output', 'input',
  'create', 'resume', 'yield', 'status', 'wrap', 'isyieldable', 'running',
  'dump', 'getinfo', 'traceback', 'sethook', 'gethook', 'getlocal', 'setlocal',
  'getupvalue', 'setupvalue', 'getmetatable', 'setmetatable', 'getfenv', 'setfenv',
  'band', 'bor', 'bxor', 'bnot', 'lshift', 'rshift', 'arshift', 'rrotate', 'lrotate', 'extract', 'replace',
  'codepoint', 'offset', 'codes', 'graphemes', 'nfcnormalize', 'nfdnormalize',
  'new', 'isA', 'IsA', 'Destroy', 'Clone', 'Connect', 'connect', 'Disconnect',
  'Wait', 'GetService', 'FindFirstChild', 'WaitForChild', 'self'
]);

function walkStatements(stmts, onStmt) {
  stmts.forEach(onStmt);
}

function makeTraversal(handlers) {
  function visitStmts(stmts) {
    walkStatements(stmts, visitStmt);
  }

  function visitStmt(stmt) {
    switch (stmt.type) {
      case 'LocalStatement':
        stmt.init.forEach(visitExpr);
        break;
      case 'AssignmentStatement':
        stmt.init.forEach(visitExpr);
        stmt.targets.forEach(visitExpr);
        break;
      case 'CallStatement':
        visitExpr(stmt.call);
        break;
      case 'DoStatement':
        visitStmts(stmt.body);
        break;
      case 'WhileStatement':
        visitExpr(stmt.condition);
        visitStmts(stmt.body);
        break;
      case 'RepeatStatement':
        visitStmts(stmt.body);
        visitExpr(stmt.condition);
        break;
      case 'IfStatement':
        stmt.clauses.forEach((c) => {
          if (c.condition) visitExpr(c.condition);
          visitStmts(c.body);
        });
        break;
      case 'NumericForStatement':
        visitExpr(stmt.start);
        visitExpr(stmt.limit);
        if (stmt.step) visitExpr(stmt.step);
        visitStmts(stmt.body);
        break;
      case 'GenericForStatement':
        stmt.exprs.forEach(visitExpr);
        visitStmts(stmt.body);
        break;
      case 'FunctionDeclaration':
        if (stmt.target.type === 'MemberExpression') visitMemberChainDecl(stmt.target);
        visitStmts(stmt.body);
        break;
      case 'ReturnStatement':
        stmt.args.forEach(visitExpr);
        break;
      default:
        break;
    }
  }

  function visitMemberChainDecl(target) {
    if (target.object.type === 'MemberExpression') visitMemberChainDecl(target.object);
    if (!target.computed) handlers.onProperty(target, 'property');
  }

  function visitExpr(expr) {
    if (!expr) return;
    switch (expr.type) {
      case 'BinaryExpression':
        visitExpr(expr.left);
        visitExpr(expr.right);
        break;
      case 'UnaryExpression':
        visitExpr(expr.argument);
        break;
      case 'MemberExpression':
        visitExpr(expr.object);
        if (expr.computed) visitExpr(expr.property);
        else handlers.onProperty(expr, 'property');
        break;
      case 'CallExpression':
        visitExpr(expr.callee);
        expr.args.forEach(visitExpr);
        break;
      case 'MethodCallExpression':
        visitExpr(expr.object);
        handlers.onProperty(expr, 'method');
        expr.args.forEach(visitExpr);
        break;
      case 'ParenExpression':
        visitExpr(expr.expression);
        break;
      case 'TableConstructor':
        expr.fields.forEach((f) => {
          if (f.kind === 'key') visitExpr(f.key);
          if (f.kind === 'name') handlers.onProperty(f, 'key');
          visitExpr(f.value);
        });
        break;
      case 'FunctionExpression':
        visitStmts(expr.body);
        break;
      case 'IfExpression':
        expr.clauses.forEach((c) => {
          visitExpr(c.condition);
          visitExpr(c.body);
        });
        visitExpr(expr.elseBody);
        break;
      case 'StringInterpolation':
        expr.parts.forEach((p) => {
          if (p.kind === 'expr') visitExpr(p.expr);
        });
        break;
      default:
        break;
    }
  }

  return { visitStmts };
}

function collectPropertyNames(chunk, names) {
  const t = makeTraversal({
    onProperty(node, field) {
      names.add(node[field]);
    }
  });
  t.visitStmts(chunk.body);
}

function applyPropertyRenames(chunk, renameMap) {
  const t = makeTraversal({
    onProperty(node, field) {
      if (renameMap.has(node[field])) node[field] = renameMap.get(node[field]);
    }
  });
  t.visitStmts(chunk.body);
}

function renameProperties(chunk, options) {
  const names = new Set();
  collectPropertyNames(chunk, names);

  const reservedNameRegexes = compileRegexes(options.reservedNames);
  const nameGen = new NameGenerator({ mode: options.mode, rng: options.rng });

  const renameMap = new Map();
  for (const name of names) {
    if (DEFAULT_PROTECTED_PROPERTIES.has(name)) continue;
    if (matchesAny(name, reservedNameRegexes)) continue;
    renameMap.set(name, nameGen.next());
  }

  applyPropertyRenames(chunk, renameMap);
  return { renamedProperties: renameMap.size, propertyRenameMap: Object.fromEntries(renameMap) };
}

return { renameProperties, DEFAULT_PROTECTED_PROPERTIES };

})();

const Mod_transforms_numbers_to_expressions = (function() {
const { transformStatement } = Mod_ast;

function findFactorPair(v, rng) {
  const n = Math.abs(v);
  if (n < 4) return null;
  const divisors = [];
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) divisors.push(i);
  }
  if (divisors.length === 0) return null;
  const d = rng.pick(divisors);
  let a = d;
  const b = n / d;
  if (v < 0) a = -a;
  return [a, b];
}

function lit(value, fresh) {
  const n = { type: 'NumericLiteral', value };
  fresh.add(n);
  return n;
}

function wrap(operator, left, right) {
  return { type: 'ParenExpression', expression: { type: 'BinaryExpression', operator, left, right } };
}

function splitNumber(v, rng, fresh) {
  const strategy = rng.int(0, 3);
  if (strategy === 2) {
    const pair = findFactorPair(v, rng);
    if (pair) return wrap('*', lit(pair[0], fresh), lit(pair[1], fresh));
  }
  if (strategy === 1) {
    const a = rng.int(1, 51);
    return wrap('-', lit(v + a, fresh), lit(a, fresh));
  }
  const bound = Math.max(2, Math.floor(Math.abs(v)));
  const a = rng.int(1, bound);
  return wrap('+', lit(v - a, fresh), lit(a, fresh));
}

function numbersToExpressions(chunk, options) {
  const rng = options.rng;
  let count = 0;
  const fresh = new Set();
  function visitor(node) {
    if (fresh.has(node)) return undefined;
    if (node.type !== 'NumericLiteral') return undefined;
    if (!Number.isInteger(node.value) || !Number.isFinite(node.value)) return undefined;
    if (Math.abs(node.value) < 2 || Math.abs(node.value) > 1e9) return undefined;
    if (!rng.bool(options.probability === undefined ? 1 : options.probability)) return undefined;
    count++;
    return splitNumber(node.value, rng, fresh);
  }
  for (let i = 0; i < chunk.body.length; i++) {
    chunk.body[i] = transformStatement(chunk.body[i], { expr: visitor });
  }
  return { numbersTransformed: count };
}

return { numbersToExpressions, splitNumber };

})();

const Mod_transforms_split_strings = (function() {
const { transformStatement } = Mod_ast;

function splitStringLiteral(value, rng, fresh) {
  if (value.length < 2) return null;
  const splitPoint = rng.int(1, value.length);
  const left = { type: 'StringLiteral', value: value.slice(0, splitPoint) };
  const right = { type: 'StringLiteral', value: value.slice(splitPoint) };
  fresh.add(left);
  fresh.add(right);
  return { type: 'ParenExpression', expression: { type: 'BinaryExpression', operator: '..', left, right } };
}

function splitStrings(chunk, options) {
  const rng = options.rng;
  let count = 0;
  const fresh = new Set();
  function visitor(node) {
    if (fresh.has(node)) return undefined;
    if (node.type !== 'StringLiteral') return undefined;
    if (node.value.length < 2) return undefined;
    if (!rng.bool(options.probability === undefined ? 1 : options.probability)) return undefined;
    const result = splitStringLiteral(node.value, rng, fresh);
    if (!result) return undefined;
    count++;
    return result;
  }
  for (let i = 0; i < chunk.body.length; i++) {
    chunk.body[i] = transformStatement(chunk.body[i], { expr: visitor });
  }
  return { stringsSplit: count };
}

return { splitStrings };

})();

const Mod_transforms_dead_code = (function() {
const { transformStatement } = Mod_ast;

function makeFakeExpr(rng) {
  const a = rng.int(1, 1000);
  const b = rng.int(1, 1000);
  const op = rng.pick(['+', '-', '*']);
  return { type: 'BinaryExpression', operator: op, left: { type: 'NumericLiteral', value: a }, right: { type: 'NumericLiteral', value: b } };
}

function makeFakeStatement(rng, nameGen) {
  if (rng.bool(0.5)) {
    const name = nameGen.next();
    return { type: 'LocalStatement', names: [{ name, attrib: null }], init: [makeFakeExpr(rng)] };
  }
  const name = nameGen.next();
  return { type: 'CallStatement', call: { type: 'CallExpression', callee: { type: 'Identifier', name }, args: [makeFakeExpr(rng)] } };
}

function makeDeadBlock(rng, nameGen) {
  const n = 1 + rng.int(0, 3);
  const stmts = [];
  for (let i = 0; i < n; i++) stmts.push(makeFakeStatement(rng, nameGen));
  return stmts;
}

function makeSafeFakeStatement(rng, nameGen) {
  const name = nameGen.next();
  return { type: 'LocalStatement', names: [{ name, attrib: null }], init: [makeFakeExpr(rng)] };
}

function makeSafeFakeBlock(rng, nameGen) {
  const n = 1 + rng.int(0, 3);
  const stmts = [];
  for (let i = 0; i < n; i++) stmts.push(makeSafeFakeStatement(rng, nameGen));
  return stmts;
}

function makeDeadStatement(rng, nameGen) {
  const choice = rng.int(0, 3);
  const body = makeDeadBlock(rng, nameGen);
  if (choice === 0) {
    return { type: 'IfStatement', clauses: [{ condition: { type: 'BooleanLiteral', value: false }, body }] };
  }
  if (choice === 1) {
    const cond = {
      type: 'BinaryExpression', operator: '==',
      left: { type: 'NumericLiteral', value: rng.int(2, 9) },
      right: { type: 'NumericLiteral', value: rng.int(10, 20) }
    };
    return { type: 'IfStatement', clauses: [{ condition: cond, body }] };
  }
  const varName = nameGen.next();
  return { type: 'NumericForStatement', variable: varName, start: { type: 'NumericLiteral', value: 1 }, limit: { type: 'NumericLiteral', value: 0 }, step: null, body };
}

const BLOCK_FINAL_TYPES = new Set(['ReturnStatement', 'BreakStatement', 'ContinueStatement', 'GotoStatement']);

function injectDeadCode(chunk, options) {
  const rng = options.rng;
  const nameGen = options.nameGen;
  const density = options.density === undefined ? 0.3 : options.density;
  let injected = 0;

  function injectIntoList(stmts) {
    const out = [];
    for (const s of stmts) {
      if (!BLOCK_FINAL_TYPES.has(s.type) && rng.bool(density)) {
        out.push(makeDeadStatement(rng, nameGen));
        injected++;
      }
      out.push(recurseIntoStatement(s));
    }
    const last = out[out.length - 1];
    if ((!last || !BLOCK_FINAL_TYPES.has(last.type)) && rng.bool(density)) {
      out.push(makeDeadStatement(rng, nameGen));
      injected++;
    }
    return out;
  }

  function recurseIntoStatement(stmt) {
    switch (stmt.type) {
      case 'DoStatement':
        stmt.body = injectIntoList(stmt.body);
        break;
      case 'WhileStatement':
        stmt.body = injectIntoList(stmt.body);
        break;
      case 'RepeatStatement':
        stmt.body = injectIntoList(stmt.body);
        break;
      case 'IfStatement':
        stmt.clauses.forEach((c) => { c.body = injectIntoList(c.body); });
        break;
      case 'NumericForStatement':
        stmt.body = injectIntoList(stmt.body);
        break;
      case 'GenericForStatement':
        stmt.body = injectIntoList(stmt.body);
        break;
      case 'FunctionDeclaration':
        stmt.body = injectIntoList(stmt.body);
        break;
      default:
        break;
    }
    return stmt;
  }

  chunk.body = injectIntoList(chunk.body);

  function fnExprVisitor(node) {
    if (node.type === 'FunctionExpression') {
      node.body = injectIntoList(node.body);
    }
    return undefined;
  }
  for (let i = 0; i < chunk.body.length; i++) {
    chunk.body[i] = transformStatement(chunk.body[i], { expr: fnExprVisitor });
  }

  return { statementsInjected: injected };
}

return { injectDeadCode, makeFakeStatement, makeFakeExpr, makeDeadBlock, makeSafeFakeBlock };

})();

const Mod_transforms_control_flow_flatten = (function() {
const { transformStatement } = Mod_ast;
const { makeDeadBlock, makeSafeFakeBlock } = Mod_transforms_dead_code;

function containsLoopControlAtOwnLevel(stmts) {
  for (const s of stmts) {
    if (scanStmt(s)) return true;
  }
  return false;

  function scanStmt(s) {
    switch (s.type) {
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'GotoStatement':
      case 'LabelStatement':
        return true;
      case 'DoStatement':
        return containsLoopControlAtOwnLevel(s.body);
      case 'IfStatement':
        return s.clauses.some((c) => containsLoopControlAtOwnLevel(c.body));
      default:
        return false;
    }
  }
}

function collectLocalNames(stmts) {
  const names = [];
  for (const s of stmts) {
    if (s.type === 'LocalStatement') {
      s.names.forEach((n) => names.push(n.name));
    } else if (s.type === 'FunctionDeclaration' && s.isLocal) {
      names.push(s.target.name);
    }
  }
  return names;
}

function convertLocalsToAssignments(stmts) {
  const out = [];
  for (const s of stmts) {
    if (s.type === 'LocalStatement') {
      if (s.init.length === 0) continue;
      out.push({
        type: 'AssignmentStatement',
        targets: s.names.map((n) => ({ type: 'Identifier', name: n.name })),
        init: s.init,
        operator: '='
      });
    } else if (s.type === 'FunctionDeclaration' && s.isLocal) {
      out.push({
        type: 'AssignmentStatement',
        targets: [{ type: 'Identifier', name: s.target.name }],
        init: [{ type: 'FunctionExpression', params: s.params, hasVararg: s.hasVararg, body: s.body }],
        operator: '='
      });
    } else {
      out.push(s);
    }
  }
  return out;
}

function flattenBlock(stmts, rng, fakeOpts) {
  if (stmts.length < 2) return stmts;
  if (containsLoopControlAtOwnLevel(stmts)) return stmts;

  const localNames = collectLocalNames(stmts);
  const converted = convertLocalsToAssignments(stmts);
  if (converted.length < 2) return stmts;

  const nameGen = fakeOpts && fakeOpts.nameGen;
  const fakeDensity = (fakeOpts && fakeOpts.fakeDensity) || 0;

  const n = converted.length;
  const used = new Set();
  function freshId() {
    let id;
    do {
      id = rng.int(1, 1000000);
    } while (used.has(id));
    used.add(id);
    return id;
  }
  const stateIds = [];
  for (let i = 0; i < n; i++) stateIds.push(freshId());
  const stateVar = '__ts_' + rng.int(100000, 999999).toString(36);

  function stateAssign(value) {
    return { type: 'AssignmentStatement', targets: [{ type: 'Identifier', name: stateVar }], init: [{ type: 'NumericLiteral', value }], operator: '=' };
  }
  function stateEquals(value) {
    return { type: 'BinaryExpression', operator: '==', left: { type: 'Identifier', name: stateVar }, right: { type: 'NumericLiteral', value } };
  }

  const clauses = [];
  for (let idx = 0; idx < n; idx++) {
    const isLast = idx === n - 1;
    const body = [converted[idx]];
    if (!isLast) {
      let targetId = stateIds[idx + 1];
      if (nameGen && fakeDensity > 0 && rng.bool(fakeDensity)) {
        const hopId = freshId();
        const hopBody = makeSafeFakeBlock(rng, nameGen).concat([stateAssign(stateIds[idx + 1])]);
        clauses.push({ condition: stateEquals(hopId), body: hopBody });
        targetId = hopId;
      }
      body.push(stateAssign(targetId));
    } else if (converted[idx].type !== 'ReturnStatement') {
      body.push({ type: 'BreakStatement' });
    }
    clauses.push({ condition: stateEquals(stateIds[idx]), body });
  }

  if (nameGen && fakeDensity > 0) {
    const decoyCount = rng.int(0, 3);
    for (let k = 0; k < decoyCount; k++) {
      const decoyId = freshId();
      const existingIds = Array.from(used).filter((id) => id !== decoyId);
      const jumpTo = existingIds.length ? rng.pick(existingIds) : stateIds[0];
      const fakeBody = makeDeadBlock(rng, nameGen).concat([stateAssign(jumpTo)]);
      clauses.push({ condition: stateEquals(decoyId), body: fakeBody });
    }
  }

  const shuffledClauses = rng.shuffle(clauses);

  const dispatcher = {
    type: 'WhileStatement',
    condition: { type: 'BooleanLiteral', value: true },
    body: [{ type: 'IfStatement', clauses: shuffledClauses }]
  };

  const result = [];
  if (localNames.length) {
    result.push({ type: 'LocalStatement', names: localNames.map((name) => ({ name, attrib: null })), init: [] });
  }
  result.push({
    type: 'LocalStatement',
    names: [{ name: stateVar, attrib: null }],
    init: [{ type: 'NumericLiteral', value: stateIds[0] }]
  });
  result.push(dispatcher);
  return result;
}

function controlFlowFlatten(chunk, options) {
  const rng = options.rng;
  const probability = options.probability === undefined ? 0.5 : options.probability;
  const fakeOpts = { nameGen: options.nameGen, fakeDensity: options.fakeDensity || 0 };
  let flattenedCount = 0;
  const processedBodies = new Set();

  function maybeFlatten(stmts) {
    if (rng.bool(probability)) {
      const result = flattenBlock(stmts, rng, fakeOpts);
      if (result !== stmts) flattenedCount++;
      return result;
    }
    return stmts;
  }

  function recurseIntoStatement(stmt) {
    switch (stmt.type) {
      case 'DoStatement':
        stmt.body = processList(stmt.body);
        break;
      case 'WhileStatement':
        stmt.body = processList(stmt.body);
        break;
      case 'RepeatStatement':
        stmt.body = processList(stmt.body);
        break;
      case 'IfStatement':
        stmt.clauses.forEach((c) => { c.body = processList(c.body); });
        break;
      case 'NumericForStatement':
        stmt.body = processList(stmt.body);
        break;
      case 'GenericForStatement':
        stmt.body = processList(stmt.body);
        break;
      case 'FunctionDeclaration':
        stmt.body = processList(stmt.body);
        break;
      default:
        break;
    }
  }

  function processList(stmts) {
    if (processedBodies.has(stmts)) return stmts;
    processedBodies.add(stmts);
    stmts.forEach(recurseIntoStatement);
    const result = maybeFlatten(stmts);
    processedBodies.add(result);
    return result;
  }

  chunk.body = processList(chunk.body);

  function fnExprVisitor(node) {
    if (node.type === 'FunctionExpression') {
      node.body = processList(node.body);
    }
    return undefined;
  }
  for (let i = 0; i < chunk.body.length; i++) {
    chunk.body[i] = transformStatement(chunk.body[i], { expr: fnExprVisitor });
  }

  return { blocksFlattened: flattenedCount };
}

return { controlFlowFlatten };

})();

const Mod_transforms_wrappers = (function() {
function wrapOnce(bodyStmts, type, nameGen) {
  const fnExpr = { type: 'FunctionExpression', params: [], hasVararg: true, body: bodyStmts };
  const callArgs = [{ type: 'VarargExpression' }];
  if (type === 'function') {
    const call = { type: 'CallExpression', callee: { type: 'ParenExpression', expression: fnExpr }, args: callArgs };
    return [{ type: 'ReturnStatement', args: [call] }];
  }
  const varName = nameGen.next();
  return [
    { type: 'LocalStatement', names: [{ name: varName, attrib: null }], init: [fnExpr] },
    { type: 'ReturnStatement', args: [{ type: 'CallExpression', callee: { type: 'Identifier', name: varName }, args: callArgs }] }
  ];
}

function applyWrappers(chunk, options) {
  const rng = options.rng;
  const nameGen = options.nameGen;
  const count = options.count || 0;
  const wrapperType = options.wrapperType || 'function';
  let body = chunk.body;
  for (let i = 0; i < count; i++) {
    const type = wrapperType === 'mixed' ? (rng.bool() ? 'function' : 'variable') : wrapperType;
    body = wrapOnce(body, type, nameGen);
  }
  chunk.body = body;
  return { wrappersApplied: count };
}

return { applyWrappers };

})();

const Mod_transforms_debug_protection = (function() {
const { parseStatementsFragment } = Mod_parser;

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

return { injectDebugProtection };

})();

const Mod_transforms_anti_tamper = (function() {
const { parseStatementsFragment } = Mod_parser;

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

return { injectAntiTamper };

})();

const Mod_transforms_environment_checks = (function() {
const { parseStatementsFragment } = Mod_parser;

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

return { injectEnvironmentChecks };

})();

const Mod_transforms_source_map = (function() {
function summarizeStatement(stmt) {
  switch (stmt.type) {
    case 'LocalStatement':
      return 'local ' + stmt.names.map((n) => n.name).join(', ');
    case 'FunctionDeclaration':
      return (stmt.isLocal ? 'local function ' : 'function ') +
        (stmt.target.type === 'Identifier' ? stmt.target.name : '<member>');
    case 'AssignmentStatement':
      return stmt.targets.map((t) => (t.type === 'Identifier' ? t.name : '<expr>')).join(', ') + ' =';
    case 'CallStatement':
      return '<call>';
    default:
      return stmt.type;
  }
}

function snapshotTopLevel(chunk) {
  return chunk.body.map((stmt, i) => ({
    index: i,
    originalLine: stmt.$line || null,
    summary: summarizeStatement(stmt)
  }));
}

function buildSourceMap(topLevel, renameStats) {
  return {
    note: 'Best-effort map: original top-level statement order/lines, plus identifier rename tables. ' +
      'Structural transforms (control-flow flattening, dead-code injection, wrappers) are not individually traced.',
    topLevelStatements: topLevel,
    renamedLocals: (renameStats && renameStats.localRenameList) || [],
    renamedGlobals: (renameStats && renameStats.globalRenameMap) || {},
    renamedProperties: (renameStats && renameStats.propertyRenameMap) || {}
  };
}

return { buildSourceMap, snapshotTopLevel };

})();

const Mod_transforms_string_array = (function() {
const { transformStatement, transformStatements } = Mod_ast;
const { parseStatementsFragment } = Mod_parser;
const { formatString } = Mod_codegen;
const { compileRegexes, matchesAny } = Mod_transforms_rename_identifiers;
const {
  stringToBytes, bytesToBinaryString, base64EncodeBytes, xorEncodeBytes, rc4KeystreamAndEncode,
  lcgSeedFromKey, lcgKeystreamBytes, lcgEncodeBytes, xxteaEncodeBytes, chacha20EncodeBytes, MOD32
} = Mod_utils_encoding;

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

return { stringArray };

})();

const Mod_index = (function() {
const { parseProgram } = Mod_parser;
const { generate } = Mod_codegen;
const { RNG } = Mod_rng;
const { NameGenerator } = Mod_name_generator;

const { renameIdentifiers } = Mod_transforms_rename_identifiers;
const { renameProperties } = Mod_transforms_rename_properties;
const { numbersToExpressions } = Mod_transforms_numbers_to_expressions;
const { splitStrings } = Mod_transforms_split_strings;
const { injectDeadCode } = Mod_transforms_dead_code;
const { controlFlowFlatten } = Mod_transforms_control_flow_flatten;
const { stringArray } = Mod_transforms_string_array;
const { applyWrappers } = Mod_transforms_wrappers;
const { injectDebugProtection } = Mod_transforms_debug_protection;
const { injectAntiTamper } = Mod_transforms_anti_tamper;
const { injectEnvironmentChecks } = Mod_transforms_environment_checks;
const { buildSourceMap, snapshotTopLevel } = Mod_transforms_source_map;

const HEADER = '-- Protected by TokynAST V2.0\n';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function normalizeOptions(raw) {
  const o = raw || {};
  return {
    seed: o.seed,
    layers: clamp(o.layers === undefined ? 1 : o.layers, 1, 5),
    compact: !!o.compact,
    minify: !!o.minify,
    identifierProtection: !!o.identifierProtection,
    nameGenerator: o.nameGenerator || 'mangled',
    identifierPrefix: o.identifierPrefix || '',
    randomPrefix: !!o.randomPrefix,
    renameGlobals: !!o.renameGlobals,
    renameProperties: !!o.renameProperties,
    reservedNames: o.reservedNames || [],
    reservedStrings: o.reservedStrings || [],
    constantProtection: !!o.constantProtection,
    stringArray: Object.assign({
      enabled: true,
      threshold: 0.75,
      rotate: false,
      shuffle: false,
      encoding: 'none',
      doubleLayer: false
    }, o.stringArray || {}),
    wrappers: Object.assign({ count: 0, type: 'function' }, o.wrappers || {}),
    sourceMap: !!o.sourceMap,
    splitStrings: !!o.splitStrings,
    controlFlowFlatten: o.controlFlowFlatten === undefined ? 0 : o.controlFlowFlatten,
    controlFlowFakePaths: o.controlFlowFakePaths === undefined ? 0 : o.controlFlowFakePaths,
    numbersToExpressions: !!o.numbersToExpressions,
    deadCodeInjection: !!o.deadCodeInjection,
    debugProtection: !!o.debugProtection,
    antiTamper: !!o.antiTamper,
    environmentChecks: !!o.environmentChecks
  };
}

class TokynObfuscator {
  constructor(options) {
    this.options = normalizeOptions(options);
  }

  obfuscate(sourceCode) {
    const opts = this.options;
    const rng = new RNG(opts.seed);
    const internalNameGen = new NameGenerator({ mode: 'hex', rng });

    const chunk = parseProgram(sourceCode);
    const originalSnapshot = snapshotTopLevel(chunk);

    for (let pass = 0; pass < opts.layers; pass++) {
      if (opts.controlFlowFlatten > 0) {
        controlFlowFlatten(chunk, {
          rng, probability: opts.controlFlowFlatten,
          nameGen: internalNameGen, fakeDensity: opts.controlFlowFakePaths
        });
      }
      if (opts.deadCodeInjection) {
        injectDeadCode(chunk, { rng, nameGen: internalNameGen, density: 0.22 });
      }
      if (opts.numbersToExpressions) {
        numbersToExpressions(chunk, { rng, probability: 1 });
      }
      if (opts.splitStrings) {
        splitStrings(chunk, { rng, probability: 0.6 });
      }
    }

    let stringArrayStats = { stringsProtected: 0 };
    if (opts.constantProtection && opts.stringArray.enabled) {
      stringArrayStats = stringArray(chunk, {
        rng,
        threshold: opts.stringArray.threshold,
        reservedStrings: opts.reservedStrings,
        encoding: opts.stringArray.encoding,
        rotate: opts.stringArray.rotate,
        shuffle: opts.stringArray.shuffle,
        doubleLayer: opts.stringArray.doubleLayer,
        internalNameGen
      });
    }

    if (opts.debugProtection) {
      injectDebugProtection(chunk, { internalNameGen });
    }
    if (opts.antiTamper) {
      injectAntiTamper(chunk, { internalNameGen });
    }
    if (opts.environmentChecks) {
      injectEnvironmentChecks(chunk, { internalNameGen });
    }

    let renameStats = { renamedLocals: 0, renamedGlobals: 0, renamedProperties: 0 };
    if (opts.identifierProtection || opts.minify) {
      const mode = opts.identifierProtection ? opts.nameGenerator : 'minify';
      renameStats = renameIdentifiers(chunk, {
        mode,
        rng,
        renameGlobals: opts.renameGlobals,
        prefix: opts.identifierPrefix,
        randomPrefix: opts.randomPrefix,
        reservedNames: opts.reservedNames
      });
      if (opts.renameProperties) {
        const propStats = renameProperties(chunk, { mode, rng, reservedNames: opts.reservedNames });
        renameStats.renamedProperties = propStats.renamedProperties;
        renameStats.propertyRenameMap = propStats.propertyRenameMap;
      }
    }

    if (opts.wrappers.count > 0) {
      applyWrappers(chunk, {
        rng, nameGen: internalNameGen, count: clamp(opts.wrappers.count, 0, 5), wrapperType: opts.wrappers.type
      });
    }

    const body = generate(chunk, { compact: opts.compact });
    const code = HEADER + body;

    let sourceMapArtifact = null;
    if (opts.sourceMap) {
      sourceMapArtifact = buildSourceMap(originalSnapshot, renameStats);
    }

    return {
      code,
      sourceMap: sourceMapArtifact,
      stats: {
        layers: opts.layers,
        stringsProtected: stringArrayStats.stringsProtected,
        renamedLocals: renameStats.renamedLocals,
        renamedGlobals: renameStats.renamedGlobals,
        renamedProperties: renameStats.renamedProperties
      }
    };
  }
}

function obfuscate(sourceCode, options) {
  return new TokynObfuscator(options).obfuscate(sourceCode);
}

return { TokynObfuscator, obfuscate, normalizeOptions };

})();

if (typeof window !== 'undefined') { window.TokynAST = Mod_index; }
if (typeof module !== 'undefined' && module.exports) { module.exports = Mod_index; }
