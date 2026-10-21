'use strict';

const { Lexer } = require('./lexer.js');

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

module.exports = { Parser, ParseError, parseProgram, parseStatementsFragment, parseExpressionFragment };
