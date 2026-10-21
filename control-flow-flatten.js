'use strict';

const { transformStatement } = require('../ast.js');
const { makeDeadBlock, makeSafeFakeBlock } = require('./dead-code.js');

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

module.exports = { controlFlowFlatten };
