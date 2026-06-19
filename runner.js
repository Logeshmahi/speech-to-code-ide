/* ============================================================
   runner.js
   - Executes the editor's Python code in-browser using Pyodide
     (a full CPython-on-WebAssembly runtime). No server needed.
   - Pyodide (~6-10MB) is only fetched the first time Run is pressed.
   ============================================================ */

const Runner = (() => {
  let pyodide = null;
  let loading = null;

  async function load(onStatus) {
    if (pyodide) return pyodide;
    if (loading) return loading;

    loading = (async () => {
      onStatus && onStatus("Loading Python runtime (first run only)…");
      // Load the Pyodide loader script from CDN, then initialize it.
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js";
        script.onload = resolve;
        script.onerror = () => reject(new Error("Could not load Pyodide from CDN"));
        document.head.appendChild(script);
      });
      pyodide = await window.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/"
      });
      return pyodide;
    })();

    return loading;
  }

  async function run(code, onStatus) {
    try {
      const py = await load(onStatus);
      onStatus && onStatus("Running…");

      let out = "";
      let err = "";
      py.setStdout({ batched: (s) => { out += s + "\n"; } });
      py.setStderr({ batched: (s) => { err += s + "\n"; } });

      try {
        await py.runPythonAsync(code);
        return { ok: true, output: out, error: err };
      } catch (e) {
        return { ok: false, output: out, error: (err ? err + "\n" : "") + e.message };
      }
    } catch (e) {
      return { ok: false, output: "", error: "Failed to start Python runtime: " + e.message };
    }
  }

  return { run };
})();
