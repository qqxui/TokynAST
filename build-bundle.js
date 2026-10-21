const path = require('path');
const fs = require('fs');

const ROOT = '/home/claude/tokyn-ast';

const files = [
  'src/lexer.js',
  'src/ast.js',
  'src/rng.js',
  'src/name-generator.js',
  'src/scope.js',
  'src/utils/encoding.js',
  'src/parser.js',
  'src/codegen.js',
  'src/transforms/rename-identifiers.js',
  'src/transforms/rename-properties.js',
  'src/transforms/numbers-to-expressions.js',
  'src/transforms/split-strings.js',
  'src/transforms/dead-code.js',
  'src/transforms/control-flow-flatten.js',
  'src/transforms/wrappers.js',
  'src/transforms/debug-protection.js',
  'src/transforms/anti-tamper.js',
  'src/transforms/environment-checks.js',
  'src/transforms/source-map.js',
  'src/transforms/string-array.js',
  'src/index.js'
];

function varNameFor(relPath) {
  return 'Mod_' + relPath.replace(/^src\//, '').replace(/\.js$/, '').replace(/[\/\-]/g, '_');
}

const fileToVar = {};
for (const f of files) fileToVar[f] = varNameFor(f);

let bundle = '/* ===== Tokyn AST engine bundle (generated from src/, do not hand-edit) ===== */\n';
for (const f of files) {
  const abs = path.join(ROOT, f);
  let content = fs.readFileSync(abs, 'utf8');
  content = content.replace(/^'use strict';\n*/, '');
  content = content.replace(/require\(\s*['"]([^'"]+)['"]\s*\)/g, (match, reqPath) => {
    const dir = path.dirname(f);
    let resolved = path.normalize(path.join(dir, reqPath)).replace(/\\/g, '/');
    if (!fileToVar[resolved]) {
      throw new Error('Cannot resolve require path "' + reqPath + '" from ' + f + ' -> tried "' + resolved + '"');
    }
    return fileToVar[resolved];
  });
  content = content.replace(/module\.exports\s*=\s*/, 'return ');
  bundle += `const ${fileToVar[f]} = (function() {\n${content}\n})();\n\n`;
}
bundle += `if (typeof window !== 'undefined') { window.TokynAST = ${fileToVar['src/index.js']}; }\n`;
bundle += `if (typeof module !== 'undefined' && module.exports) { module.exports = ${fileToVar['src/index.js']}; }\n`;

fs.writeFileSync(path.join(ROOT, 'dist/engine-bundle.js'), bundle);
console.log('Engine bundle written:', bundle.length, 'bytes');

const shellPath = path.join(ROOT, 'ui/shell.html');
const uiLogicPath = path.join(ROOT, 'ui/ui-logic.js');
if (fs.existsSync(shellPath) && fs.existsSync(uiLogicPath)) {
  const shell = fs.readFileSync(shellPath, 'utf8');
  const uiLogic = fs.readFileSync(uiLogicPath, 'utf8');
  const full = shell + bundle + uiLogic + '</script></body></html>\n';
  fs.writeFileSync(path.join(ROOT, 'index.html'), full);
  console.log('index.html assembled:', full.length, 'bytes');
} else {
  console.log('ui/shell.html or ui/ui-logic.js not found -- skipped assembling index.html');
}
