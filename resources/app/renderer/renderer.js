/* ============================================================================
 *  renderer.js  -  UI logic for LexYacc Studio
 * ========================================================================== */
'use strict';

/* avoid noisy Monaco web-worker errors under file:// — run language services
 * on the main thread (syntax highlighting still works fully).                 */
self.MonacoEnvironment = {
  getWorker: () => {
    const blob = new Blob(['self.onmessage=()=>{};'], { type: 'text/javascript' });
    return new Worker(URL.createObjectURL(blob));
  }
};

let editor, monacoRef;
let project = null;          // { id, title, mode, files:[{name,content,lang,model}] }
let activeFile = null;
const $ = s => document.querySelector(s);

/* ---------- Monaco bootstrap ---------- */
require.config({ paths: { vs: '../vendor/monaco/vs' } });
require(['vs/editor/editor.main'], () => {
  monacoRef = monaco;
  registerLanguages(monaco);
  defineThemes(monaco);
  editor = monaco.editor.create($('#editor'), {
    value: '', language: 'c', theme: 'lys-dark', automaticLayout: true,
    fontSize: 13.5, fontFamily: 'Cascadia Code, Consolas, monospace',
    minimap: { enabled: false }, scrollBeyondLastLine: false, tabSize: 4,
    renderLineHighlight: 'line', smoothScrolling: true
  });
  boot();
});

/* ---------- lex / yacc syntax highlighting ---------- */
function registerLanguages(monaco) {
  for (const id of ['lex', 'yacc']) {
    monaco.languages.register({ id });
    monaco.languages.setMonarchTokensProvider(id, {
      defaultToken: '', tokenPostfix: '.' + id,
      keywords: ['int','float','char','void','if','else','while','for','return','printf','struct'],
      directives: ['%%','%{','%}','%token','%left','%right','%nonassoc','%start','%union',
                   '%type','%prec','%option','%define','%x','%s'],
      tokenizer: {
        root: [
          [/%[%{}]/, 'keyword.directive'],
          [/%[a-z]+/, 'keyword.directive'],
          [/\/\*/, 'comment', '@comment'],
          [/\/\/.*$/, 'comment'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/'([^'\\]|\\.)'/, 'string'],
          [/\{|\}/, 'delimiter.bracket'],
          [/\$[0-9$]+/, 'variable.predefined'],
          [/\b(yylval|yytext|yyleng|yylex|yyparse|yyerror|yywrap|yyin)\b/, 'variable.predefined'],
          [/\b(int|float|char|void|if|else|while|for|return|printf)\b/, 'keyword'],
          [/\[[^\]]*\]/, 'regexp'],
          [/[0-9]+/, 'number'],
          [/[A-Z_][A-Z0-9_]+/, 'type'],
        ],
        comment: [[/[^*/]+/, 'comment'], [/\*\//, 'comment', '@pop'], [/./, 'comment']],
      }
    });
  }
}
function defineThemes(monaco) {
  monaco.editor.defineTheme('lys-dark', { base: 'vs-dark', inherit: true,
    rules: [{ token: 'keyword.directive', foreground: 'cba6f7', fontStyle: 'bold' },
            { token: 'type', foreground: 'f9e2af' }, { token: 'regexp', foreground: 'f38ba8' }],
    colors: { 'editor.background': '#1e1e2e' } });
  monaco.editor.defineTheme('lys-light', { base: 'vs', inherit: true,
    rules: [{ token: 'keyword.directive', foreground: '8839ef', fontStyle: 'bold' },
            { token: 'type', foreground: 'b4881b' }, { token: 'regexp', foreground: 'd33b56' }],
    colors: {} });
}

/* ---------- boot: toolchain probe + examples ---------- */
async function boot() {
  try {
    const p = await window.api.probe();
    $('#toolInfo').textContent =
      (p.flex ? '● ' + p.flex : '○ flex missing') + '   ' +
      (p.bison ? '● ' + p.bison.replace('bison (GNU Bison) ', 'bison ') : '○ bison missing') + '   ' +
      (p.cc ? '● ' + (p.cc.split(/[\n(]/)[0].trim()) : '○ C compiler missing');
    $('#platInfo').textContent = 'target: ' + (p.platform === 'win32' ? 'Windows (bundled tools)' : p.platform);
  } catch (e) { $('#toolInfo').textContent = 'toolchain probe failed'; }

  const list = await window.api.examples();
  const ul = $('#examples'); ul.innerHTML = '';
  list.forEach((ex, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="m">${ex.mode}</span><div class="t">${ex.title}</div><div class="b">${ex.blurb}</div>`;
    li.onclick = () => { selectExample(ex, li); };
    ul.appendChild(li);
    if (i === 0) li.classList.add('active'), (window.__first = ex);
  });
  if (list[0]) selectExample(list[0], ul.firstChild);
}

/* ---------- load an example into the editor ---------- */
function selectExample(ex, li) {
  document.querySelectorAll('.ex-list li').forEach(x => x.classList.remove('active'));
  li.classList.add('active');
  // dispose old models
  if (project) project.files.forEach(f => f.model && f.model.dispose());
  project = { id: ex.id, title: ex.title, mode: ex.mode,
    files: ex.files.map(f => ({ name: f.name, lang: f.lang,
      model: monacoRef.editor.createModel(f.content, monacoLang(f.lang)) })) };
  $('#modeHint').innerHTML = hintFor(ex.mode);
  renderFileList();
  const first = project.files.find(f => !f.name.endsWith('.txt')) || project.files[0];
  openFile(first);
  // clear docks
  $('#tab-output').textContent = '';
  $('#tab-build').innerHTML = '';
  $('#tab-graph').innerHTML = '<div class="graph-hint">Run this project to see its LALR(1) state machine.</div>';
  $('#runStatus').textContent = '';
}
const monacoLang = l => l === 'lex' ? 'lex' : l === 'yacc' ? 'yacc' : l === 'c' ? 'c' : 'plaintext';
function hintFor(mode) {
  const m = { lex: 'This example uses <b>Run Lex</b> — a scanner only.',
    yacc: 'This example uses <b>Run Yacc</b> — a parser with the IDE default scanner.',
    both: 'This example uses <b>Run Both</b> — scanner + parser together.' };
  return m[mode] + '<br><br>The file named <b>input.txt</b> is fed to the program as standard input.';
}

function renderFileList() {
  const ul = $('#files'); ul.innerHTML = '';
  project.files.forEach(f => {
    const ext = f.name.split('.').pop();
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot ${ext}"></span>${f.name}`;
    li.onclick = () => openFile(f);
    f._li = li; ul.appendChild(li);
  });
  markActiveFile();
}
function openFile(f) {
  if (!f) return;
  activeFile = f;
  editor.setModel(f.model);
  renderTabbar(); markActiveFile();
}
function markActiveFile() {
  project.files.forEach(f => f._li && f._li.classList.toggle('active', f === activeFile));
}
function renderTabbar() {
  const bar = $('#tabbar'); bar.innerHTML = '';
  project.files.forEach(f => {
    const ext = f.name.split('.').pop();
    const t = document.createElement('div');
    t.className = 'tab' + (f === activeFile ? ' active' : '');
    t.innerHTML = `<span class="dot ${ext}"></span>${f.name}`;
    t.onclick = () => openFile(f);
    bar.appendChild(t);
  });
}

/* ---------- run ---------- */
async function doRun(mode) {
  if (!project) return;
  const lexF  = project.files.find(f => f.name.endsWith('.l'));
  const yaccF = project.files.find(f => f.name.endsWith('.y'));
  const inF   = project.files.find(f => f.name.endsWith('.txt'));
  const extra = project.files.filter(f => /\.(c|h)$/.test(f.name))
    .map(f => ({ name: f.name, content: f.model.getValue() }));

  if (mode === 'lex'  && !lexF)  return flash('This project has no .l file for Run Lex.');
  if (mode === 'yacc' && !yaccF) return flash('This project has no .y file for Run Yacc.');
  if (mode === 'both' && (!lexF || !yaccF)) return flash('Run Both needs a .l and a .y file.');

  const payload = {
    lex:  lexF  ? lexF.model.getValue()  : null,
    yacc: yaccF ? yaccF.model.getValue() : null,
    extra, input: inF ? inF.model.getValue() : ''
  };
  setBusy(true);
  $('#runStatus').innerHTML = '<span style="color:var(--warn)">running…</span>';
  showTab('build');
  try {
    const res = await window.api.run(payload, mode);
    renderResult(res, mode);
  } catch (e) {
    $('#tab-output').textContent = 'Run failed: ' + (e.message || e);
    showTab('output');
  } finally { setBusy(false); }
}
function renderResult(res, mode) {
  // build log
  const bl = $('#tab-build'); bl.innerHTML = '';
  res.stages.forEach(s => {
    const d = document.createElement('div');
    d.className = 'stage ' + (s.ok ? 'ok' : 'fail');
    d.innerHTML = `<span class="ic">${s.ok ? '✔' : '✖'}</span>` +
                  `<span class="nm">${esc(s.name)}</span>` +
                  `<span class="lg">${esc(s.log || '')}</span>`;
    bl.appendChild(d);
  });
  // program output
  $('#tab-output').textContent = res.output && res.output.trim() ? res.output.replace(/\s+$/, '') :
    (res.ok ? '(program produced no output)' : '(no output — see Build Log for the error)');
  // status
  const ok = res.ok;
  $('#runStatus').innerHTML = ok
    ? '<span style="color:var(--ok)">✔ ' + modeName(mode) + ' succeeded</span>'
    : '<span style="color:var(--fail)">✖ build failed — see Build Log</span>';
  // graph
  renderGraph(res.graphDot);
  showTab(ok ? 'output' : 'build');
}
const modeName = m => ({ lex: 'Run Lex', yacc: 'Run Yacc', both: 'Run Both' }[m]);

/* ---------- LALR graph via viz.js ---------- */
async function renderGraph(dot) {
  const host = $('#tab-graph');
  if (!dot) { host.innerHTML = '<div class="graph-hint">No grammar in this run — the LALR graph is produced from a <b>.y</b> file (Run Yacc or Run Both).</div>'; return; }
  host.innerHTML = '<div class="graph-hint">rendering state machine…</div>';
  try {
    const viz = await Viz.instance();
    const svg = viz.renderSVGElement(dot);
    svg.style.maxWidth = 'none';
    host.innerHTML = '';
    const bar = document.createElement('div'); bar.className = 'graph-toolbar';
    let scale = 1;
    const apply = () => svg.style.transform = `scale(${scale})`;
    const mk = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.onclick = fn; return b; };
    bar.append(mk('−', () => { scale = Math.max(.2, scale - .15); apply(); }),
               mk('Reset', () => { scale = 1; apply(); }),
               mk('+', () => { scale = Math.min(4, scale + .15); apply(); }),
               mk('Save SVG', () => saveGraph(svg)));
    svg.style.transformOrigin = 'top left';
    host.append(bar, svg);
  } catch (e) {
    host.innerHTML = '<div class="graph-hint">Could not render the graph: ' + esc(String(e)) + '</div>';
  }
}
async function saveGraph(svg) {
  const s = new XMLSerializer().serializeToString(svg);
  await window.api.saveText(project.id + '-lalr.svg', s);
}

/* ---------- dock tabs ---------- */
function showTab(name) {
  document.querySelectorAll('.dtab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
}
document.querySelectorAll('.dtab').forEach(b => b.onclick = () => showTab(b.dataset.tab));

/* ---------- misc ---------- */
function setBusy(b) { ['runLex', 'runYacc', 'runBoth'].forEach(id => $('#' + id).disabled = b); }
function flash(msg) { $('#runStatus').innerHTML = '<span style="color:var(--warn)">' + esc(msg) + '</span>'; }
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

$('#runLex').onclick  = () => doRun('lex');
$('#runYacc').onclick = () => doRun('yacc');
$('#runBoth').onclick = () => doRun('both');
$('#saveOut').onclick = () => {
  const txt = $('#tab-output').textContent || '';
  window.api.saveText((project ? project.id : 'output') + '-output.txt', txt);
};
$('#themeBtn').onclick = () => {
  const light = document.body.classList.toggle('theme-light');
  document.body.classList.toggle('theme-dark', !light);
  monacoRef.editor.setTheme(light ? 'lys-light' : 'lys-dark');
};
window.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); doRun('both'); }
  else if (e.ctrlKey && e.key === '1') { e.preventDefault(); doRun('lex'); }
  else if (e.ctrlKey && e.key === '2') { e.preventDefault(); doRun('yacc'); }
});
