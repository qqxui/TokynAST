'use strict';

const { parseProgram } = require('./parser.js');
const { generate } = require('./codegen.js');
const { RNG } = require('./rng.js');
const { NameGenerator } = require('./name-generator.js');

const { renameIdentifiers } = require('./transforms/rename-identifiers.js');
const { renameProperties } = require('./transforms/rename-properties.js');
const { numbersToExpressions } = require('./transforms/numbers-to-expressions.js');
const { splitStrings } = require('./transforms/split-strings.js');
const { injectDeadCode } = require('./transforms/dead-code.js');
const { controlFlowFlatten } = require('./transforms/control-flow-flatten.js');
const { stringArray } = require('./transforms/string-array.js');
const { applyWrappers } = require('./transforms/wrappers.js');
const { injectDebugProtection } = require('./transforms/debug-protection.js');
const { injectAntiTamper } = require('./transforms/anti-tamper.js');
const { injectEnvironmentChecks } = require('./transforms/environment-checks.js');
const { buildSourceMap, snapshotTopLevel } = require('./transforms/source-map.js');

const HEADER = '-- Protected by TokynAST V2.0\n';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function normalizeOptions(raw) {
  const o = raw || {};
  return {
    seed: o.seed,
    layers: clamp(o.layers === undefined ? 1 : o.layers, 1, 5),
    compact: !!o.compact,
    minify: !!o.minify,
    identifierProtection: !!o.identifierProtection,
    nameGenerator: o.nameGenerator || 'mangled',
    identifierPrefix: o.identifierPrefix || '',
    randomPrefix: !!o.randomPrefix,
    renameGlobals: !!o.renameGlobals,
    renameProperties: !!o.renameProperties,
    reservedNames: o.reservedNames || [],
    reservedStrings: o.reservedStrings || [],
    constantProtection: !!o.constantProtection,
    stringArray: Object.assign({
      enabled: true,
      threshold: 0.75,
      rotate: false,
      shuffle: false,
      encoding: 'none',
      doubleLayer: false
    }, o.stringArray || {}),
    wrappers: Object.assign({ count: 0, type: 'function' }, o.wrappers || {}),
    sourceMap: !!o.sourceMap,
    splitStrings: !!o.splitStrings,
    controlFlowFlatten: o.controlFlowFlatten === undefined ? 0 : o.controlFlowFlatten,
    controlFlowFakePaths: o.controlFlowFakePaths === undefined ? 0 : o.controlFlowFakePaths,
    numbersToExpressions: !!o.numbersToExpressions,
    deadCodeInjection: !!o.deadCodeInjection,
    debugProtection: !!o.debugProtection,
    antiTamper: !!o.antiTamper,
    environmentChecks: !!o.environmentChecks
  };
}

class TokynObfuscator {
  constructor(options) {
    this.options = normalizeOptions(options);
  }

  obfuscate(sourceCode) {
    const opts = this.options;
    const rng = new RNG(opts.seed);
    const internalNameGen = new NameGenerator({ mode: 'hex', rng });

    const chunk = parseProgram(sourceCode);
    const originalSnapshot = snapshotTopLevel(chunk);

    for (let pass = 0; pass < opts.layers; pass++) {
      if (opts.controlFlowFlatten > 0) {
        controlFlowFlatten(chunk, {
          rng, probability: opts.controlFlowFlatten,
          nameGen: internalNameGen, fakeDensity: opts.controlFlowFakePaths
        });
      }
      if (opts.deadCodeInjection) {
        injectDeadCode(chunk, { rng, nameGen: internalNameGen, density: 0.22 });
      }
      if (opts.numbersToExpressions) {
        numbersToExpressions(chunk, { rng, probability: 1 });
      }
      if (opts.splitStrings) {
        splitStrings(chunk, { rng, probability: 0.6 });
      }
    }

    let stringArrayStats = { stringsProtected: 0 };
    if (opts.constantProtection && opts.stringArray.enabled) {
      stringArrayStats = stringArray(chunk, {
        rng,
        threshold: opts.stringArray.threshold,
        reservedStrings: opts.reservedStrings,
        encoding: opts.stringArray.encoding,
        rotate: opts.stringArray.rotate,
        shuffle: opts.stringArray.shuffle,
        doubleLayer: opts.stringArray.doubleLayer,
        internalNameGen
      });
    }

    if (opts.debugProtection) {
      injectDebugProtection(chunk, { internalNameGen });
    }
    if (opts.antiTamper) {
      injectAntiTamper(chunk, { internalNameGen });
    }
    if (opts.environmentChecks) {
      injectEnvironmentChecks(chunk, { internalNameGen });
    }

    let renameStats = { renamedLocals: 0, renamedGlobals: 0, renamedProperties: 0 };
    if (opts.identifierProtection || opts.minify) {
      const mode = opts.identifierProtection ? opts.nameGenerator : 'minify';
      renameStats = renameIdentifiers(chunk, {
        mode,
        rng,
        renameGlobals: opts.renameGlobals,
        prefix: opts.identifierPrefix,
        randomPrefix: opts.randomPrefix,
        reservedNames: opts.reservedNames
      });
      if (opts.renameProperties) {
        const propStats = renameProperties(chunk, { mode, rng, reservedNames: opts.reservedNames });
        renameStats.renamedProperties = propStats.renamedProperties;
        renameStats.propertyRenameMap = propStats.propertyRenameMap;
      }
    }

    if (opts.wrappers.count > 0) {
      applyWrappers(chunk, {
        rng, nameGen: internalNameGen, count: clamp(opts.wrappers.count, 0, 5), wrapperType: opts.wrappers.type
      });
    }

    const body = generate(chunk, { compact: opts.compact });
    const code = HEADER + body;

    let sourceMapArtifact = null;
    if (opts.sourceMap) {
      sourceMapArtifact = buildSourceMap(originalSnapshot, renameStats);
    }

    return {
      code,
      sourceMap: sourceMapArtifact,
      stats: {
        layers: opts.layers,
        stringsProtected: stringArrayStats.stringsProtected,
        renamedLocals: renameStats.renamedLocals,
        renamedGlobals: renameStats.renamedGlobals,
        renamedProperties: renameStats.renamedProperties
      }
    };
  }
}

function obfuscate(sourceCode, options) {
  return new TokynObfuscator(options).obfuscate(sourceCode);
}

module.exports = { TokynObfuscator, obfuscate, normalizeOptions };
