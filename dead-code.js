'use strict';

const { transformStatement } = require('../ast.js');

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

module.exports = { injectDeadCode, makeFakeStatement, makeFakeExpr, makeDeadBlock, makeSafeFakeBlock };
