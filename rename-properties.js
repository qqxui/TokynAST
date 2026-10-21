'use strict';

const { NameGenerator } = require('../name-generator.js');
const { compileRegexes, matchesAny } = require('./rename-identifiers.js');

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

module.exports = { renameProperties, DEFAULT_PROTECTED_PROPERTIES };
