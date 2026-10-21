'use strict';

const { transformStatement } = require('../ast.js');

function splitStringLiteral(value, rng, fresh) {
  if (value.length < 2) return null;
  const splitPoint = rng.int(1, value.length);
  const left = { type: 'StringLiteral', value: value.slice(0, splitPoint) };
  const right = { type: 'StringLiteral', value: value.slice(splitPoint) };
  fresh.add(left);
  fresh.add(right);
  return { type: 'ParenExpression', expression: { type: 'BinaryExpression', operator: '..', left, right } };
}

function splitStrings(chunk, options) {
  const rng = options.rng;
  let count = 0;
  const fresh = new Set();
  function visitor(node) {
    if (fresh.has(node)) return undefined;
    if (node.type !== 'StringLiteral') return undefined;
    if (node.value.length < 2) return undefined;
    if (!rng.bool(options.probability === undefined ? 1 : options.probability)) return undefined;
    const result = splitStringLiteral(node.value, rng, fresh);
    if (!result) return undefined;
    count++;
    return result;
  }
  for (let i = 0; i < chunk.body.length; i++) {
    chunk.body[i] = transformStatement(chunk.body[i], { expr: visitor });
  }
  return { stringsSplit: count };
}

module.exports = { splitStrings };
