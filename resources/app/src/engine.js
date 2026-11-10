/* ============================================================================
 *  engine.js  -  the compiler run engine of the Lex/Yacc IDE
 *
 *  It drives the real tools (flex, bison and a C compiler) to run a project in
 *  three modes:  'lex'  (scanner only), 'yacc' (parser only) and 'both'.
 *  The same code runs on Windows (bundled win_flex / win_bison / tcc) and on
 *  Linux (system flex / bison / cc) so the pipeline can be tested before it is
 *  packaged.
 * ========================================================================== */
'use strict';
const { spawnSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

/* ---- locate the tools ----------------------------------------------------- */
function toolPaths(toolsDir) {
  if (process.platform === 'win32') {
    const tcc = path.join(toolsDir, 'win', 'tcc');
    return {
      flex : path.join(toolsDir, 'win', 'win_flex.exe'),
      bison: path.join(toolsDir, 'win', 'win_bison.exe'),
      cc   : path.join(tcc, 'tcc.exe'),
      bisonEnv: { BISON_PKGDATADIR: path.join(toolsDir, 'win', 'bison_data') },
      ccExtra : ['-I', path.join(tcc, 'include'), '-L', path.join(tcc, 'lib'),
                 '-B', tcc],
      exe: '.exe'
    };
  }
  /* development / Linux test host */
  return { flex: 'flex', bison: 'bison', cc: 'tcc',
           bisonEnv: {}, ccExtra: [], exe: '' };
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8', timeout: opts.timeout || 20000,
    cwd: opts.cwd, input: opts.input,
    env: Object.assign({}, process.env, opts.env || {}),
    maxBuffer: 16 * 1024 * 1024
  });
  return {
    code  : r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    timedOut: r.error && r.error.code === 'ETIMEDOUT',
    failed  : r.error && r.error.code === 'ENOENT'
  };
}

/* ---- small source-inspection helpers --------------------------------------
 * A *definition* is  name(...) { ... }  so we require a '{' after the ')' and
 * forbid ';' / '{' inside the parameter list.  A bare prototype ending in ';'
 * (e.g. "int yylex(void);") therefore does not count.                         */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}
const defMain   = s => /\bmain\s*\([^;{]*\)\s*\{/.test(stripComments(s || ''));
const defYylex  = s => /\byylex\s*\([^;{]*\)\s*\{/.test(stripComments(s || ''));
const defYywrap = s => /\byywrap\s*\([^;{]*\)\s*\{/.test(stripComments(s || '')) ||
                       /%option[^\n]*\bnoyywrap\b/.test(s || '');

/* Build a default scanner for "Run Yacc only" when the grammar has no yylex.
 * Bison 3.x writes token names only as an enum (no #define), so we read the
 * generated header, discover the real token names, and emit a scanner that
 * returns the right ones for numbers and identifiers.                         */
function tokenNames(headerText) {
  const names = new Set();
  const m = headerText.match(/enum\s+yytokentype\s*\{([\s\S]*?)\}/);
  if (m) for (const mm of m[1].matchAll(/\b([A-Z_][A-Z0-9_]*)\b/g)) names.add(mm[1]);
  for (const mm of headerText.matchAll(/#\s*define\s+([A-Z_][A-Z0-9_]*)\s+\d/g)) names.add(mm[1]);
  ['YYEMPTY', 'YYEOF', 'YYerror', 'YYUNDEF', 'YYERRCODE', 'YYSTYPE', 'YYLTYPE']
    .forEach(x => names.delete(x));
  return [...names];
}
function buildDefaultScanner(headerText, yaccSrc) {
  const toks = tokenNames(headerText);
  const pick = res => toks.find(t => res.some(re => re.test(t)));
  const numTok = pick([/^NUMBER$/i, /NUM/i, /INT/i, /DIGIT/i, /CONST/i, /REAL/i, /FLOAT/i]);
  const idTok  = pick([/^ID$/i, /IDENT/i, /^NAME$/i, /^VAR/i, /LETTER/i, /WORD/i, /STRING/i]);
  const hasUnion = /%union/.test(yaccSrc || '');
  const setv = hasUnion ? '' : 'yylval = atoi(yytext); ';
  const numRule = numTok ? `[0-9]+     { ${setv}return ${numTok}; }`
                         : `[0-9]      { return yytext[0]; }`;
  const idRule  = idTok  ? `[A-Za-z_][A-Za-z0-9_]*  { return ${idTok}; }`
                         : `[A-Za-z_]  { return yytext[0]; }`;
  return `%{
#include "y.tab.h"
#include <stdlib.h>
%}
%option noyywrap
%%
[ \\t\\r]+   ;
${numRule}
${idRule}
\\n          { return '\\n'; }
.           { return yytext[0]; }
%%
`;
}

/* driver mains supplied only when the user source does not define one */
const LEX_DRIVER  = `int main(void){ while(yylex()); return 0; }\n`;
const YACC_DRIVER = `int main(void){ extern int yyparse(void); return yyparse(); }\n`;
const YYWRAP      = `int yywrap(void){ return 1; }\n`;

/* ---- the pipeline --------------------------------------------------------- */
/*
 * project = {
 *   lex   : string|null,       // lexer.l
 *   yacc  : string|null,       // parser.y
 *   extra : [{name, content}], // additional .c files compiled in
 *   input : string,            // stdin fed to the built program
 * }
 * mode = 'lex' | 'yacc' | 'both'
 * returns { ok, stages:[{name, ok, log}], output, graphDot, tokens }
 */
function compileAndRun(project, mode, toolsDir) {
  const T   = toolPaths(toolsDir);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyide-'));
  const stages = [];
  const result = { ok: false, stages, output: '', graphDot: null, dir };
  const W = (f, c) => fs.writeFileSync(path.join(dir, f), c);
  const add = (name, r, okTest) => {
    const ok = okTest ? okTest(r) : (r.code === 0 && !r.failed && !r.timedOut);
    let log = ((r.stderr || '') + (okTest ? '' : (r.stdout || ''))).trim();
    if (r.failed)   log = 'tool not found: ' + name;
    if (r.timedOut) log = name + ' timed out';
    stages.push({ name, ok, log });
    return ok;
  };

  try {
    const cFiles = [];
    let usesFlexScanner = false;   /* a flex-generated scanner is linked in */

    /* ---------- scanner (flex) ---------- */
    if (mode === 'lex' || mode === 'both') {
      if (!project.lex) { stages.push({ name: 'Flex', ok: false, log: 'no .l file in project' }); return finish(); }
      W('lexer.l', project.lex);
      const r = run(T.flex, ['-o', 'lex.yy.c', 'lexer.l'], { cwd: dir });
      if (!add('Flex  (scanner generation)', r)) return finish();
      cFiles.push('lex.yy.c');
      usesFlexScanner = true;
    }

    /* ---------- parser (bison) ---------- */
    if (mode === 'yacc' || mode === 'both') {
      if (!project.yacc) { stages.push({ name: 'Bison', ok: false, log: 'no .y file in project' }); return finish(); }
      W('parser.y', project.yacc);
      const args = ['-d', '-o', 'y.tab.c', '--graph=automaton.gv', 'parser.y'];
      const r = run(T.bison, args, { cwd: dir, env: T.bisonEnv });
      if (!add('Bison (parser generation)', r)) return finish();
      cFiles.push('y.tab.c');
      try { result.graphDot = fs.readFileSync(path.join(dir, 'automaton.gv'), 'utf8'); } catch (e) {}

      /* a scanner for the parser when it does not define its own yylex */
      if (mode === 'yacc' && !defYylex(project.yacc)) {
        const hdr = fs.readFileSync(path.join(dir, 'y.tab.h'), 'utf8');
        W('scanner.l', buildDefaultScanner(hdr, project.yacc));
        const rs = run(T.flex, ['-o', 'scan.yy.c', 'scanner.l'], { cwd: dir });
        if (!add('Flex  (default scanner)', rs)) return finish();
        cFiles.push('scan.yy.c');
        usesFlexScanner = true;      /* default scanner declares noyywrap */
      }
    }

    /* ---------- extra C files ---------- */
    (project.extra || []).forEach(f => {
      if (/\.c$/i.test(f.name)) { W(f.name, f.content); cFiles.push(f.name); }
      else if (/\.h$/i.test(f.name)) { W(f.name, f.content); }
    });

    /* ---------- drivers supplied only where the user source lacks them -------
     * Detection uses the user's own sources, never the generated .c files
     * (flex/bison output mentions yywrap/yylex without defining what we need). */
    const userSrc   = [project.lex, project.yacc].concat(
                        (project.extra || []).map(f => f.content)).filter(Boolean);
    const userMain  = userSrc.some(defMain);
    const userYywrap= defYywrap(project.lex) ||
                      (project.extra || []).some(f => defYywrap(f.content));
    const defaultScanner = mode === 'yacc' && !defYylex(project.yacc);

    let driver = '';
    if (!userMain) driver += (mode === 'lex' ? LEX_DRIVER : YACC_DRIVER);
    /* yywrap is referenced only by a flex-generated scanner that the user's
     * own .l did not satisfy; the default scanner already sets noyywrap.       */
    if (usesFlexScanner && !defaultScanner && (mode === 'lex' || mode === 'both') && !userYywrap)
      driver += YYWRAP;
    if (driver) { W('__driver.c', driver); cFiles.push('__driver.c'); }

    /* ---------- compile + link (C compiler) ---------- */
    const exe  = 'prog' + T.exe;
    const args = cFiles.concat(['-o', exe], T.ccExtra);
    const rc = run(T.cc, args, { cwd: dir });
    if (!add('Compile & link (C compiler)', rc)) return finish();

    /* ---------- run the program ---------- */
    const rp = run(path.join(dir, exe), [], { cwd: dir, input: project.input || '', timeout: 8000 });
    const okRun = !rp.failed;
    stages.push({ name: 'Run', ok: okRun && !rp.timedOut,
                  log: rp.timedOut ? 'program timed out (possible infinite loop)' : '' });
    result.output = (rp.stdout || '') + (rp.stderr ? '\n' + rp.stderr : '');
    result.ok = okRun;
    return finish();
  } catch (e) {
    stages.push({ name: 'Engine', ok: false, log: String(e && e.message || e) });
    return finish();
  }

  function finish() {
    result.ok = result.ok && stages.every(s => s.ok);
    try { setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 1500); } catch (e) {}
    return result;
  }
}

/* quick environment probe for the status bar */
function probe(toolsDir) {
  const T = toolPaths(toolsDir);
  const v = (cmd, args, env) => {
    const r = run(cmd, args, { env, timeout: 6000 });
    if (r.failed) return null;
    return (r.stdout || r.stderr || '').split('\n')[0].trim();
  };
  return {
    platform: process.platform,
    flex : v(T.flex,  ['--version']),
    bison: v(T.bison, ['--version'], T.bisonEnv),
    cc   : v(T.cc,    ['-v'])
  };
}

module.exports = { compileAndRun, probe, toolPaths };
