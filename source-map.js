'use strict';

function summarizeStatement(stmt) {
  switch (stmt.type) {
    case 'LocalStatement':
      return 'local ' + stmt.names.map((n) => n.name).join(', ');
    case 'FunctionDeclaration':
      return (stmt.isLocal ? 'local function ' : 'function ') +
        (stmt.target.type === 'Identifier' ? stmt.target.name : '<member>');
    case 'AssignmentStatement':
      return stmt.targets.map((t) => (t.type === 'Identifier' ? t.name : '<expr>')).join(', ') + ' =';
    case 'CallStatement':
      return '<call>';
    default:
      return stmt.type;
  }
}

function snapshotTopLevel(chunk) {
  return chunk.body.map((stmt, i) => ({
    index: i,
    originalLine: stmt.$line || null,
    summary: summarizeStatement(stmt)
  }));
}

function buildSourceMap(topLevel, renameStats) {
  return {
    note: 'Best-effort map: original top-level statement order/lines, plus identifier rename tables. ' +
      'Structural transforms (control-flow flattening, dead-code injection, wrappers) are not individually traced.',
    topLevelStatements: topLevel,
    renamedLocals: (renameStats && renameStats.localRenameList) || [],
    renamedGlobals: (renameStats && renameStats.globalRenameMap) || {},
    renamedProperties: (renameStats && renameStats.propertyRenameMap) || {}
  };
}

module.exports = { buildSourceMap, snapshotTopLevel };
