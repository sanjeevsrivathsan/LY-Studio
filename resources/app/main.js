/* ============================================================================
 *  main.js  -  Electron main process for LexYacc Studio
 *  Owns the window and the compiler engine; the renderer talks to it over IPC.
 * ========================================================================== */
'use strict';
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs   = require('fs');
const path = require('path');
const engine = require('./src/engine');

const DEV = !app.isPackaged;
const TOOLS_DIR    = DEV ? path.join(__dirname, 'tools')
                         : path.join(process.resourcesPath, 'tools');
const EXAMPLES_DIR = DEV ? path.join(__dirname, 'resources', 'examples')
                         : path.join(process.resourcesPath, 'examples');

/* which example files load into the editor, and in what order */
const ORDER = { '.l': 0, '.y': 1, '.h': 2, '.c': 3, '.txt': 9 };
const LANG  = n => n.endsWith('.l') ? 'lex' : n.endsWith('.y') ? 'yacc'
                 : n.endsWith('.txt') ? 'plaintext' : 'c';

function readExample(dir) {
  const files = fs.readdirSync(dir).filter(f => /\.(l|y|c|h|txt)$/.test(f))
    .sort((a, b) => (ORDER[path.extname(a)] - ORDER[path.extname(b)]) || a.localeCompare(b))
    .map(name => ({ name, content: fs.readFileSync(path.join(dir, name), 'utf8'), lang: LANG(name) }));
  return files;
}

const EXAMPLE_META = [
  { id: 'calculator', title: 'Calculator',          mode: 'both', blurb: 'Four-function calculator — lex + yacc with precedence' },
  { id: 'wordcount',  title: 'Word Count (wc)',      mode: 'lex',  blurb: 'Lexical analyzer only — counts lines, words, characters' },
  { id: 'exprcheck',  title: 'Expression Validator', mode: 'yacc', blurb: 'Parser only — uses the IDE default scanner' },
  { id: 'minic',      title: 'Mini C Compiler',      mode: 'both', blurb: 'Full compiler: symbol table, TAC, optimizer, 8086' },
];

function listExamples() {
  return EXAMPLE_META.filter(m => fs.existsSync(path.join(EXAMPLES_DIR, m.id)))
    .map(m => Object.assign({}, m, { files: readExample(path.join(EXAMPLES_DIR, m.id)) }));
}

/* -------- IPC -------- */
ipcMain.handle('probe',        ()            => engine.probe(TOOLS_DIR));
ipcMain.handle('examples',     ()            => listExamples());
ipcMain.handle('run', (e, { project, mode }) => {
  try { return engine.compileAndRun(project, mode, TOOLS_DIR); }
  catch (err) { return { ok: false, stages: [{ name: 'Engine', ok: false, log: String(err.message || err) }], output: '' }; }
});
ipcMain.handle('saveText', async (e, { suggested, content }) => {
  const w = BrowserWindow.getFocusedWindow();
  const { canceled, filePath } = await dialog.showSaveDialog(w, { defaultPath: suggested });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, content, 'utf8');
  return { ok: true, filePath };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    backgroundColor: '#1e1e2e',
    title: 'LexYacc Studio',
    webPreferences: { preload: path.join(__dirname, 'preload.js'),
                      contextIsolation: true, nodeIntegration: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.env.LYIDE_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });
}



app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
