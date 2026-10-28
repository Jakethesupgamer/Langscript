(function () {
  if (typeof window.applyEffect !== 'function') {
    window.applyEffect = (effect, target) => console.log(`[Host Stub] applyEffect(${effect}, ${target})`);
  }
  if (typeof window.moveEntityForward !== 'function') {
    window.moveEntityForward = (entity) => console.log(`[Host Stub] moveEntityForward(${entity})`);
  }
  if (typeof window.setupSense !== 'function') {
    window.setupSense = (target) => console.log(`[Host Stub] setupSense(${target})`);
  }
  if (typeof window.setRelation !== 'function') {
    window.setRelation = (a, rel, b) => console.log(`[Host Stub] setRelation(${a}, "${rel}", ${b})`);
  }

  function tokenize(code) {
    const lines = code.split("\n");
    const parsedLines = [];

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      if (rawLine.trim().startsWith("#") || rawLine.trim() === "") continue;

      const indentMatch = rawLine.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1].length : 0;
      const trimmed = rawLine.trim();

      const regex = /("[^"]*"|'[^']*'|\d+\.\d+|\d+|=>|\+=|-=|\*=|\/=|\+\+|--|==|!=|<=|>=|>|<|\+|\-|\*|\/|=|\?:|:|[\w\?]+)/g;
      let match;
      const tokens = [];
      while ((match = regex.exec(trimmed)) !== null) {
        tokens.push(match[0]);
      }

      if (tokens.length > 0) {
        parsedLines.push({ tokens, indent, lineNum: i + 1, raw: trimmed });
      }
    }
    return parsedLines;
  }

  class LangscriptCompiler {
    constructor() {
      this.stateVars = new Set();
    }

    compile(code) {
      const lines = tokenize(code);
      let appName = "LangscriptApp";
      const constructorBody = [];
      const classMethods = [];

      let i = 0;
      while (i < lines.length) {
        const item = lines[i];
        const tokens = item.tokens;
        const head = tokens[0];

        if (head === "app") {
          if (tokens[1]) appName = tokens[1];
          i++;
          continue;
        }

        if (head === "fn" && tokens.length > 1 && !tokens[1].startsWith('"') && !tokens.includes("clicked?")) {
          const fnResult = this.parseFunction(lines, i);
          classMethods.push(fnResult.code);
          i = fnResult.nextIndex;
          continue;
        }

        const blockParsed = this.tryParseBlockConstruct(lines, i);
        if (blockParsed) {
          constructorBody.push(blockParsed.code);
          i = blockParsed.nextIndex;
          continue;
        }

        const stmt = this.parseStatement(tokens, item.lineNum);
        if (stmt) {
          constructorBody.push(stmt);
        } else {
          console.error(`Langscript Error: Unknown line ${item.lineNum}: "${item.raw}"`);
        }
        i++;
      }

      return this.buildJavaScriptClass(appName, constructorBody, classMethods);
    }

    parseExpression(tokens) {
      let expr = tokens.join(" ");

      expr = expr.replace(/math\s+floor\s+math\s+random\s*\+/g, "(Math.floor(Math.random() * 10) + 1)");
      expr = expr.replace(/math\s+floor\s+math\s+random/g, "Math.floor(Math.random() * 10)");
      expr = expr.replace(/math\s+random\s*\+/g, "(Math.floor(Math.random() * 10) + 1)");
      expr = expr.replace(/math\s+random/g, "Math.floor(Math.random() * 10)");
      expr = expr.replace(/math\s+floor\s+(\S+)/g, "Math.floor($1)");
      expr = expr.replace(/math\s+random\s*\*\s*(\w+|\d+)/g, "(Math.random() * $1)");
      expr = expr.replace(/math\s+random\s*\/\s*(\w+|\d+)/g, "(Math.random() / $1)");

      this.stateVars.forEach((v) => {
        const reg = new RegExp(`\\b${v}\\b`, "g");
        expr = expr.replace(reg, `this.${v}`);
      });

      return expr;
    }

    parseStatement(tokens, lineNum) {
      if (!tokens || tokens.length === 0) return "";

      const first = tokens[0];

      if (first === "return") {
        const expr = this.parseExpression(tokens.slice(1));
        return `return ${expr};`;
      }

      if (first === "print") {
        const expr = this.parseExpression(tokens.slice(1));
        return `console.log(${expr});`;
      }

      if (first === "put") {
        const inIndex = tokens.lastIndexOf("in");
        if (inIndex !== -1) {
          const valueExpr = this.parseExpression(tokens.slice(1, inIndex));
          const targetId = tokens.slice(inIndex + 1).join(" ").replace(/"/g, "");
          return `const _el_${targetId.replace(/-/g, "_")} = document.getElementById("${targetId}"); if (_el_${targetId.replace(/-/g, "_")}) { _el_${targetId.replace(/-/g, "_")}.textContent = String(${valueExpr}); }`;
        }
      }

      if (first === "id") {
        const idName = tokens[1].replace(/"/g, "");
        return `this._id_${idName.replace(/-/g, "_")} = document.getElementById("${idName}");`;
      }

      if (first === "class") {
        const className = tokens[1].replace(/"/g, "");
        return `this._class_${className.replace(/-/g, "_")} = document.getElementsByClassName("${className}");`;
      }

      if (first === "wait") {
        const sec = parseFloat(tokens[1]) || 1;
        return `await new Promise(res => setTimeout(res, ${sec * 1000}));`;
      }

      if (tokens.includes("=>")) {
        const idx = tokens.indexOf("=>");
        const effect = tokens.slice(0, idx).join(" ");
        const target = tokens.slice(idx + 1).join(" ");
        return `applyEffect(${effect}, ${target});`;
      }

      if (first === "let" && tokens[2] === "forward") {
        return `moveEntityForward(${tokens[1]});`;
      }

      if (first === "sense" && tokens.length === 2 && !tokens.includes("near") && !tokens.includes("far")) {
        return `setupSense(${tokens[1]});`;
      }

      if (first === "sense" && (tokens.includes("near") || tokens.includes("far"))) {
        const relType = tokens.includes("near") ? "near" : "far";
        const idx = tokens.indexOf(relType);
        const a = tokens.slice(1, idx).join(" ");
        const b = tokens.slice(idx + 1).join(" ");
        return `setRelation(${a}, "${relType}", ${b});`;
      }

      if (tokens.length >= 3 && tokens[1] === "=") {
        const varName = tokens[0];
        this.stateVars.add(varName);
        const valExpr = this.parseExpression(tokens.slice(2));
        return `this.${varName} = ${valExpr};`;
      }

      const expr = this.parseExpression(tokens);
      if (expr) return expr + ";";

      console.error(`Langscript Error: Unknown statement at line ${lineNum}: "${tokens.join(" ")}"`);
      return "";
    }

    parseBlockStatements(lines, startIndex, baseIndent) {
      const statements = [];
      let i = startIndex;

      while (i < lines.length) {
        const item = lines[i];
        if (item.indent <= baseIndent) break;

        const nestedBlock = this.tryParseBlockConstruct(lines, i);
        if (nestedBlock) {
          statements.push(nestedBlock.code);
          i = nestedBlock.nextIndex;
        } else {
          const stmt = this.parseStatement(item.tokens, item.lineNum);
          if (stmt) statements.push(stmt);
          i++;
        }
      }
      return { statements, nextIndex: i };
    }

    tryParseBlockConstruct(lines, startIndex) {
      const item = lines[startIndex];
      const tokens = item.tokens;

      if (tokens.includes("clicked?") || (tokens[0] === "fn" && tokens[1] && tokens[1].startsWith('"'))) {
        const baseIndent = item.indent;
        const blockResult = this.parseBlockStatements(lines, startIndex + 1, baseIndent);

        if (tokens[0].startsWith('"') || (tokens[0] === "fn" && tokens[1].startsWith('"'))) {
          const btnId = tokens[0].startsWith('"') ? tokens[0].replace(/"/g, "") : tokens[1].replace(/"/g, "");
          const code = `const _el_${btnId.replace(/-/g, "_")} = document.getElementById("${btnId}");
if (_el_${btnId.replace(/-/g, "_")}) {
  _el_${btnId.replace(/-/g, "_")}.addEventListener('click', async () => {
    ${blockResult.statements.join("\n    ")}
  });
}`;
          return { code, nextIndex: blockResult.nextIndex };
        } else if (tokens[0] === "key") {
          const keyType = tokens[1].replace(/"/g, "");
          let keyCondition = `e.key === "${keyType}" || e.code === "${keyType}"`;
          if (keyType === "space") keyCondition = `e.code === "Space" || e.key === " "`;
          if (keyType === "lmb") {
            const code = `window.addEventListener('mousedown', async (e) => {
  if (e.button === 0) {
    ${blockResult.statements.join("\n    ")}
  }
});`;
            return { code, nextIndex: blockResult.nextIndex };
          }
          const code = `window.addEventListener('keydown', async (e) => {
  if (${keyCondition}) {
    ${blockResult.statements.join("\n    ")}
  }
});`;
          return { code, nextIndex: blockResult.nextIndex };
        }
      }

      if (tokens[0] === "if") {
        const baseIndent = item.indent;
        const condition = this.parseExpression(tokens.slice(1)).replace(/:$/, "");
        const ifBlock = this.parseBlockStatements(lines, startIndex + 1, baseIndent);
        let nextIdx = ifBlock.nextIndex;
        let elseChain = "";

        while (nextIdx < lines.length && lines[nextIdx].indent === baseIndent) {
          const nextTokens = lines[nextIdx].tokens;
          if (nextTokens[0] === "else" && nextTokens[1] === "if") {
            const elseIfCond = this.parseExpression(nextTokens.slice(2)).replace(/:$/, "");
            const elseIfBlock = this.parseBlockStatements(lines, nextIdx + 1, baseIndent);
            elseChain += ` else if (${elseIfCond}) {\n    ${elseIfBlock.statements.join("\n    ")}\n  }`;
            nextIdx = elseIfBlock.nextIndex;
          } else if (nextTokens[0] === "else") {
            const elseBlock = this.parseBlockStatements(lines, nextIdx + 1, baseIndent);
            elseChain += ` else {\n    ${elseBlock.statements.join("\n    ")}\n  }`;
            nextIdx = elseBlock.nextIndex;
            break;
          } else {
            break;
          }
        }

        const code = `if (${condition}) {\n    ${ifBlock.statements.join("\n    ")}\n  }${elseChain}`;
        return { code, nextIndex: nextIdx };
      }

      if (tokens[0] === "loop") {
        const sec = parseFloat(tokens[1]) || 1;
        const baseIndent = item.indent;
        const loopBlock = this.parseBlockStatements(lines, startIndex + 1, baseIndent);
        const code = `setInterval(async () => {\n    ${loopBlock.statements.join("\n    ")}\n  }, ${sec * 1000});`;
        return { code, nextIndex: loopBlock.nextIndex };
      }

      return null;
    }

    parseFunction(lines, startIndex) {
      const item = lines[startIndex];
      const headerTokens = item.tokens;
      const fnName = headerTokens[1].split("(")[0].replace(":", "");
      const params = headerTokens.slice(2).join(" ").replace("):", "").replace(":", "");

      const blockResult = this.parseBlockStatements(lines, startIndex + 1, item.indent);
      const code = `  async ${fnName}(${params}) {\n    ${blockResult.statements.join("\n    ")}\n  }`;
      return { code, nextIndex: blockResult.nextIndex };
    }

    buildJavaScriptClass(appName, constructorBody, classMethods) {
      return `
class ${appName} {
  constructor() {
    ${constructorBody.join("\n    ")}
    if (typeof this.run === 'function') {
      this.run();
    } else if (typeof this.start === 'function') {
      this.start();
    } else if (typeof this.init === 'function') {
      this.init();
    }
  }

${classMethods.join("\n\n")}
}

(function() {
  const __boot = () => { window.appInstance = new ${appName}(); };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", __boot);
  } else {
    __boot();
  }
})();
`;
    }
  }

  function compile(code) {
    const compiler = new LangscriptCompiler();
    return compiler.compile(code);
  }

  function run() {
    const scripts = document.querySelectorAll('script[type="text/langscript"]');
    const compiler = new LangscriptCompiler();

    scripts.forEach((script) => {
      try {
        const compiledJS = compiler.compile(script.textContent);
        const executableScript = document.createElement("script");
        executableScript.textContent = compiledJS;
        document.body.appendChild(executableScript);
      } catch (err) {
        console.error("Langscript Compilation Error:", err);
      }
    });
  }

  window.Langscript = { compile, run, LangscriptCompiler };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
