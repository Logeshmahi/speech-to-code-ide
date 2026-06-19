/* ============================================================
   filesystem.js
   - Uses the File System Access API to let the IDE open a real
     folder on disk, browse it, open/edit/save files, and close it.
   - NOTE: by browser design, showDirectoryPicker()/showSaveFilePicker()
     can only be called from a direct user gesture (a click), never
     from a voice command callback. Voice can still trigger "save"
     for an *already open* file, since no new picker is needed.
   ============================================================ */

const FileSystem = (() => {
  const supported = "showDirectoryPicker" in window;

  let rootHandle = null;       // FileSystemDirectoryHandle of the open folder
  let currentFileHandle = null; // FileSystemFileHandle of the open file
  let currentPath = "";
  let dirty = false;

  let treeEl, warningEl;
  let onFileOpenCb = () => {};
  let onTreeStateCb = () => {};

  const SKIP = new Set(["node_modules", ".git", "__pycache__", ".venv", "venv", ".DS_Store"]);
  const MAX_DEPTH = 6;
  const MAX_ENTRIES_PER_DIR = 300;

  function init({ treeElement, warningElement, onFileOpen, onTreeState }) {
    treeEl = treeElement;
    warningEl = warningElement;
    onFileOpenCb = onFileOpen || (() => {});
    onTreeStateCb = onTreeState || (() => {});
    if (!supported && warningEl) warningEl.classList.remove("hidden");
  }

  async function buildTree(dirHandle, depth = 0) {
    const node = { name: dirHandle.name, kind: "directory", handle: dirHandle, children: [] };
    if (depth >= MAX_DEPTH) return node;
    let count = 0;
    for await (const [name, handle] of dirHandle.entries()) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      if (++count > MAX_ENTRIES_PER_DIR) break;
      if (handle.kind === "directory") {
        node.children.push(await buildTree(handle, depth + 1));
      } else {
        node.children.push({ name, kind: "file", handle });
      }
    }
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return node;
  }

  function renderTree(node, container, path = "") {
    node.children.forEach(child => {
      const childPath = path ? `${path}/${child.name}` : child.name;
      const row = document.createElement("div");
      row.className = "tree-row";
      row.textContent = (child.kind === "directory" ? "📁 " : "🐍 ") + child.name;
      row.title = childPath;

      if (child.kind === "directory") {
        const wrap = document.createElement("div");
        wrap.className = "tree-node";
        const childrenEl = document.createElement("div");
        childrenEl.className = "tree-children hidden";
        row.addEventListener("click", () => childrenEl.classList.toggle("hidden"));
        wrap.appendChild(row);
        wrap.appendChild(childrenEl);
        renderTree(child, childrenEl, childPath);
        container.appendChild(wrap);
      } else {
        row.addEventListener("click", async () => {
          container.querySelectorAll(".tree-row.active").forEach(r => r.classList.remove("active"));
          row.classList.add("active");
          await openFile(child.handle, childPath);
        });
        container.appendChild(row);
      }
    });
  }

  async function refreshTree() {
    treeEl.innerHTML = "";
    if (!rootHandle) {
      treeEl.innerHTML = `<p class="empty-hint">No folder open.<br/>Click <strong>Open Folder</strong> to begin.</p>`;
      return;
    }
    const tree = await buildTree(rootHandle);
    const header = document.createElement("div");
    header.className = "tree-row";
    header.style.fontWeight = "600";
    header.textContent = "📂 " + rootHandle.name;
    treeEl.appendChild(header);
    renderTree(tree, treeEl);
  }

  async function openFolder() {
    if (!supported) return;
    try {
      rootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      currentFileHandle = null;
      currentPath = "";
      dirty = false;
      await refreshTree();
      onTreeStateCb({ folderOpen: true, fileOpen: false });
    } catch (e) {
      // user cancelled the picker — nothing to do
    }
  }

  async function openFile(handle, path) {
    const file = await handle.getFile();
    const text = await file.text();
    currentFileHandle = handle;
    currentPath = path;
    dirty = false;
    onFileOpenCb(text, path);
    onTreeStateCb({ folderOpen: !!rootHandle, fileOpen: true, path });
  }

  async function save(content) {
    if (!currentFileHandle) return { ok: false, reason: "no-file-open" };
    try {
      const writable = await currentFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      dirty = false;
      onTreeStateCb({ folderOpen: !!rootHandle, fileOpen: true, path: currentPath, justSaved: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  function markDirty() {
    dirty = true;
    onTreeStateCb({ folderOpen: !!rootHandle, fileOpen: !!currentFileHandle, path: currentPath, dirty: true });
  }

  async function newFile(name) {
    if (!rootHandle) return;
    if (!name.endsWith(".py") && !name.includes(".")) name += ".py";
    const handle = await rootHandle.getFileHandle(name, { create: true });
    await refreshTree();
    await openFile(handle, name);
  }

  async function newFolder(name) {
    if (!rootHandle) return;
    await rootHandle.getDirectoryHandle(name, { create: true });
    await refreshTree();
  }

  function closeFolder() {
    rootHandle = null;
    currentFileHandle = null;
    currentPath = "";
    dirty = false;
    refreshTree();
    onTreeStateCb({ folderOpen: false, fileOpen: false });
  }

  function hasOpenFile() { return !!currentFileHandle; }
  function hasOpenFolder() { return !!rootHandle; }
  function getCurrentPath() { return currentPath; }

  return {
    supported, init, openFolder, openFile, save, newFile, newFolder,
    closeFolder, markDirty, hasOpenFile, hasOpenFolder, getCurrentPath
  };
})();
