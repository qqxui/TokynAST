'use strict';

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

module.exports = { transformExpr, transformStatement, transformStatements, cloneShallow };
