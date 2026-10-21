'use strict';

const { Binder } = require('../scope.js');
const { NameGenerator } = require('../name-generator.js');

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

module.exports = { renameIdentifiers, DEFAULT_PROTECTED_GLOBALS, compileRegexes, matchesAny };
