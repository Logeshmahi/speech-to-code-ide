# Speak & Code — Voice Python IDE

A browser-based IDE where you **dictate Python out loud**, watch it turn into real
indented code, and open/edit/save actual files and folders on your computer — no
install, no server, no backend.

## How to run it

1. Download the whole `voice-python-ide` folder.
2. Open `index.html` in **Google Chrome** or **Microsoft Edge** (desktop).
   That's it — just double-click the file, or drag it into the browser.

No build step, no `npm install`. CodeMirror, Pyodide, etc. load from public CDNs
the first time you use each feature.

### Browser requirements

| Feature | Needs |
|---|---|
| Voice dictation (Web Speech API) | Chrome or Edge (Safari/Firefox support is partial/absent) |
| Open/save real folders & files (File System Access API) | Chrome or Edge, desktop only |
| Run Python in-browser (Pyodide) | Any modern browser, but first run downloads ~6–10 MB |

If your browser doesn't support folder access, the app still works for dictation
and running code — you'll just see a warning in the sidebar.

Speech recognition needs **microphone permission** — your browser will ask the
first time you click "Start Listening."

> **Privacy note:** in Chrome, the Web Speech API sends audio to Google's servers
> for transcription (it isn't fully on-device). Don't dictate anything sensitive.

## How voice coding works

Click **Start Listening**, then speak naturally using the patterns below. Each
phrase you finish saying becomes one line of Python, correctly indented. The
right-hand panel shows a live log of what was heard and what code it produced —
use it to learn the patterns and to debug if something doesn't translate the way
you expected.

### Two modes

- **Code Mode** (default) — your speech is parsed into Python syntax using the
  command patterns below.
- **Dictation Mode** — your speech is typed in verbatim, untouched. Useful for
  writing comments or string content with unusual punctuation. Toggle with the
  buttons in the Voice panel, or say *"switch to dictation mode"* / *"switch to
  code mode."*

### Voice command reference

**Structure (auto-indents what follows):**
| Say | Produces |
|---|---|
| "define function `add` with parameters `a` and `b`" | `def add(a, b):` |
| "class `Animal` inherits from `Base`" | `class Animal(Base):` |
| "if `x` greater than `5`" | `if x > 5:` |
| "elif `x` equals `0`" / "else if ..." | `elif x == 0:` |
| "else" | `else:` |
| "for `i` in `range open paren 10 close paren`" | `for i in range(10):` |
| "while `x` less than `10`" | `while x < 10:` |
| "try" / "finally" | `try:` / `finally:` |
| "except `value error`" | `except ValueError:` |
| "with `open paren quote data dot txt quote close paren` as `f`" | `with open("data.txt") as f:` |

**Statements:**
| Say | Produces |
|---|---|
| "print `x`" | `print(x)` |
| "return `x` plus `y`" | `return x + y` |
| "`x` equals `5`" | `x = 5` |
| "`x` plus equals `1`" / "minus equals" | `x += 1` / `x -= 1` |
| "import `math`" | `import math` |
| "from `math` import `sqrt`" | `from math import sqrt` |
| "comment `this explains the code`" | `# this explains the code` |
| "pass" / "break" / "continue" | as written |
| "raise `value error`" | `raise ValueError()` |

**Symbols (spoken → typed):**
plus, minus, times / multiplied by, divided by, modulo / mod, power / to the power of,
equals (in conditions) → `==`, equals equals, not equal to, greater/less than
(or equal to), open/close paren, bracket, brace/curly, colon, comma, dot/period,
quote, single quote. Numbers up to ninety-nine are recognized ("twenty five" → `25`).

**Control commands:**
| Say | Effect |
|---|---|
| "new line" | inserts a blank line |
| "indent" / "dedent" | manually nudge indentation level |
| "delete line" | removes the last line you dictated |
| "clear all" | wipes the editor |
| "save file" | saves the open file |
| "run code" | runs the code |

### A worked example

Say, in order:
1. *"define function is even with parameters n"*
2. *"return n modulo two equals equals zero"*

You get:
```python
def is_even(n):
    return n % 2 == 0
```

## Files and folders

- **Open Folder** opens a real folder from your computer (with your permission)
  and shows it as a file tree on the left.
- Click any file in the tree to open it in the editor.
- **+ File** / **+ Folder** create a new file/subfolder inside the open folder.
- **Save** (or `Ctrl/Cmd+S`) writes the editor's content back to the open file.
- **Close Folder** releases access to the folder.

### Why can't I say "open folder" out loud?

Browsers only allow folder/file picker dialogs to open from a real, direct
mouse click — never from a script reacting to a voice command (this is a
security rule of the File System Access API, not a limitation of this app).
So **Open Folder**, **+ File/Folder**, and the very first save of a brand-new
file require a click. Once a file is already open, saying *"save file"* works
fine, since no new dialog is needed.

## Running code

Press **▶ Run** (or say *"run code"*) to execute the current editor content.
The first run downloads [Pyodide](https://pyodide.org) (a full Python
interpreter compiled to WebAssembly) — after that it's instant. Output and
errors appear in the Console panel below the editor. Note: this runs fully
inside your browser tab, so it can't read/write your real files or use
network/file libraries the way a normal Python install would.

## Known limitations (v1)

- Speech-recognition accuracy depends entirely on the browser's engine — accents,
  background noise, and unusual variable names can trip it up.
- The voice→code parser is rule-based, not an AI model. It covers the common
  Python patterns listed above but won't understand arbitrary phrasing — if a
  phrase doesn't match a pattern, it's inserted as a literal, lightly-cleaned line.
- Complex expressions with nested punctuation (deeply nested parens, multiple
  quoted strings in one line) are easier to get right by typing or by switching
  to Dictation Mode and editing manually.
- File access (open/save/new) only works in Chromium-based browsers.

## Customizing / extending

- All voice→Python rules live in `voice.js` (the `RULES` array and `SYMBOLS`
  table) — add new patterns there.
- File/folder logic is in `filesystem.js`.
- The Pyodide run integration is in `runner.js`.
- UI wiring and the indentation engine are in `app.js`.
- Styling/theme variables are in `style.css` (`:root` at the top).

