'use strict';

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

module.exports = { generate, formatNumber, formatString, formatStringRawBytes, Writer };
