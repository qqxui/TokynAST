'use strict';

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

module.exports = { Scope, Binder };
