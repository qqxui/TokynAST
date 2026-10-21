'use strict';

const { transformStatement } = require('../ast.js');

function findFactorPair(v, rng) {
  const n = Math.abs(v);
  if (n < 4) return null;
  const divisors = [];
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) divisors.push(i);
  }
  if (divisors.length === 0) return null;
  const d = rng.pick(divisors);
  let a = d;
  const b = n / d;
  if (v < 0) a = -a;
  return [a, b];
}

function lit(value, fresh) {
  const n = { type: 'NumericLiteral', value };
  fresh.add(n);
  return n;
}

function wrap(operator, left, right) {
  return { type: 'ParenExpression', expression: { type: 'BinaryExpression', operator, left, right } };
}

function splitNumber(v, rng, fresh) {
  const strategy = rng.int(0, 3);
  if (strategy === 2) {
    const pair = findFactorPair(v, rng);
    if (pair) return wrap('*', lit(pair[0], fresh), lit(pair[1], fresh));
  }
  if (strategy === 1) {
    const a = rng.int(1, 51);
    return wrap('-', lit(v + a, fresh), lit(a, fresh));
  }
  const bound = Math.max(2, Math.floor(Math.abs(v)));
  const a = rng.int(1, bound);
  return wrap('+', lit(v - a, fresh), lit(a, fresh));
}

function numbersToExpressions(chunk, options) {
  const rng = options.rng;
  let count = 0;
  const fresh = new Set();
  function visitor(node) {
    if (fresh.has(node)) return undefined;
    if (node.type !== 'NumericLiteral') return undefined;
    if (!Number.isInteger(node.value) || !Number.isFinite(node.value)) return undefined;
    if (Math.abs(node.value) < 2 || Math.abs(node.value) > 1e9) return undefined;
    if (!rng.bool(options.probability === undefined ? 1 : options.probability)) return undefined;
    count++;
    return splitNumber(node.value, rng, fresh);
  }
  for (let i = 0; i < chunk.body.length; i++) {
    chunk.body[i] = transformStatement(chunk.body[i], { expr: visitor });
  }
  return { numbersTransformed: count };
}

module.exports = { numbersToExpressions, splitNumber };
