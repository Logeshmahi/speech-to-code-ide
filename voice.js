/* ============================================================
   voice.js
   - Wraps the browser's Web Speech API (SpeechRecognition)
   - Translates spoken English into Python code lines
   ============================================================ */

const Voice = (() => {

  /* ---------- number words -> digits ---------- */
  const ONES = {
    zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
    ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15,
    sixteen:16, seventeen:17, eighteen:18, nineteen:19
  };
  const TENS = {
    twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90
  };

  function convertNumberWords(text) {
    // "twenty five" -> "25" (compound tens+ones), then standalone words
    let t = text.replace(
      /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(one|two|three|four|five|six|seven|eight|nine)\b/gi,
      (m, tens, ones) => String(TENS[tens.toLowerCase()] + ONES[ones.toLowerCase()])
    );
    Object.keys(TENS).forEach(w => {
      t = t.replace(new RegExp(`\\b${w}\\b`, "gi"), String(TENS[w]));
    });
    Object.keys(ONES).forEach(w => {
      t = t.replace(new RegExp(`\\b${w}\\b`, "gi"), String(ONES[w]));
    });
    return t;
  }

  /* ---------- spoken symbols -> python operators/punctuation ---------- */
  // Ordered longest-phrase-first so e.g. "equals equals" beats "equals".
  const SYMBOLS = [
    ["greater than or equal to", ">="],
    ["less than or equal to", "<="],
    ["not equal to", "!="],
    ["is equal to", "=="],
    ["equals equals", "=="],
    ["equal to", "=="],
    ["equals", "=="],
    ["greater than", ">"],
    ["less than", "<"],
    ["divided by", "/"],
    ["multiplied by", "*"],
    ["to the power of", "**"],
    ["open paren", "("], ["open parenthesis", "("],
    ["close paren", ")"], ["close parenthesis", ")"],
    ["open bracket", "["], ["close bracket", "]"],
    ["open brace", "{"], ["open curly", "{"],
    ["close brace", "}"], ["close curly", "}"],
    ["single quote", "'"],
    ["not equals", "!="],
    ["plus equals", "+="],
    ["minus equals", "-="],
    ["power", "**"],
    ["modulo", "%"],
    ["mod", "%"],
    ["times", "*"],
    ["plus", "+"],
    ["minus", "-"],
    ["colon", ":"],
    ["comma", ","],
    ["dot", "."],
    ["period", "."],
    ["quote", '"'],
    ["point", "."],
  ];

  function substituteSymbols(text) {
    let t = " " + text.trim() + " ";
    for (const [phrase, sym] of SYMBOLS) {
      const re = new RegExp(`\\b${phrase.replace(/ /g, "\\s+")}\\b`, "gi");
      t = t.replace(re, ` ${sym} `);
    }
    t = convertNumberWords(t);
    // tidy spacing around punctuation that shouldn't have a leading space
    t = t.replace(/\s+([,.:)\]}])/g, "$1");
    t = t.replace(/([(\[{])\s+/g, "$1");
    t = t.replace(/(\w)\s+\(/g, "$1(");
    t = t.replace(/"\s+/g, '"').replace(/\s+"/g, '"');
    t = t.replace(/'\s+/g, "'").replace(/\s+'/g, "'");
    return t.replace(/\s+/g, " ").trim();
  }

  /* ---------- common exception names, spoken with spaces -> proper CamelCase ---------- */
  const EXCEPTION_NAMES = {
    "value error": "ValueError",
    "type error": "TypeError",
    "key error": "KeyError",
    "index error": "IndexError",
    "name error": "NameError",
    "attribute error": "AttributeError",
    "zero division error": "ZeroDivisionError",
    "file not found error": "FileNotFoundError",
    "import error": "ImportError",
    "runtime error": "RuntimeError",
    "stop iteration": "StopIteration",
    "not implemented error": "NotImplementedError",
    "exception": "Exception",
  };

  function normalizeExceptionPhrase(text) {
    const key = text.trim().toLowerCase();
    if (EXCEPTION_NAMES[key]) return EXCEPTION_NAMES[key];
    return substituteSymbols(text);
  }

  /* ---------- keywords that should "dedent then re-indent" ---------- */
  const REJOIN_KEYWORDS = new Set(["else", "elif", "except", "finally"]);

  /* ---------- line pattern rules ----------
     Each rule: { test: RegExp, build: (match) => { code, keyword } }
     `keyword` is used for indent bookkeeping.
  ------------------------------------------- */
  const RULES = [
    {
      test: /^define function (\w+)(?: with parameters? (.+))?$/i,
      build: (m) => {
        const name = m[1];
        let params = "";
        if (m[2]) {
          params = m[2]
            .split(/\s*,\s*|\s+and\s+/i)
            .map(p => substituteSymbols(p))
            .filter(Boolean)
            .join(", ");
        }
        return { code: `def ${name}(${params}):`, keyword: "def" };
      }
    },
    {
      test: /^class (\w+)(?: inherits(?: from)? (\w+))?$/i,
      build: (m) => ({
        code: m[2] ? `class ${m[1]}(${m[2]}):` : `class ${m[1]}:`,
        keyword: "class"
      })
    },
    {
      test: /^else if (.+)$/i,
      build: (m) => ({ code: `elif ${substituteSymbols(m[1])}:`, keyword: "elif" })
    },
    {
      test: /^elif (.+)$/i,
      build: (m) => ({ code: `elif ${substituteSymbols(m[1])}:`, keyword: "elif" })
    },
    {
      test: /^else$/i,
      build: () => ({ code: "else:", keyword: "else" })
    },
    {
      test: /^if (.+)$/i,
      build: (m) => ({ code: `if ${substituteSymbols(m[1])}:`, keyword: "if" })
    },
    {
      test: /^for (\w+) in (.+)$/i,
      build: (m) => ({ code: `for ${m[1]} in ${substituteSymbols(m[2])}:`, keyword: "for" })
    },
    {
      test: /^while (.+)$/i,
      build: (m) => ({ code: `while ${substituteSymbols(m[1])}:`, keyword: "while" })
    },
    {
      test: /^try$/i,
      build: () => ({ code: "try:", keyword: "try" })
    },
    {
      test: /^except(?: (.+))?$/i,
      build: (m) => ({ code: m[1] ? `except ${normalizeExceptionPhrase(m[1])}:` : "except:", keyword: "except" })
    },
    {
      test: /^raise(?: (.+))?$/i,
      build: (m) => {
        if (!m[1]) return { code: "raise", keyword: "raise" };
        const key = m[1].trim().toLowerCase();
        const code = EXCEPTION_NAMES[key] ? `raise ${EXCEPTION_NAMES[key]}()` : `raise ${substituteSymbols(m[1])}`;
        return { code, keyword: "raise" };
      }
    },
    {
      test: /^finally$/i,
      build: () => ({ code: "finally:", keyword: "finally" })
    },
    {
      test: /^with (.+) as (\w+)$/i,
      build: (m) => ({ code: `with ${substituteSymbols(m[1])} as ${m[2]}:`, keyword: "with" })
    },
    {
      test: /^comment (.+)$/i,
      build: (m) => ({ code: `# ${m[1].trim()}`, keyword: "comment" })
    },
    {
      test: /^print(?: (.+))?$/i,
      build: (m) => ({ code: `print(${m[1] ? substituteSymbols(m[1]) : ""})`, keyword: "print" })
    },
    {
      test: /^return(?: (.+))?$/i,
      build: (m) => ({ code: m[1] ? `return ${substituteSymbols(m[1])}` : "return", keyword: "return" })
    },
    {
      test: /^from (\S+) import (.+)$/i,
      build: (m) => ({ code: `from ${m[1]} import ${m[2].replace(/\s+and\s+/gi, ", ")}`, keyword: "import" })
    },
    {
      test: /^import (.+)$/i,
      build: (m) => ({ code: `import ${m[1].replace(/\s+and\s+/gi, ", ")}`, keyword: "import" })
    },
    {
      test: /^(pass|break|continue)$/i,
      build: (m) => ({ code: m[1].toLowerCase(), keyword: "simple" })
    },
    {
      test: /^(\w+(?:\.\w+)*(?:\[[^\]]*\])?)\s+plus equals\s+(.+)$/i,
      build: (m) => ({ code: `${m[1]} += ${substituteSymbols(m[2])}`, keyword: "assign" })
    },
    {
      test: /^(\w+(?:\.\w+)*(?:\[[^\]]*\])?)\s+minus equals\s+(.+)$/i,
      build: (m) => ({ code: `${m[1]} -= ${substituteSymbols(m[2])}`, keyword: "assign" })
    },
    {
      test: /^(\w+(?:\.\w+)*(?:\[[^\]]*\])?)\s+equals\s+(.+)$/i,
      build: (m) => ({ code: `${m[1]} = ${substituteSymbols(m[2])}`, keyword: "assign" })
    },
  ];

  // Control commands handled separately from code-generating rules.
  const CONTROL_PATTERNS = [
    { test: /^new line$/i, action: "newline" },
    { test: /^indent$/i, action: "indent" },
    { test: /^(dedent|outdent|unindent|end block)$/i, action: "dedent" },
    { test: /^delete line$/i, action: "deleteline" },
    { test: /^clear (all|everything)$/i, action: "clearall" },
    { test: /^save(?: file)?$/i, action: "save" },
    { test: /^run(?: code)?$/i, action: "run" },
    { test: /^switch to dictation(?: mode)?$/i, action: "mode-dictation" },
    { test: /^switch to code(?: mode)?$/i, action: "mode-code" },
  ];

  function stripFiller(text) {
    return text
      .trim()
      .replace(/^(please|now|okay|ok|um|uh)[\s,]+/i, "")
      .replace(/\s+(period|full stop)$/i, "") // some engines append "period" for "."
      .trim();
  }

  /**
   * Parse one finalized speech utterance into a sequence of actions.
   * Returns an array of: { type: "code", code, keyword } | { type: "control", action }
   */
  function parseUtterance(rawText, mode) {
    if (mode === "dictation") {
      const cleaned = stripFiller(rawText);
      return cleaned ? [{ type: "code", code: cleaned, keyword: "raw", raw: rawText }] : [];
    }

    const trimmedWhole = stripFiller(rawText);
    const wholeControl = CONTROL_PATTERNS.find(p => p.test.test(trimmedWhole));
    if (wholeControl) return [{ type: "control", action: wholeControl.action, raw: rawText }];

    const results = [];
    const segments = rawText
      .split(/\bnew line\b/i)
      .map(s => stripFiller(s))
      .filter(s => s.length > 0);

    segments.forEach(cleaned => {
      const control = CONTROL_PATTERNS.find(p => p.test.test(cleaned));
      if (control) {
        results.push({ type: "control", action: control.action, raw: cleaned });
        return;
      }
      const rule = RULES.find(r => r.test.test(cleaned));
      if (rule) {
        const m = cleaned.match(rule.test);
        const built = rule.build(m);
        results.push({ type: "code", code: built.code, keyword: built.keyword, raw: cleaned });
      } else {
        // fallback: treat as a generic expression/statement
        results.push({ type: "code", code: substituteSymbols(cleaned), keyword: "raw", raw: cleaned });
      }
    });

    return results;
  }

  /* ---------- Speech recognition wrapper ---------- */
  class SpeechEngine {
    constructor({ onInterim, onFinal, onStateChange, onError }) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.supported = !!SR;
      this.listening = false;
      this.onInterim = onInterim;
      this.onFinal = onFinal;
      this.onStateChange = onStateChange;
      this.onError = onError;
      this._userStopped = false;

      if (this.supported) {
        this.recognition = new SR();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = "en-US";

        this.recognition.onresult = (event) => {
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              this.onFinal && this.onFinal(transcript);
            } else {
              interim += transcript;
            }
          }
          if (interim) this.onInterim && this.onInterim(interim);
        };

        this.recognition.onerror = (event) => {
          this.onError && this.onError(event.error);
        };

        this.recognition.onend = () => {
          // Chrome stops recognition after a pause; auto-restart unless the user explicitly stopped it.
          if (this.listening && !this._userStopped) {
            try { this.recognition.start(); } catch (e) { /* already starting */ }
          } else {
            this.listening = false;
            this.onStateChange && this.onStateChange(false);
          }
        };
      }
    }

    setLanguage(lang) {
      if (this.recognition) this.recognition.lang = lang;
    }

    start() {
      if (!this.supported || this.listening) return;
      this._userStopped = false;
      this.listening = true;
      try {
        this.recognition.start();
        this.onStateChange && this.onStateChange(true);
      } catch (e) {
        this.listening = false;
      }
    }

    stop() {
      if (!this.supported) return;
      this._userStopped = true;
      this.listening = false;
      try { this.recognition.stop(); } catch (e) { /* noop */ }
      this.onStateChange && this.onStateChange(false);
    }
  }

  return { parseUtterance, substituteSymbols, SpeechEngine };
})();
