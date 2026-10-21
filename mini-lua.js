'use strict';

class LuaTable {
  constructor() {
    this.map = new Map();
    this.mt = null;
  }
  arrayLen() {
    let n = 0;
    while (this.map.has(n + 1)) n++;
    return n;
  }
}

class LuaError extends Error {
  constructor(value) {
    super(typeof value === 'string' ? value : '(non-string error)');
    this.value = value;
  }
}

class BreakSignal {}
class ContinueSignal {}
class ReturnSignal {
  constructor(values) { this.values = values; }
}

function truthy(v) {
  return v !== null && v !== false && v !== undefined;
}

function luaType(v) {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'boolean';
  if (v instanceof LuaTable) return 'table';
  if (typeof v === 'function' || v instanceof LuaFunction) return 'function';
  return 'userdata';
}

function luaToString(v) {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  if (v instanceof LuaTable) return 'table: 0x0';
  return 'function: 0x0';
}

class LuaFunction {
  constructor(node, closureEnv, interp) {
    this.node = node;
    this.closureEnv = closureEnv;
    this.interp = interp;
  }
}

class Env {
  constructor(parent) {
    this.parent = parent;
    this.vars = new Map();
  }
  declare(name, value) {
    this.vars.set(name, { value });
  }
  getCell(name) {
    let e = this;
    while (e) {
      if (e.vars.has(name)) return e.vars.get(name);
      e = e.parent;
    }
    return null;
  }
}

class Interpreter {
  constructor() {
    this.output = [];
    this.globals = new Env(null);
    this.installStdlib();
    this.steps = 0;
    this.maxSteps = 2000000;
  }

  installStdlib() {
    const g = this.globals;
    g.declare('print', (args) => {
      this.output.push(args.map(luaToString).join('\t'));
      return [];
    });
    g.declare('type', (args) => [luaType(args[0])]);
    g.declare('tostring', (args) => [luaToString(args[0])]);
    g.declare('tonumber', (args) => {
      const v = args[0];
      if (typeof v === 'number') return [v];
      const n = Number(v);
      return [Number.isNaN(n) ? null : n];
    });
    g.declare('pairs', (args) => [{ __iter: 'pairs', t: args[0] }, args[0], null]);
    g.declare('ipairs', (args) => [{ __iter: 'ipairs', t: args[0] }, args[0], 0]);
    g.declare('assert', (args) => {
      if (!truthy(args[0])) throw new LuaError(args[1] !== undefined ? args[1] : 'assertion failed!');
      return args;
    });
    g.declare('error', (args) => { throw new LuaError(args[0]); });
    g.declare('pcall', (args) => {
      const [fn, ...rest] = args;
      try {
        const r = this.callFunction(fn, rest);
        return [true, ...r];
      } catch (e) {
        if (e instanceof LuaError) return [false, e.value];
        throw e;
      }
    });
    g.declare('select', (args) => {
      const [n, ...rest] = args;
      if (n === '#') return [rest.length];
      return rest.slice(n - 1);
    });
    g.declare('setmetatable', (args) => { args[0].mt = args[1]; return [args[0]]; });
    g.declare('getmetatable', (args) => [args[0] instanceof LuaTable ? args[0].mt : null]);
    g.declare('rawget', (args) => [args[0].map.get(args[1])]);
    g.declare('rawset', (args) => { args[0].map.set(args[1], args[2]); return [args[0]]; });
    g.declare('rawequal', (args) => [args[0] === args[1]]);
    g.declare('unpack', (args) => this.tableToArray(args[0]));

    const stringLib = new LuaTable();
    stringLib.map.set('format', (args) => [this.luaFormat(args[0], args.slice(1))]);
    stringLib.map.set('len', (args) => [String(args[0]).length]);
    stringLib.map.set('sub', (args) => {
      const s = args[0];
      let i = args[1] === undefined ? 1 : args[1];
      let j = args[2] === undefined ? -1 : args[2];
      const len = s.length;
      if (i < 0) i = Math.max(len + i + 1, 1);
      if (i === 0) i = 1;
      if (j < 0) j = len + j + 1;
      if (j > len) j = len;
      if (i > j) return [''];
      return [s.slice(i - 1, j)];
    });
    stringLib.map.set('upper', (args) => [String(args[0]).toUpperCase()]);
    stringLib.map.set('lower', (args) => [String(args[0]).toLowerCase()]);
    stringLib.map.set('rep', (args) => [String(args[0]).repeat(Math.max(0, args[1]))]);
    stringLib.map.set('byte', (args) => [String(args[0]).charCodeAt((args[1] || 1) - 1)]);
    stringLib.map.set('char', (args) => [String.fromCharCode(...args)]);
    stringLib.map.set('reverse', (args) => [String(args[0]).split('').reverse().join('')]);
    g.declare('string', stringLib);

    const mathLib = new LuaTable();
    mathLib.map.set('floor', (args) => [Math.floor(args[0])]);
    mathLib.map.set('ceil', (args) => [Math.ceil(args[0])]);
    mathLib.map.set('abs', (args) => [Math.abs(args[0])]);
    mathLib.map.set('max', (args) => [Math.max(...args)]);
    mathLib.map.set('min', (args) => [Math.min(...args)]);
    mathLib.map.set('sqrt', (args) => [Math.sqrt(args[0])]);
    mathLib.map.set('huge', Infinity);
    mathLib.map.set('pi', Math.PI);
    g.declare('math', mathLib);

    const tableLib = new LuaTable();
    tableLib.map.set('insert', (args) => {
      const t = args[0];
      if (args.length === 2) {
        t.map.set(t.arrayLen() + 1, args[1]);
      } else {
        const pos = args[1];
        const val = args[2];
        const len = t.arrayLen();
        for (let i = len + 1; i > pos; i--) t.map.set(i, t.map.get(i - 1));
        t.map.set(pos, val);
      }
      return [];
    });
    tableLib.map.set('remove', (args) => {
      const t = args[0];
      const len = t.arrayLen();
      const pos = args[1] === undefined ? len : args[1];
      const v = t.map.get(pos);
      for (let i = pos; i < len; i++) t.map.set(i, t.map.get(i + 1));
      t.map.delete(len);
      return [v === undefined ? null : v];
    });
    tableLib.map.set('concat', (args) => {
      const t = args[0];
      const sep = args[1] || '';
      const len = t.arrayLen();
      const parts = [];
      for (let i = 1; i <= len; i++) parts.push(luaToString(t.map.get(i)));
      return [parts.join(sep)];
    });
    g.declare('table', tableLib);
  }

  luaFormat(fmt, args) {
    let i = 0;
    return fmt.replace(/%[sdif%]/g, (m) => {
      if (m === '%%') return '%';
      const v = args[i++];
      if (m === '%d' || m === '%i') return String(Math.trunc(v));
      if (m === '%f') return String(v);
      return luaToString(v);
    });
  }

  tableToArray(t) {
    const len = t.arrayLen();
    const out = [];
    for (let i = 1; i <= len; i++) out.push(t.map.get(i) === undefined ? null : t.map.get(i));
    return out;
  }

  run(chunk) {
    const env = new Env(this.globals);
    try {
      this.execBlock(chunk.body, env);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.values;
      throw e;
    }
    return [];
  }

  execBlock(stmts, env) {
    for (const stmt of stmts) {
      this.execStatement(stmt, env);
    }
  }

  step() {
    this.steps++;
    if (this.steps > this.maxSteps) throw new Error('step limit exceeded (possible infinite loop)');
  }

  execStatement(stmt, env) {
    this.step();
    switch (stmt.type) {
      case 'LocalStatement': {
        const values = this.evalExprListMulti(stmt.init, env);
        stmt.names.forEach((n, i) => env.declare(n.name, values[i] === undefined ? null : values[i]));
        return;
      }
      case 'AssignmentStatement': {
        if (stmt.operator === '=') {
          const values = this.evalExprListMulti(stmt.init, env);
          stmt.targets.forEach((t, i) => this.assignTo(t, values[i] === undefined ? null : values[i], env));
        } else {
          const op = stmt.operator.slice(0, -1);
          const target = stmt.targets[0];
          const current = this.evalExpr(target, env);
          const rhs = this.evalExpr(stmt.init[0], env);
          const result = this.applyBinary(op, current, rhs);
          this.assignTo(target, result, env);
        }
        return;
      }
      case 'CallStatement':
        this.evalExprMulti(stmt.call, env);
        return;
      case 'DoStatement':
        this.execBlock(stmt.body, new Env(env));
        return;
      case 'WhileStatement':
        while (truthy(this.evalExpr(stmt.condition, env))) {
          this.step();
          try {
            this.execBlock(stmt.body, new Env(env));
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      case 'RepeatStatement':
        for (;;) {
          this.step();
          const inner = new Env(env);
          try {
            this.execBlock(stmt.body, inner);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) {
              if (truthy(this.evalExpr(stmt.condition, inner))) break;
              continue;
            }
            throw e;
          }
          if (truthy(this.evalExpr(stmt.condition, inner))) break;
        }
        return;
      case 'IfStatement':
        for (const clause of stmt.clauses) {
          if (clause.condition === null || truthy(this.evalExpr(clause.condition, env))) {
            this.execBlock(clause.body, new Env(env));
            return;
          }
        }
        return;
      case 'NumericForStatement': {
        const start = this.evalExpr(stmt.start, env);
        const limit = this.evalExpr(stmt.limit, env);
        const step = stmt.step ? this.evalExpr(stmt.step, env) : 1;
        for (let i = start; step > 0 ? i <= limit : i >= limit; i += step) {
          this.step();
          const inner = new Env(env);
          inner.declare(stmt.variable, i);
          try {
            this.execBlock(stmt.body, inner);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      }
      case 'GenericForStatement': {
        const vals = this.evalExprListMulti(stmt.exprs, env);
        const iter = vals[0];
        const state = vals[1];
        let control = vals[2] === undefined ? null : vals[2];
        for (;;) {
          this.step();
          const results = this.iterate(iter, state, control);
          if (results[0] === null || results[0] === undefined) break;
          control = results[0];
          const inner = new Env(env);
          stmt.names.forEach((n, i) => inner.declare(n, results[i] === undefined ? null : results[i]));
          try {
            this.execBlock(stmt.body, inner);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        return;
      }
      case 'FunctionDeclaration': {
        const fn = new LuaFunction({ params: stmt.params, hasVararg: stmt.hasVararg, body: stmt.body }, env, this);
        if (stmt.isLocal) {
          env.declare(stmt.target.name, null);
          env.getCell(stmt.target.name).value = fn;
        } else {
          this.assignTo(stmt.target, fn, env);
        }
        return;
      }
      case 'ReturnStatement':
        throw new ReturnSignal(this.evalExprListMulti(stmt.args, env));
      case 'BreakStatement':
        throw new BreakSignal();
      case 'ContinueStatement':
        throw new ContinueSignal();
      case 'GotoStatement':
      case 'LabelStatement':
        throw new Error('goto/label not supported in mini interpreter');
      default:
        throw new Error('unhandled statement ' + stmt.type);
    }
  }

  iterate(iter, state, control) {
    if (iter && iter.__iter === 'pairs') {
      const t = iter.t;
      const keys = [...t.map.keys()];
      const idx = control === null ? -1 : keys.indexOf(control);
      if (idx + 1 >= keys.length) return [null];
      const k = keys[idx + 1];
      return [k, t.map.get(k)];
    }
    if (iter && iter.__iter === 'ipairs') {
      const t = iter.t;
      const n = (control || 0) + 1;
      if (!t.map.has(n)) return [null];
      return [n, t.map.get(n)];
    }
    return this.callFunction(iter, [state, control]);
  }

  tableGet(t, key) {
    if (t instanceof LuaTable) {
      if (t.map.has(key)) return t.map.get(key);
      if (t.mt) {
        const idx = t.mt.map.get('__index');
        if (idx instanceof LuaTable) return this.tableGet(idx, key);
        if (idx) {
          const r = this.callFunction(idx, [t, key]);
          return r.length ? r[0] : null;
        }
      }
      return null;
    }
    if (typeof t === 'string') {
      const strLib = this.globals.getCell('string').value;
      const v = strLib.map.get(key);
      return v === undefined ? null : v;
    }
    throw new Error('attempt to index a ' + luaType(t) + ' value');
  }

  assignTo(target, value, env) {
    if (target.type === 'Identifier') {
      const cell = env.getCell(target.name);
      if (cell) cell.value = value;
      else this.globals.declare(target.name, value);
      return;
    }
    if (target.type === 'MemberExpression') {
      const obj = this.evalExpr(target.object, env);
      const key = target.computed ? this.evalExpr(target.property, env) : target.property;
      obj.map.set(key, value);
      return;
    }
    throw new Error('invalid assignment target ' + target.type);
  }

  evalExprListMulti(exprs, env) {
    if (exprs.length === 0) return [];
    const out = [];
    for (let i = 0; i < exprs.length - 1; i++) out.push(this.evalExpr(exprs[i], env));
    out.push(...this.evalExprMulti(exprs[exprs.length - 1], env));
    return out;
  }

  evalExprMulti(expr, env) {
    if (expr.type === 'CallExpression' || expr.type === 'MethodCallExpression') {
      return this.evalCall(expr, env);
    }
    if (expr.type === 'VarargExpression') return [];
    return [this.evalExpr(expr, env)];
  }

  evalExpr(expr, env) {
    const r = this._evalExpr(expr, env);
    return Array.isArray(r) ? (r.length ? r[0] : null) : r;
  }

  _evalExpr(expr, env) {
    switch (expr.type) {
      case 'NumericLiteral': return expr.value;
      case 'StringLiteral': return expr.value;
      case 'BooleanLiteral': return expr.value;
      case 'NilLiteral': return null;
      case 'VarargExpression': return null;
      case 'Identifier': {
        const cell = env.getCell(expr.name);
        return cell ? cell.value : null;
      }
      case 'ParenExpression':
        return this.evalExpr(expr.expression, env);
      case 'UnaryExpression': {
        const v = this.evalExpr(expr.argument, env);
        if (expr.operator === '-') return -v;
        if (expr.operator === 'not') return !truthy(v);
        if (expr.operator === '#') {
          if (typeof v === 'string') return v.length;
          if (v instanceof LuaTable) return v.arrayLen();
        }
        throw new Error('bad unary ' + expr.operator);
      }
      case 'BinaryExpression': {
        if (expr.operator === 'and') {
          const l = this.evalExpr(expr.left, env);
          return truthy(l) ? this.evalExpr(expr.right, env) : l;
        }
        if (expr.operator === 'or') {
          const l = this.evalExpr(expr.left, env);
          return truthy(l) ? l : this.evalExpr(expr.right, env);
        }
        const l = this.evalExpr(expr.left, env);
        const r = this.evalExpr(expr.right, env);
        return this.applyBinary(expr.operator, l, r);
      }
      case 'MemberExpression': {
        const obj = this.evalExpr(expr.object, env);
        const key = expr.computed ? this.evalExpr(expr.property, env) : expr.property;
        return this.tableGet(obj, key);
      }
      case 'CallExpression':
      case 'MethodCallExpression': {
        const r = this.evalCall(expr, env);
        return r.length ? r[0] : null;
      }
      case 'FunctionExpression':
        return new LuaFunction({ params: expr.params, hasVararg: expr.hasVararg, body: expr.body }, env, this);
      case 'TableConstructor': {
        const t = new LuaTable();
        let arrIdx = 1;
        expr.fields.forEach((f, i) => {
          if (f.kind === 'key') {
            t.map.set(this.evalExpr(f.key, env), this.evalExpr(f.value, env));
          } else if (f.kind === 'name') {
            t.map.set(f.key, this.evalExpr(f.value, env));
          } else {
            if (i === expr.fields.length - 1) {
              const vals = this.evalExprMulti(f.value, env);
              vals.forEach((v) => t.map.set(arrIdx++, v));
            } else {
              t.map.set(arrIdx++, this.evalExpr(f.value, env));
            }
          }
        });
        return t;
      }
      case 'IfExpression': {
        for (const c of expr.clauses) {
          if (truthy(this.evalExpr(c.condition, env))) return this.evalExpr(c.body, env);
        }
        return this.evalExpr(expr.elseBody, env);
      }
      case 'StringInterpolation': {
        let s = '';
        for (const p of expr.parts) {
          if (p.kind === 'string') s += p.value;
          else s += luaToString(this.evalExpr(p.expr, env));
        }
        return s;
      }
      default:
        throw new Error('unhandled expr ' + expr.type);
    }
  }

  applyBinary(op, l, r) {
    switch (op) {
      case '+': return l + r;
      case '-': return l - r;
      case '*': return l * r;
      case '/': return l / r;
      case '//': return Math.floor(l / r);
      case '%': return l - Math.floor(l / r) * r;
      case '^': return Math.pow(l, r);
      case '..': return luaToString(l) + luaToString(r);
      case '==': return luaEquals(l, r);
      case '~=': return !luaEquals(l, r);
      case '<': return l < r;
      case '<=': return l <= r;
      case '>': return l > r;
      case '>=': return l >= r;
      default: throw new Error('bad binary op ' + op);
    }
  }

  evalCall(expr, env) {
    let fn;
    let args;
    if (expr.type === 'MethodCallExpression') {
      const obj = this.evalExpr(expr.object, env);
      fn = this.tableGet(obj, expr.method);
      args = [obj, ...this.evalExprListMulti(expr.args, env)];
    } else {
      fn = this.evalExpr(expr.callee, env);
      args = this.evalExprListMulti(expr.args, env);
    }
    return this.callFunction(fn, args);
  }

  callFunction(fn, args) {
    this.step();
    if (typeof fn === 'function') {
      const r = fn(args);
      return r || [];
    }
    if (fn instanceof LuaFunction) {
      const env = new Env(fn.closureEnv);
      fn.node.params.forEach((p, i) => env.declare(p.name, args[i] === undefined ? null : args[i]));
      try {
        this.execBlock(fn.node.body, env);
      } catch (e) {
        if (e instanceof ReturnSignal) return e.values;
        throw e;
      }
      return [];
    }
    throw new Error('attempt to call a ' + luaType(fn) + ' value');
  }
}

function luaEquals(a, b) {
  if (a === null && b === undefined) return true;
  if (a === undefined && b === null) return true;
  return a === b;
}

function runSource(parseProgram, source) {
  const ast = parseProgram(source);
  const interp = new Interpreter();
  interp.run(ast);
  return interp.output.join('\n');
}

module.exports = { Interpreter, runSource, LuaTable };
