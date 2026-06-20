// doloop decorations — paint the where-to-look gaze on the open file from .doloop/gaze.json.
// Non-invasive: we decorate the buffer the editor already shows, we never modify it. Deterministic, local.
// Decoration set (per the feasibility report): muscle = green bg + left bar; beacon = amber bg + gutter ▶;
// tendon (everything untagged) = dimmed. "Where to look" band on the OVERVIEW RULER (not the minimap — #82808).
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

let muscleDeco, beaconDeco, tendonDeco, focusDeco, statusItem, treeProvider;
let gaze = null, gazeRoot = null, enabled = true;
let playTimers = [], playing = false, gazePath = [], gazeIdx = -1, gazeSpeed = 1, gazeFile = null;
const SPEEDS = [0.5, 1, 2];

function loadGaze(root) {
  try {
    const p = path.join(root, ".doloop", "gaze.json");
    if (fs.existsSync(p)) {
      gaze = JSON.parse(fs.readFileSync(p, "utf8")); gazeRoot = root;
      if (treeProvider) treeProvider.refresh();
      return true;
    }
  } catch (e) { /* fall through */ }
  gaze = null; gazeRoot = null; if (treeProvider) treeProvider.refresh(); return false;
}

// THE NAVIGATION LAYER — the in-editor START HERE: doors -> engine room -> vocabulary, click to JUMP to the muscle
// (not scroll for it). Ranks identically to the web cockpit (muscle = per100 x outdeg) off the SAME .doloop cache.
class WhereToLook {
  constructor() { this._e = new vscode.EventEmitter(); this.onDidChangeTreeData = this._e.event; }
  refresh() { this._e.fire(); }
  getTreeItem(x) { return x; }
  getChildren(node) {
    if (!gaze) return [];
    if (node && node._files) return node._files.map((f) => this._fileItem(f, node._kind));
    if (node) return [];
    return this._groups();
  }
  _groups() {
    const F = gaze.files, K = Object.keys(F);
    const muscle = (f) => (F[f].per100 || 0) * (F[f].outdeg || 0);
    const nu = (f) => (F[f].units || []).length;
    const doors = K.filter((f) => F[f].is_entry && (nu(f) > 0 || /route|server/.test(F[f].entry_kind || "")))
      .sort((a, b) => (F[b].per100 || 0) - (F[a].per100 || 0)).slice(0, 6);
    const dset = new Set(doors);
    const engine = K.filter((f) => !F[f].is_test && !F[f].is_data && !dset.has(f) && muscle(f) > 0)
      .sort((a, b) => muscle(b) - muscle(a)).slice(0, 14);
    const nouns = K.filter((f) => F[f].is_data && !F[f].is_test)
      .sort((a, b) => (F[b].indeg || 0) - (F[a].indeg || 0)).slice(0, 6);
    const mk = (label, files, desc, kind) => {
      if (!files.length) return null;
      const it = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
      it.description = desc; it._files = files; it._kind = kind; return it;
    };
    return [mk("THE DOORS", doors, "start reading here", "door"),
            mk("THE ENGINE ROOM", engine, "where the logic lives", "engine"),
            mk("THE VOCABULARY", nouns, "the nouns", "noun")].filter(Boolean);
  }
  // label by GROUP, not a global is_entry flag — so a file's sidebar label always agrees with its group and the
  // status bar (an entry that didn't make the top-N doors still shows its decision count in the engine room).
  _fileItem(f, kind) {
    const e = gaze.files[f];
    const it = new vscode.TreeItem(f.split("/").pop(), vscode.TreeItemCollapsibleState.None);
    if (kind === "door") { it.description = e.entry_kind || "entry"; it.tooltip = f + " — entry point (" + (e.entry_kind || "entry") + ")"; }
    else if (kind === "noun") { it.description = "imported by " + (e.indeg || 0); it.tooltip = f + " — vocabulary, imported by " + (e.indeg || 0) + " file" + ((e.indeg || 0) === 1 ? "" : "s"); }
    else { it.description = (e.decisions || 0) + " decisions"; it.tooltip = f + " — " + (e.decisions || 0) + " decisions"; }
    let line = 1; const lt = e.line_tags || {};
    for (const k in lt) { if (lt[k] === "beacon") { line = parseInt(k, 10); break; } }   // enter at the first beacon
    it.command = { command: "doloop.jumpTo", title: "jump", arguments: [f, line] };
    return it;
  }
}

function rootFor(doc) {
  const wf = vscode.workspace.getWorkspaceFolder(doc.uri);
  return wf ? wf.uri.fsPath : (vscode.workspace.workspaceFolders || [{}])[0] && vscode.workspace.workspaceFolders[0].uri.fsPath;
}

function clear(editor) {
  if (!editor) return;
  editor.setDecorations(muscleDeco, []); editor.setDecorations(beaconDeco, []); editor.setDecorations(tendonDeco, []);
}

function paint(editor) {
  if (!editor) return;
  if (!enabled) { clear(editor); statusItem.hide(); return; }
  const root = rootFor(editor.document);
  if (!root) return;
  if (!gaze || gazeRoot !== root) { if (!loadGaze(root)) { clear(editor); statusItem.text = "$(eye-closed) doloop: no gaze — run 'doloop gaze .'"; statusItem.show(); return; } }
  const rel = path.relative(root, editor.document.uri.fsPath).split(path.sep).join("/");
  const entry = gaze.files[rel];
  if (!entry) { clear(editor); statusItem.hide(); return; }
  const tags = entry.line_tags || {};
  const mus = [], bea = [], ten = [];
  let nMus = 0, beacon = null;
  const n = editor.document.lineCount;
  for (let i = 0; i < n; i++) {
    const t = tags[String(i + 1)];
    const r = new vscode.Range(i, 0, i, 0);
    if (t === "muscle") { mus.push(r); nMus++; }
    else if (t === "beacon") { bea.push(r); if (beacon === null) beacon = i + 1; }
    else { ten.push(r); }                                  // untagged = tendon → dim
  }
  editor.setDecorations(muscleDeco, mus);
  editor.setDecorations(beaconDeco, bea);
  editor.setDecorations(tendonDeco, ten);
  statusItem.text = "$(eye) doloop: start L" + (beacon || 1) + " · " + nMus + " muscle · " + (entry.decisions || 0) + " decisions";
  statusItem.tooltip = "Where to look: enter at the beacon (▶), dwell on the muscle (the decisions), skip the dimmed tendon.";
  statusItem.show();
}

// THE ANIMATED SCAN PATH — the eye-gaze concept in the editor: walk the reader's eye through the file in the
// expert's order (enter at the beacon, dwell through each muscle block, skip the tendon), a focus marker moving
// line to line with the editor scrolling to follow. The within-file fractal of the sidebar's between-file order.
function scanPath(editor) {
  const root = rootFor(editor.document);
  if (!root) return [];
  const rel = path.relative(root, editor.document.uri.fsPath).split(path.sep).join("/");
  const e = gaze && gaze.files[rel];
  if (!e) return [];
  const lt = e.line_tags || {}, n = editor.document.lineCount, out = [];
  let i = 1;
  while (i <= n) {
    const t = lt[String(i)];
    if (t === "beacon") { out.push({ line: i, type: "beacon", ms: 550 }); i++; }
    else if (t === "muscle") {                              // collapse a run of muscle lines into one dwell
      const start = i; while (i <= n && lt[String(i)] === "muscle") i++;
      out.push({ line: start, type: "muscle", ms: Math.min(1500, 650 + (i - start) * 120) });
    } else i++;                                             // tendon — skipped, the eye doesn't stop
  }
  return out;
}

function ensurePath(editor) {
  const root = rootFor(editor.document);
  const rel = root && path.relative(root, editor.document.uri.fsPath).split(path.sep).join("/");
  if (rel !== gazeFile) { gazePath = scanPath(editor); gazeFile = rel; gazeIdx = -1; }   // rebuild per file
  return gazePath;
}

function showFixation(editor, k) {
  const step = gazePath[k]; if (!step) return;
  gazeIdx = k;
  const pos = new vscode.Position(step.line - 1, 0);
  editor.setDecorations(focusDeco, [new vscode.Range(pos, pos)]);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  statusItem.text = "$(eye) gaze " + gazeSpeed + "x · " + (k + 1) + "/" + gazePath.length + " · " + step.type;
  statusItem.show();
}

function stopPlay(keepIdx) {
  playTimers.forEach(clearTimeout); playTimers = []; playing = false;
  if (!keepIdx) {
    gazeIdx = -1;
    const ed = vscode.window.activeTextEditor;
    if (ed && focusDeco) ed.setDecorations(focusDeco, []);
  }
}

function stepFixation(d) {                                   // DIRECTION: step one fixation forward/back, at your pace
  const ed = vscode.window.activeTextEditor; if (!ed) return;
  stopPlay(true);                                           // pause auto-play, keep position
  if (!ensurePath(ed).length) { vscode.window.showInformationMessage("doloop: no gaze for this file."); return; }
  let k = gazeIdx + d;
  if (k < 0) k = 0;
  if (k >= gazePath.length) k = gazePath.length - 1;
  showFixation(ed, k);
}

function playGaze() {
  const ed = vscode.window.activeTextEditor; if (!ed) return;
  stopPlay(true);
  if (!ensurePath(ed).length) { vscode.window.showInformationMessage("doloop: no gaze for this file — run 'doloop gaze .' (or 'doloop gaze . --watch')."); return; }
  playing = true;
  const start = (gazeIdx >= 0 && gazeIdx < gazePath.length - 1) ? gazeIdx + 1 : 0;   // resume from where you stepped
  let t = 0;
  for (let k = start; k < gazePath.length; k++) {
    playTimers.push(setTimeout(() => { if (playing) showFixation(ed, k); }, t));
    t += gazePath[k].ms / gazeSpeed;                        // SPEED: dwell scaled by the multiplier
  }
  playTimers.push(setTimeout(() => {
    if (!playing) return;
    statusItem.text = "$(eye) gaze: done — that's the expert's path"; playing = false; gazeIdx = -1;
  }, t + 500 / gazeSpeed));
}

function cycleSpeed() {
  gazeSpeed = SPEEDS[(SPEEDS.indexOf(gazeSpeed) + 1) % SPEEDS.length];
  vscode.window.setStatusBarMessage("doloop gaze speed: " + gazeSpeed + "x", 1500);
  if (playing) playGaze();                                  // restart at the new speed from where we are
  else if (gazeIdx >= 0) { const ed = vscode.window.activeTextEditor; if (ed) showFixation(ed, gazeIdx); }
}

function activate(ctx) {
  muscleDeco = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: "rgba(92,122,74,0.13)",
    borderWidth: "0 0 0 3px", borderStyle: "solid", borderColor: "#5C7A4A",
    overviewRulerColor: "rgba(92,122,74,0.9)", overviewRulerLane: vscode.OverviewRulerLane.Right,
  });
  beaconDeco = vscode.window.createTextEditorDecorationType({
    isWholeLine: true, backgroundColor: "rgba(188,122,46,0.14)",
    gutterIconPath: vscode.Uri.file(path.join(ctx.extensionPath, "beacon.svg")), gutterIconSize: "contain",
    overviewRulerColor: "rgba(188,122,46,0.95)", overviewRulerLane: vscode.OverviewRulerLane.Right,
  });
  tendonDeco = vscode.window.createTextEditorDecorationType({ isWholeLine: true, opacity: "0.45" });
  focusDeco = vscode.window.createTextEditorDecorationType({   // the moving eye — the current fixation
    isWholeLine: true, backgroundColor: "rgba(232,166,50,0.16)",
    borderWidth: "1px 0 1px 0", borderStyle: "solid", borderColor: "rgba(232,166,50,0.95)",
  });

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.command = "doloop.toggleGaze";
  ctx.subscriptions.push(statusItem, muscleDeco, beaconDeco, tendonDeco, focusDeco);

  treeProvider = new WhereToLook();                        // the navigation layer (sidebar)
  ctx.subscriptions.push(vscode.window.registerTreeDataProvider("doloopWhereToLook", treeProvider));
  ctx.subscriptions.push(vscode.commands.registerCommand("doloop.jumpTo", (rel, line) => {
    if (!gazeRoot) return;
    const uri = vscode.Uri.file(path.join(gazeRoot, rel));
    vscode.workspace.openTextDocument(uri).then((doc) => vscode.window.showTextDocument(doc).then((ed) => {
      const pos = new vscode.Position(Math.max(0, (line || 1) - 1), 0);
      ed.selection = new vscode.Selection(pos, pos);
      ed.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }), () => vscode.window.showWarningMessage("doloop: couldn't open " + rel));
  }));

  ctx.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((ed) => { stopPlay(); paint(ed); }));
  ctx.subscriptions.push(vscode.commands.registerCommand("doloop.playGaze", playGaze));
  ctx.subscriptions.push(vscode.commands.registerCommand("doloop.stopGaze", () => stopPlay()));
  ctx.subscriptions.push(vscode.commands.registerCommand("doloop.nextFixation", () => stepFixation(1)));
  ctx.subscriptions.push(vscode.commands.registerCommand("doloop.prevFixation", () => stepFixation(-1)));
  ctx.subscriptions.push(vscode.commands.registerCommand("doloop.cycleSpeed", cycleSpeed));

  // HOVER TIPS — teach the gaze: hover any line in a gaze'd file and learn what it is and WHY (the eye-tracking).
  ctx.subscriptions.push(vscode.languages.registerHoverProvider({ scheme: "file" }, {
    provideHover(document, position) {
      if (!enabled) return null;
      const root = rootFor(document); if (!root) return null;
      const rel = path.relative(root, document.uri.fsPath).split(path.sep).join("/");
      const e = gaze && gaze.files[rel]; if (!e) return null;
      const lt = e.line_tags || {};
      const tag = lt[String(position.line + 1)] || "tendon";
      let beacon = null, nMus = 0;
      for (const k in lt) { if (lt[k] === "muscle") nMus++; else if (lt[k] === "beacon" && beacon === null) beacon = parseInt(k, 10); }
      const md = new vscode.MarkdownString();
      if (tag === "beacon")
        md.appendMarkdown("**▶ doloop · beacon** — a signature / entry point.\n\nWhere you *enter* the unit (Sillito's *focus* stage). An expert's eye starts at a beacon, not the most-imported file.\n\n_This file: " + (e.decisions || 0) + " decisions · start at L" + (beacon || 1) + "._");
      else if (tag === "muscle")
        md.appendMarkdown("**● doloop · muscle** — a decision line (branch / loop / condition).\n\nWhere the logic lives. Eye-tracking shows experts *dwell* on decision-dense lines and skim the rest — so this is where to read.\n\n_This file: enter at L" + (beacon || 1) + " · " + nMus + " muscle lines._");
      else
        md.appendMarkdown("**doloop · tendon** — connective tissue (imports / logging / boilerplate / plain returns).\n\nExperts *skip* this; doloop dims it so your eye doesn't stop. The signal isn't here.");
      return new vscode.Hover(md);
    },
  }));
  ctx.subscriptions.push(vscode.workspace.onDidOpenTextDocument(() => paint(vscode.window.activeTextEditor)));
  ctx.subscriptions.push(vscode.commands.registerCommand("doloop.refreshGaze", () => {
    const ed = vscode.window.activeTextEditor;
    const root = ed && rootFor(ed.document);
    if (root && loadGaze(root)) { paint(ed); vscode.window.showInformationMessage("doloop gaze reloaded (" + Object.keys(gaze.files).length + " files)."); }
    else vscode.window.showWarningMessage("No .doloop/gaze.json here. Install: pip install doloopio — then run: doloop gaze . --watch");
  }));
  ctx.subscriptions.push(vscode.commands.registerCommand("doloop.toggleGaze", () => {
    enabled = !enabled; paint(vscode.window.activeTextEditor);
    vscode.window.showInformationMessage("doloop gaze " + (enabled ? "on" : "off"));
  }));

  const wf0 = (vscode.workspace.workspaceFolders || [])[0];   // populate the sidebar even before any file is opened
  if (wf0) loadGaze(wf0.uri.fsPath);

  // auto-reload when `doloop gaze --watch` re-emits .doloop/gaze.json — the paint stays current, no manual refresh
  const watcher = vscode.workspace.createFileSystemWatcher("**/.doloop/gaze.json");
  const onGazeFile = () => {
    const ed = vscode.window.activeTextEditor;
    const root = ed && rootFor(ed.document);
    if (root && loadGaze(root)) paint(ed);
  };
  watcher.onDidChange(onGazeFile);
  watcher.onDidCreate(onGazeFile);
  ctx.subscriptions.push(watcher);

  paint(vscode.window.activeTextEditor);
}

function deactivate() {}
module.exports = { activate, deactivate };
