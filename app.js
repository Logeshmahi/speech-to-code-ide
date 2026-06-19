/* ============================================================
   app.js — glues everything together:
   CodeMirror editor + indentation engine + voice + filesystem + runner
   ============================================================ */

(() => {
  /* ---------- DOM ---------- */
  const els = {
    btnOpenFolder: document.getElementById("btnOpenFolder"),
    btnNewFile: document.getElementById("btnNewFile"),
    btnNewFolder: document.getElementById("btnNewFolder"),
    btnSave: document.getElementById("btnSave"),
    btnCloseFolder: document.getElementById("btnCloseFolder"),
    btnRun: document.getElementById("btnRun"),
    btnMic: document.getElementById("btnMic"),
    micLabel: document.getElementById("micLabel"),
    langSelect: document.getElementById("langSelect"),
    fileTree: document.getElementById("fileTree"),
    fsWarning: document.getElementById("fsWarning"),
    currentFileName: document.getElementById("currentFileName"),
    dirtyDot: document.getElementById("dirtyDot"),
    interim: document.getElementById("interimTranscript"),
    voiceLog: document.getElementById("voiceLog"),
    modeCode: document.getElementById("modeCode"),
    modeDictation: document.getElementById("modeDictation"),
    consoleOutput: document.getElementById("consoleOutput"),
    btnClearConsole: document.getElementById("btnClearConsole"),
  };

  /* ---------- Editor ---------- */
  const STARTER_TEXT = "# Click \"Start Listening\" and speak Python out loud.\n" +
           "# Try: \"define function greet with parameters name\"\n" +
           "#      \"print quote hello comma name quote\"\n";

  const editor = CodeMirror(document.getElementById("editorHost"), {
    value: STARTER_TEXT,
    mode: "python",
    theme: "material-darker",
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    viewportMargin: Infinity,
  });

  let indentLevel = 0;
  let suppressDirty = false; // true while we programmatically load file content

  editor.on("change", () => {
    if (!suppressDirty) {
      els.dirtyDot.classList.remove("hidden");
      FileSystem.markDirty();
    }
  });

  function endOfDoc() {
    const last = editor.lastLine();
    return { line: last, ch: editor.getLine(last).length };
  }

  function docIsEffectivelyEmpty() {
    return editor.getValue().trim() === "";
  }

  function insertRawLine(text, indent) {
    if (editor.getValue() === STARTER_TEXT) editor.setValue("");
    const line = " ".repeat(indent * 4) + text;
    if (docIsEffectivelyEmpty() && editor.lineCount() === 1) {
      editor.setValue(line);
    } else {
      editor.replaceRange("\n" + line, endOfDoc());
    }
    editor.setCursor(endOfDoc());
    editor.scrollIntoView(endOfDoc());
  }

  const REJOIN_KEYWORDS = new Set(["else", "elif", "except", "finally"]);

  function insertCodeLine(code, keyword) {
    const effectiveIndent = REJOIN_KEYWORDS.has(keyword) ? Math.max(indentLevel - 1, 0) : indentLevel;
    insertRawLine(code, effectiveIndent);
    indentLevel = effectiveIndent + (code.trim().endsWith(":") ? 1 : 0);
    return " ".repeat(effectiveIndent * 4) + code;
  }

  function insertBlankLine() {
    insertRawLine("", indentLevel);
  }

  function deleteLastLine() {
    const last = editor.lastLine();
    if (last === 0) {
      editor.setValue("");
      indentLevel = 0;
      return;
    }
    const prevLineLen = editor.getLine(last - 1).length;
    editor.replaceRange("", { line: last - 1, ch: prevLineLen }, { line: last, ch: editor.getLine(last).length });
    // recompute indent level from the new last line
    const newLast = editor.getLine(editor.lastLine());
    const leading = (newLast.match(/^ */)[0].length) / 4;
    indentLevel = newLast.trim().endsWith(":") ? leading + 1 : leading;
  }

  function clearEditor() {
    editor.setValue("");
    indentLevel = 0;
  }

  /* ---------- Voice log UI ---------- */
  function logCode(raw, codeLine) {
    const div = document.createElement("div");
    div.className = "log-entry";
    div.innerHTML = `<div class="log-heard">🗣 "${escapeHtml(raw.trim())}"</div><div class="log-code">${escapeHtml(codeLine)}</div>`;
    els.voiceLog.prepend(div);
  }
  function logControl(raw, label) {
    const div = document.createElement("div");
    div.className = "log-entry";
    div.innerHTML = `<div class="log-heard">🗣 "${escapeHtml(raw.trim())}"</div><div class="log-control">⚙ ${escapeHtml(label)}</div>`;
    els.voiceLog.prepend(div);
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------- Mode (code vs dictation) ---------- */
  let mode = "code";
  function setMode(next) {
    mode = next;
    els.modeCode.classList.toggle("mode-active", mode === "code");
    els.modeDictation.classList.toggle("mode-active", mode === "dictation");
  }
  els.modeCode.addEventListener("click", () => setMode("code"));
  els.modeDictation.addEventListener("click", () => setMode("dictation"));

  /* ---------- Action processing (shared by voice + could be reused) ---------- */
  function processActions(actions) {
    actions.forEach(action => {
      if (action.type === "code") {
        const codeLine = insertCodeLine(action.code, action.keyword);
        logCode(action.raw, codeLine);
      } else {
        switch (action.action) {
          case "newline":
            insertBlankLine();
            logControl(action.raw, "blank line");
            break;
          case "indent":
            indentLevel++;
            logControl(action.raw, `indent → level ${indentLevel}`);
            break;
          case "dedent":
            indentLevel = Math.max(indentLevel - 1, 0);
            logControl(action.raw, `dedent → level ${indentLevel}`);
            break;
          case "deleteline":
            deleteLastLine();
            logControl(action.raw, "deleted last line");
            break;
          case "clearall":
            clearEditor();
            logControl(action.raw, "cleared editor");
            break;
          case "save":
            triggerSave();
            logControl(action.raw, "save requested");
            break;
          case "run":
            triggerRun();
            logControl(action.raw, "run requested");
            break;
          case "mode-dictation":
            setMode("dictation");
            logControl(action.raw, "switched to dictation mode");
            break;
          case "mode-code":
            setMode("code");
            logControl(action.raw, "switched to code mode");
            break;
        }
      }
    });
  }

  /* ---------- Speech engine ---------- */
  const speech = new Voice.SpeechEngine({
    onInterim: (text) => {
      els.interim.textContent = text;
      els.interim.classList.add("live");
    },
    onFinal: (text) => {
      els.interim.textContent = "Listening…";
      els.interim.classList.remove("live");
      const actions = Voice.parseUtterance(text, mode);
      processActions(actions);
    },
    onStateChange: (listening) => {
      els.btnMic.classList.toggle("listening", listening);
      els.micLabel.textContent = listening ? "Stop Listening" : "Start Listening";
      els.interim.textContent = listening ? "Listening…" : "Press “Start Listening” and speak…";
    },
    onError: (err) => {
      if (err === "not-allowed" || err === "service-not-allowed") {
        alert("Microphone access was blocked. Please allow microphone permission for this page and try again.");
      }
      // 'no-speech' and similar are routine — recognition auto-restarts via onend.
    },
  });

  if (!speech.supported) {
    els.btnMic.disabled = true;
    els.micLabel.textContent = "Speech not supported in this browser";
  }

  els.btnMic.addEventListener("click", () => {
    if (speech.listening) speech.stop(); else speech.start();
  });
  els.langSelect.addEventListener("change", (e) => speech.setLanguage(e.target.value));

  /* ---------- File system wiring ---------- */
  FileSystem.init({
    treeElement: els.fileTree,
    warningElement: els.fsWarning,
    onFileOpen: (text, path) => {
      suppressDirty = true;
      editor.setValue(text);
      suppressDirty = false;
      indentLevel = 0;
      els.currentFileName.textContent = path;
      els.dirtyDot.classList.add("hidden");
    },
    onTreeState: (state) => {
      els.btnNewFile.disabled = !state.folderOpen;
      els.btnNewFolder.disabled = !state.folderOpen;
      els.btnCloseFolder.disabled = !state.folderOpen;
      els.btnSave.disabled = !state.fileOpen;
      if (state.justSaved) els.dirtyDot.classList.add("hidden");
      if (state.dirty) els.dirtyDot.classList.remove("hidden");
      if (!state.fileOpen && !state.folderOpen) els.currentFileName.textContent = "untitled.py";
    },
  });

  els.btnOpenFolder.addEventListener("click", () => FileSystem.openFolder());

  els.btnNewFile.addEventListener("click", async () => {
    const name = prompt("New file name (e.g. main.py):", "main.py");
    if (name) await FileSystem.newFile(name.trim());
  });

  els.btnNewFolder.addEventListener("click", async () => {
    const name = prompt("New folder name:");
    if (name) await FileSystem.newFolder(name.trim());
  });

  els.btnCloseFolder.addEventListener("click", () => {
    if (confirm("Close the open folder? Unsaved changes in the current file will be lost.")) {
      FileSystem.closeFolder();
      clearEditor();
      els.currentFileName.textContent = "untitled.py";
    }
  });

  async function triggerSave() {
    if (!FileSystem.hasOpenFile()) {
      flashConsole("No file is open. Use \"Open Folder\" and select a file, or \"+ File\" to create one, before saving.", true);
      return;
    }
    const res = await FileSystem.save(editor.getValue());
    if (!res.ok) flashConsole("Save failed: " + res.reason, true);
  }
  els.btnSave.addEventListener("click", triggerSave);
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      triggerSave();
    }
  });

  /* ---------- Runner wiring ---------- */
  function flashConsole(text, isError) {
    els.consoleOutput.textContent = text;
    els.consoleOutput.classList.toggle("err", !!isError);
  }
  async function triggerRun() {
    flashConsole("Starting…", false);
    const code = editor.getValue();
    const result = await Runner.run(code, (status) => flashConsole(status, false));
    const text = [result.output, result.error].filter(Boolean).join("\n") || "(no output)";
    flashConsole(text, !result.ok);
  }
  els.btnRun.addEventListener("click", triggerRun);
  els.btnClearConsole.addEventListener("click", () => flashConsole("", false));

})();
