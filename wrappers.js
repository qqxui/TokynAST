'use strict';

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

module.exports = { applyWrappers };
