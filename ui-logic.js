(function () {
  'use strict';

  var STAGES = [
    { id: 'parse', label: 'Parse' },
    { id: 'transform', label: 'Transform' },
    { id: 'protect', label: 'Protect' },
    { id: 'harden', label: 'Harden' },
    { id: 'rename', label: 'Rename' },
    { id: 'emit', label: 'Emit' }
  ];

  var SCHEMA = [
    { section: 'General', controls: [
      { id: 'layers', label: 'Layers', type: 'range', min: 1, max: 5, step: 1, def: 2,
        info: 'Repeats dead-code, numbers-to-expressions, split-strings, and control-flow-flatten this many times, each pass compounding on the last.' },
      { id: 'seed', label: 'Seed', type: 'text', def: '', placeholder: 'random if empty',
        info: 'Same seed + same options always produces the exact same output. Leave empty for a fresh random build each time.' },
      { id: 'compact', label: 'Compact (1 line)', type: 'toggle', def: false,
        info: 'Strips all non-essential whitespace so the whole script prints on one line.' },
      { id: 'minify', label: 'Minify short names', type: 'toggle', def: false,
        info: 'Renames local variables to short a/b/c-style names. Ignored if Identifier Protection is on, which takes over naming.' }
    ]},
    { section: 'Identifier Protection', controls: [
      { id: 'identifierProtection', label: 'Enable', type: 'toggle', def: true, master: true,
        info: 'Renames every local variable, parameter, and loop variable. Scope-aware, so shadowing and closures still work correctly.' },
      { id: 'nameGenerator', label: 'Name Style', type: 'select', def: 'mangled',
        options: [['hex', 'Hexadecimal'], ['mangled', 'Mangled'], ['mangled-shuffle', 'Mangled-Shuffle']],
        info: 'Hexadecimal looks like _0x4f2a. Mangled uses confusable Il1O0o characters. Mangled-Shuffle randomizes which of those characters look-alike per build.' },
      { id: 'identifierPrefix', label: 'Prefix (globals)', type: 'text', def: '',
        info: 'An optional fixed prefix added only to renamed global identifiers, not locals.' },
      { id: 'randomPrefix', label: 'Random Prefix', type: 'toggle', def: false,
        info: 'Appends a random 4-character suffix to the global prefix so it differs on every build.' },
      { id: 'renameGlobals', label: 'Rename Globals', type: 'toggle', def: false,
        info: 'Also renames globals your script defines (assigns to). Globals you only read, like print or string.format, are never touched.' },
      { id: 'renameProperties', label: 'Rename Properties', type: 'toggle', def: false,
        info: 'Renames dot-access and table-constructor keys throughout the script. Common stdlib member names (format, insert, Connect, ...) are protected by default -- add more via Reserved Names if you call into other external APIs.' }
    ]},
    { section: 'Reserved', controls: [
      { id: 'reservedNames', label: 'Reserved Names (regex)', type: 'text', def: '',
        info: 'A regex pattern. Any local, global, or property name that matches is left exactly as written.' },
      { id: 'reservedStrings', label: 'Reserved Strings (regex)', type: 'text', def: '',
        info: 'A regex pattern. Any string literal that matches is never pulled into the string array.' }
    ]},
    { section: 'Constant Protection', controls: [
      { id: 'constantProtection', label: 'Enable String Array', type: 'toggle', def: true, master: true,
        info: 'Pulls string literals out into a table, accessed through a generated function instead of appearing as plain text.' },
      { id: 'threshold', label: 'Threshold', type: 'range', min: 0, max: 1, step: 0.05, def: 0.75,
        info: 'Probability that any given string literal is pulled into the array. 1.0 means every eligible string.' },
      { id: 'rotate', label: 'Rotate', type: 'toggle', def: false,
        info: 'Shifts the string array by a random amount so its storage order no longer matches the order strings appear in the code.' },
      { id: 'shuffle', label: 'Shuffle', type: 'toggle', def: false,
        info: 'Randomly permutes the string array\u2019s storage order on top of Rotate.' },
      { id: 'encoding', label: 'Encoding', type: 'select', def: 'base64',
        options: [['none', 'None'], ['base64', 'Base64'], ['xor', 'XOR'], ['rc4', 'RC4'], ['lcg', 'LCG Keystream'], ['xxtea', 'XXTEA'], ['chacha20', 'ChaCha20']],
        info: 'How array entries are encoded before being decoded once at load time. XOR/RC4/LCG/XXTEA/ChaCha20 each use a key that is generated at runtime from two independent embedded pieces, and every entry gets its own derived sub-key -- not one static key reused everywhere.' },
      { id: 'doubleLayer', label: 'Double-Layer Encryption', type: 'toggle', def: false,
        info: 'Encrypts each entry twice with two independently-derived keys using the same algorithm. Only applies when Encoding is XOR, RC4, LCG, XXTEA, or ChaCha20.' }
    ]},
    { section: 'Wrappers', controls: [
      { id: 'wrappersCount', label: 'Count', type: 'range', min: 0, max: 5, step: 1, def: 1,
        info: 'How many nested layers of indirection wrap the whole script.' },
      { id: 'wrappersType', label: 'Type', type: 'select', def: 'function',
        options: [['function', 'Function'], ['variable', 'Variable'], ['mixed', 'Mixed']],
        info: 'Function wraps in an immediately-invoked function. Variable assigns the function to a local first, then calls it. Mixed alternates between the two per layer.' }
    ]},
    { section: 'Advanced', controls: [
      { id: 'controlFlowFlatten', label: 'Control-Flow-Flatten', type: 'range', min: 0, max: 1, step: 0.05, def: 0,
        info: 'Rewrites straight-line blocks into a state-machine dispatcher loop, so reading top-to-bottom no longer reveals execution order.' },
      { id: 'controlFlowFakePaths', label: 'Fake Paths', type: 'range', min: 0, max: 1, step: 0.05, def: 0,
        info: 'Adds decoy dispatcher states: some real transitions hop through a harmless detour state first, and extra states are added that are never actually reached. Only matters when Control-Flow-Flatten is above 0.' },
      { id: 'numbersToExpressions', label: 'Numbers to Expressions', type: 'toggle', def: false,
        info: 'Replaces number literals with arithmetic expressions that evaluate to the same value, e.g. 42 becomes (35+7).' },
      { id: 'splitStrings', label: 'Split Strings', type: 'toggle', def: false,
        info: 'Breaks string literals into multiple concatenated chunks at random points.' },
      { id: 'deadCodeInjection', label: 'Dead Code Injection', type: 'toggle', def: false,
        info: 'Inserts always-false branches and loops that never run, containing plausible-looking but inert filler code.' },
      { id: 'sourceMap', label: 'Source Map', type: 'toggle', def: false,
        info: 'Returns a separate JSON map of original top-level statement lines plus the full rename tables, for decoding your own error messages later. Not embedded in the protected script.' }
    ]},
    { section: 'Protection', controls: [
      { id: 'debugProtection', label: 'Debug Protection', type: 'toggle', def: false,
        info: 'Checks for an already-installed debug hook and periodically re-installs its own, so external tracing tools conflict with it.' },
      { id: 'antiTamper', label: 'Self-Defending / Anti-Tamper', type: 'toggle', def: false,
        info: 'Hashes a canary function at startup and rechecks it later -- a mismatch means something patched a function at runtime after load.' },
      { id: 'environmentChecks', label: 'Environment Checks', type: 'toggle', def: false,
        info: 'Verifies core globals (print, pairs, string, table, ...) are present with the right type, checks for common exploit-executor marker globals, and does a coarse timing check for extreme single-step slowdowns.' }
    ]}
  ];

  var state = {};
  SCHEMA.forEach(function (sec) {
    sec.controls.forEach(function (c) { state[c.id] = c.def; });
  });

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function buildPipeline() {
    var container = document.getElementById('pipeline');
    STAGES.forEach(function (s, i) {
      if (i > 0) container.appendChild(el('div', { class: 'pline', id: 'pline-' + i }));
      var dot = el('div', { class: 'pdot', text: String(i + 1) });
      var label = el('div', { class: 'plabel', text: s.label });
      container.appendChild(el('div', { class: 'pstage', id: 'pstage-' + s.id }, [dot, label]));
    });
  }

  function resetPipeline() {
    STAGES.forEach(function (s) {
      var node = document.getElementById('pstage-' + s.id);
      node.classList.remove('active', 'done');
    });
    document.querySelectorAll('.pline').forEach(function (l) { l.classList.remove('done'); });
  }

  function setStage(index, mode) {
    var node = document.getElementById('pstage-' + STAGES[index].id);
    node.classList.remove('active', 'done');
    node.classList.add(mode);
    if (mode === 'done') {
      var line = document.getElementById('pline-' + index);
      if (line) line.classList.add('done');
    }
  }

  function runPipelineAnimation() {
    return new Promise(function (resolve) {
      var i = 0;
      function step() {
        if (i > 0) setStage(i - 1, 'done');
        if (i >= STAGES.length) { resolve(); return; }
        setStage(i, 'active');
        i++;
        setTimeout(step, 210 + Math.random() * 90);
      }
      step();
    });
  }

  var openTooltipBtn = null;
  function makeInfoButton(infoText) {
    var btn = el('button', { type: 'button', class: 'info-btn', title: infoText });
    btn.textContent = '\u24D8';
    var bubble = el('div', { class: 'info-bubble', text: infoText });
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var isOpen = bubble.classList.contains('open');
      document.querySelectorAll('.info-bubble.open').forEach(function (b) { b.classList.remove('open'); });
      if (!isOpen) bubble.classList.add('open');
    });
    return { btn: btn, bubble: bubble };
  }
  document.addEventListener('click', function () {
    document.querySelectorAll('.info-bubble.open').forEach(function (b) { b.classList.remove('open'); });
  });

  function makeToggle(c) {
    var input = el('input', { type: 'checkbox' });
    input.checked = !!c.def;
    var track = el('span', { class: 'slider-track' });
    var label = el('label', { class: 'switch' }, [input, track]);
    input.addEventListener('change', function () {
      state[c.id] = input.checked;
      applyMasters();
    });
    return { row: makeRow(c, label), input: input };
  }

  function makeRange(c) {
    var input = el('input', { type: 'range', min: c.min, max: c.max, step: c.step });
    input.value = c.def;
    var valSpan = el('span', { class: 'range-val', text: String(c.def) });
    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      state[c.id] = v;
      valSpan.textContent = (c.step < 1) ? v.toFixed(2) : String(v);
    });
    var wrap = el('div', { style: 'display:flex;align-items:center;gap:8px;flex:1 1 160px;min-width:0;' }, [input, valSpan]);
    input.style.maxWidth = 'none';
    input.style.minWidth = '0';
    input.style.flex = '1 1 auto';
    return { row: makeRowCustom(c, wrap), input: input };
  }

  function makeSelect(c) {
    var select = el('select', {});
    c.options.forEach(function (opt) {
      var o = el('option', { value: opt[0], text: opt[1] });
      if (opt[0] === c.def) o.setAttribute('selected', 'selected');
      select.appendChild(o);
    });
    select.addEventListener('change', function () { state[c.id] = select.value; });
    return { row: makeRow(c, select), input: select };
  }

  function makeText(c) {
    var input = el('input', { type: 'text', placeholder: c.placeholder || '' });
    input.value = c.def;
    input.addEventListener('input', function () { state[c.id] = input.value; });
    return { row: makeRow(c, input), input: input };
  }

  function labelWithInfo(c) {
    var wrap = el('span', { class: 'label-info-wrap' }, [el('span', { class: 'ctrl-label', text: c.label })]);
    if (c.info) {
      var pair = makeInfoButton(c.info);
      wrap.appendChild(pair.btn);
      wrap.appendChild(pair.bubble);
    }
    return wrap;
  }

  function makeRow(c, control) {
    return el('div', { class: 'ctrl-row', 'data-id': c.id }, [labelWithInfo(c), control]);
  }
  function makeRowCustom(c, control) {
    return el('div', { class: 'ctrl-row', 'data-id': c.id }, [labelWithInfo(c), control]);
  }

  var masterLinks = [];

  function buildSettings() {
    var root = document.getElementById('settings');
    SCHEMA.forEach(function (sec) {
      var body = el('div', { class: 'section-body' });
      var masterInputRef = null;
      var dependentRows = [];
      sec.controls.forEach(function (c) {
        var built;
        if (c.type === 'toggle') built = makeToggle(c);
        else if (c.type === 'range') built = makeRange(c);
        else if (c.type === 'select') built = makeSelect(c);
        else built = makeText(c);
        body.appendChild(built.row);
        if (c.master) masterInputRef = built.input;
        else dependentRows.push(built.row);
      });
      if (masterInputRef) masterLinks.push({ input: masterInputRef, rows: dependentRows });
      var summary = el('summary', {}, [el('span', { text: sec.section }), el('span', { class: 'chev', text: '\u276F' })]);
      var details = el('details', { class: 'section' }, [summary, body]);
      if (sec.section === 'General' || sec.section === 'Identifier Protection') details.setAttribute('open', 'open');
      root.appendChild(details);
    });
    applyMasters();
  }

  function applyMasters() {
    masterLinks.forEach(function (link) {
      var on = link.input.checked;
      link.rows.forEach(function (row) { row.classList.toggle('disabled', !on); });
    });
  }

  function buildOptions() {
    return {
      seed: state.seed || undefined,
      layers: state.layers,
      compact: state.compact,
      minify: state.minify,
      identifierProtection: state.identifierProtection,
      nameGenerator: state.nameGenerator,
      identifierPrefix: state.identifierPrefix,
      randomPrefix: state.randomPrefix,
      renameGlobals: state.renameGlobals,
      renameProperties: state.renameProperties,
      reservedNames: state.reservedNames ? [state.reservedNames] : [],
      reservedStrings: state.reservedStrings ? [state.reservedStrings] : [],
      constantProtection: state.constantProtection,
      stringArray: {
        enabled: state.constantProtection,
        threshold: state.threshold,
        rotate: state.rotate,
        shuffle: state.shuffle,
        encoding: state.encoding,
        doubleLayer: state.doubleLayer
      },
      wrappers: { count: state.wrappersCount, type: state.wrappersType },
      sourceMap: state.sourceMap,
      splitStrings: state.splitStrings,
      controlFlowFlatten: state.controlFlowFlatten,
      controlFlowFakePaths: state.controlFlowFakePaths,
      numbersToExpressions: state.numbersToExpressions,
      deadCodeInjection: state.deadCodeInjection,
      debugProtection: state.debugProtection,
      antiTamper: state.antiTamper,
      environmentChecks: state.environmentChecks
    };
  }

  function renderStats(stats) {
    var row = document.getElementById('statsRow');
    row.innerHTML = '';
    var items = [
      ['Layers', stats.layers],
      ['Strings protected', stats.stringsProtected],
      ['Locals renamed', stats.renamedLocals],
      ['Globals renamed', stats.renamedGlobals],
      ['Properties renamed', stats.renamedProperties || 0]
    ];
    items.forEach(function (it) {
      var chip = el('span', { class: 'stat-chip' });
      chip.innerHTML = it[0] + ': <b>' + it[1] + '</b>';
      row.appendChild(chip);
    });
  }

  function updateCounts() {
    document.getElementById('inputCount').textContent = document.getElementById('inputArea').value.length + ' chars';
    document.getElementById('outputCount').textContent = document.getElementById('outputArea').value.length + ' chars';
  }

  var downloadsNs = null;
  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('downloads').then(function (ns) {
      downloadsNs = ns;
      if (!ns) document.getElementById('downloadBtn').style.display = 'none';
    }).catch(function () { document.getElementById('downloadBtn').style.display = 'none'; });
  } else {
    document.getElementById('downloadBtn').style.display = 'none';
  }

  function handleProtect() {
    var btn = document.getElementById('protectBtn');
    var input = document.getElementById('inputArea').value;
    var outputArea = document.getElementById('outputArea');
    if (!input.trim()) {
      outputArea.value = '-- Enter some Lua or Luau source above first.';
      updateCounts();
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Protecting\u2026';
    resetPipeline();

    var animDone = runPipelineAnimation();
    var engineDone = new Promise(function (resolve) {
      setTimeout(function () {
        try {
          var opts = buildOptions();
          var result = window.TokynAST.obfuscate(input, opts);
          resolve({ ok: true, result: result });
        } catch (e) {
          resolve({ ok: false, error: e });
        }
      }, 10);
    });

    Promise.all([animDone, engineDone]).then(function (res) {
      var outcome = res[1];
      btn.disabled = false;
      btn.textContent = 'Protect Script';
      if (!outcome.ok) {
        outputArea.value = '-- Could not protect this script.\n-- ' + (outcome.error && outcome.error.message ? outcome.error.message : String(outcome.error));
        document.getElementById('statsRow').innerHTML = '';
      } else {
        outputArea.value = outcome.result.code;
        renderStats(outcome.result.stats);
      }
      updateCounts();
    });
  }

  function handleCopy() {
    var btn = document.getElementById('copyBtn');
    var text = document.getElementById('outputArea').value;
    if (!text) return;
    function done() {
      var original = '\u2317 Copy Script';
      btn.textContent = '\u2713 Copied';
      btn.classList.add('copied');
      setTimeout(function () { btn.textContent = original; btn.classList.remove('copied'); }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* no-op */ }
    document.body.removeChild(ta);
  }

  function handleDownload() {
    var text = document.getElementById('outputArea').value;
    if (!text || !downloadsNs) return;
    downloadsNs.save({ filename: 'tokyn-protected.txt', data: text }).catch(function () { /* declined or unavailable */ });
  }

  function handleFileUpload(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      document.getElementById('inputArea').value = String(reader.result);
      updateCounts();
    };
    reader.onerror = function () {
      document.getElementById('inputArea').value = '-- Could not read that file.';
      updateCounts();
    };
    reader.readAsText(file);
    ev.target.value = '';
  }

  buildPipeline();
  buildSettings();
  document.getElementById('protectBtn').addEventListener('click', handleProtect);
  document.getElementById('copyBtn').addEventListener('click', handleCopy);
  document.getElementById('downloadBtn').addEventListener('click', handleDownload);
  document.getElementById('uploadInput').addEventListener('change', handleFileUpload);
  document.getElementById('inputArea').addEventListener('input', updateCounts);
  updateCounts();
})();
