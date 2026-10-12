/**
 * Langscript v0.1.1 Browser Bundle
 * Transpiles and executes .ls script tags directly in the browser.
 */
(function () {
  'use strict';

  // --- 1. PARSER & AST (From parse.ts) ---
  class Parser {
    constructor(source) {
      this.lines = [];
      this.current = 0;
      this.errors = [];

      const rawLines = source.split(/\r?\n/);
      rawLines.forEach((raw, idx) => {
        const trimmed = raw.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const indent = raw.search(/\S/);
        this.lines.push({
          lineNumber: idx + 1,
          indent: indent === -1 ? 0 : indent,
          text: trimmed,
        });
      });
    }

    parse() {
      const nodes = [];
      while (this.current < this.lines.length) {
        const node = this.parseStatement(0);
        if (node) nodes.push(node);
        else this.advance();
      }
      return nodes;
    }

    peek() {
      return this.lines[this.current];
    }

    advance() {
      return this.lines[this.current++];
    }

    parseBlock(parentIndent) {
      const body = [];
      const firstInBlock = this.peek();

      if (!firstInBlock || firstInBlock.indent <= parentIndent) {
        if (firstInBlock) {
          this.errors.push({
            line: firstInBlock.lineNumber,
            message: `Expected indented block (indent > ${parentIndent}), found indent ${firstInBlock.indent}.`,
          });
        }
        return body;
      }

      const blockIndent = firstInBlock.indent;
      while (this.peek() && this.peek().indent === blockIndent) {
        const node = this.parseStatement(blockIndent);
        if (node) body.push(node);
      }

      return body;
    }

    parseStatement(currentIndent) {
      const line = this.peek();
      if (!line) return null;

      const text = line.text;
      const lNo = line.lineNumber;

      if (text.startsWith('app ')) {
        this.advance();
        const name = text.substring(4).replace(/:$/, '').trim();
        const body = this.parseBlock(line.indent);
        return { type: 'AppNode', name, body };
      }

      if (text.startsWith('fn ')) {
        this.advance();
        const rest = text.substring(3).replace(/:$/, '').trim();

        if (rest.startsWith('"') && rest.endsWith('"')) {
          const idName = rest.slice(1, -1);
          const body = this.parseBlock(line.indent);
          return { type: 'EventHandlerNode', targetType: 'id', target: idName, body };
        }

        const match = rest.match(/^([a-zA-Z0-9_]+)\((.*)\)$/);
        if (match) {
          const name = match[1];
          const params = match[2] ? match[2].split(',').map((s) => s.trim()) : [];
          const body = this.parseBlock(line.indent);
          const hasWait = JSON.stringify(body).includes('WaitNode');
          return { type: 'FnNode', name, params, isAsync: hasWait, body };
        }

        this.errors.push({ line: lNo, message: `Invalid function signature: "${text}"` });
        return null;
      }

      if (text.startsWith('return')) {
        this.advance();
        const expression = text.substring(6).trim();
        return { type: 'ReturnNode', expression: this.parseMathExpr(expression) };
      }

      if (text.startsWith('print ')) {
        this.advance();
        const expression = text.substring(6).trim();
        return { type: 'PrintNode', expression: this.parseMathExpr(expression) };
      }

      if (text.startsWith('if ')) {
        this.advance();
        const cond = text.substring(3).replace(/:$/, '').trim();
        const thenBody = this.parseBlock(line.indent);
        const elseIfs = [];
        let elseBody = undefined;

        while (this.peek() && this.peek().text.startsWith('else if ')) {
          const elifLine = this.advance();
          const elifCond = elifLine.text.substring(8).replace(/:$/, '').trim();
          const elifBody = this.parseBlock(elifLine.indent);
          elseIfs.push({ condition: this.parseMathExpr(elifCond), body: elifBody });
        }

        if (this.peek() && (this.peek().text === 'else' || this.peek().text === 'else:')) {
          const elseLine = this.advance();
          elseBody = this.parseBlock(elseLine.indent);
        }

        return { type: 'IfNode', condition: this.parseMathExpr(cond), thenBody, elseIfs, elseBody };
      }

      if (text.startsWith('wait ')) {
        this.advance();
        const secStr = text.substring(5).trim();
        const seconds = parseFloat(secStr);
        if (isNaN(seconds)) {
          this.errors.push({ line: lNo, message: `Invalid seconds duration for wait: "${secStr}"` });
        }
        return { type: 'WaitNode', seconds: seconds || 0 };
      }

      if (text.startsWith('loop ')) {
        this.advance();
        const secStr = text.replace(/:$/, '').substring(5).trim();
        const seconds = parseFloat(secStr);
        if (isNaN(seconds)) {
          this.errors.push({ line: lNo, message: `Invalid seconds duration for loop: "${secStr}"` });
        }
        const body = this.parseBlock(line.indent);
        return { type: 'LoopNode', seconds: seconds || 0, body };
      }

      if (text.startsWith('id ')) {
        this.advance();
        const idName = text.substring(3).trim().replace(/^"|"$/g, '');
        return { type: 'IdDeclNode', idName };
      }

      if (text.includes('clicked?')) {
        this.advance();
        const targetStr = text.replace('clicked?', '').replace(/:$/, '').trim();
        let targetType = 'id';
        let target = targetStr.replace(/^"|"$/g, '');

        if (targetStr.startsWith('key ')) {
          targetType = 'key';
          target = targetStr.substring(4).replace(/^"|"$/g, '').trim();
        }

        const body = this.parseBlock(line.indent);
        return { type: 'EventHandlerNode', targetType, target, body };
      }

      if (text.includes('=>')) {
        this.advance();
        const parts = text.split('=>').map((s) => s.trim().replace(/^"|"$/g, ''));
        return { type: 'EffectNode', effect: parts[0], target: parts[1] };
      }

      if (text.startsWith('let ') && text.endsWith('forward')) {
        this.advance();
        const entity = text.replace(/^let\s+/, '').replace(/\s+forward$/, '').trim().replace(/^"\vert{}"$/g, '');
        return { type: 'MovementNode', entity, direction: 'forward' };
      }

      if (text.startsWith('sense ')) {
        this.advance();
        const rest = text.substring(6).replace(/:$/, '').trim();

        if (rest.includes(' near ')) {
          const parts = rest.split(' near ').map((s) => s.trim().replace(/^"|"$/g, ''));
          const body = this.parseBlock(line.indent);
          return { type: 'RelationNode', subject: parts[0], relation: 'near', object: parts[1], body };
        }

        const target = rest.replace(/^"|"$/g, '');
        const body = this.parseBlock(line.indent);
        return { type: 'SenseNode', target, body };
      }

      if (text.includes(' near ') || text.includes(' far ')) {
        this.advance();
        const isNear = text.includes(' near ');
        const rel = isNear ? 'near' : 'far';
        const parts = text.replace(/:$/, '').split(` ${rel} `).map((s) => s.trim().replace(/^"|"$/g, ''));
        const body = this.parseBlock(line.indent);
        return { type: 'RelationNode', subject: parts[0], relation: rel, object: parts[1], body };
      }

      this.advance();
      this.errors.push({ line: lNo, message: `Unknown or unparseable Langscript pattern: "${text}"` });
      return null;
    }

    parseMathExpr(expr) {
      return expr
        .replace(/math floor\s+([0-9a-zA-Z_.]+)/g, 'Math.floor($1)')
        .replace(/math random\+/g, '(Math.floor(Math.random() * 10) + 1)')
        .replace(/math random\s*\*\s*([0-9.]+)/g, '(Math.random() * $1)')
        .replace(/math random\s*\/\s*([0-9.]+)/g, '(Math.random() / $1)')
        .replace(/math random/g, 'Math.floor(Math.random() * 10)');
    }
  }

  // --- 2. CODE EMITTER (From emit.ts with v0.1.1 auto-call) ---
  class CodeEmitter {
    constructor() {
      this.indentLevel = 0;
    }

    pad() {
      return '  '.repeat(this.indentLevel);
    }

    emitNodes(nodes) {
      return nodes.map((node) => this.emitNode(node)).filter(Boolean).join('\n');
    }

    emitNode(node) {
      switch (node.type) {
        case 'AppNode': {
          let code = `${this.pad()}class ${node.name} {\n`;
          this.indentLevel++;

          const methods = node.body.filter((n) => n.type === 'FnNode');
          const initStatements = node.body.filter((n) => n.type !== 'FnNode');

          if (initStatements.length > 0) {
            code += `${this.pad()}constructor() {\n`;
            this.indentLevel++;
            code += initStatements.map((n) => this.emitNode(n)).join('\n');
            this.indentLevel--;
            code += `\n${this.pad()}}\n\n`;
          }

          code += methods.map((n) => this.emitNode(n)).join('\n');
          this.indentLevel--;
          code += `${this.pad()}}\n\n`;

          // v0.1.1 Safe method auto-invocation
          code += `${this.pad()}const __ls_app = new ${node.name}();\n`;
          code += `${this.pad()}if (typeof __ls_app.run === 'function') __ls_app.run();\n`;
          code += `${this.pad()}else if (typeof __ls_app.start === 'function') __ls_app.start();\n`;
          code += `${this.pad()}else if (typeof __ls_app.init === 'function') __ls_app.init();\n`;
          return code;
        }

        case 'FnNode': {
          const asyncPrefix = node.isAsync ? 'async ' : '';
          let code = `${this.pad()}${asyncPrefix}${node.name}(${node.params.join(', ')}) {\n`;
          this.indentLevel++;
          code += this.emitNodes(node.body);
          this.indentLevel--;
          code += `\n${this.pad()}}\n`;
          return code;
        }

        case 'ReturnNode':
          return `${this.pad()}return ${node.expression};`;

        case 'PrintNode':
          return `${this.pad()}console.log(${node.expression});`;

        case 'IfNode': {
          let code = `${this.pad()}if (${node.condition}) {\n`;
          this.indentLevel++;
          code += this.emitNodes(node.thenBody);
          this.indentLevel--;
          code += `\n${this.pad()}}`;

          node.elseIfs.forEach((elif) => {
            code += ` else if (${elif.condition}) {\n`;
            this.indentLevel++;
            code += this.emitNodes(elif.body);
            this.indentLevel--;
            code += `\n${this.pad()}}`;
          });

          if (node.elseBody && node.elseBody.length > 0) {
            code += ` else {\n`;
            this.indentLevel++;
            code += this.emitNodes(node.elseBody);
            this.indentLevel--;
            code += `\n${this.pad()}}`;
          }

          return code + '\n';
        }

        case 'WaitNode':
          return `${this.pad()}await new Promise(r => setTimeout(r, ${node.seconds * 1000}));`;

        case 'LoopNode': {
          let code = `${this.pad()}setInterval(async () => {\n`;
          this.indentLevel++;
          code += this.emitNodes(node.body);
          this.indentLevel--;
          code += `\n${this.pad()}}, ${node.seconds * 1000});`;
          return code;
        }

        case 'IdDeclNode':
          return `${this.pad()}this.el_${node.idName.replace(/-/g, '_')} = document.getElementById("${node.idName}");`;

        case 'EventHandlerNode': {
          const cleanTarget = node.target.replace(/^"|"$/g, '');
          const listenerTarget =
            node.targetType === 'id' ? `document.getElementById("${cleanTarget}")` : `window`;
          const eventName =
            node.targetType === 'id' ? 'click' : cleanTarget === 'lmb' ? 'mousedown' : 'keydown';

          let code = `${this.pad()}${listenerTarget}?.addEventListener("${eventName}", async (e) => {\n`;
          if (node.targetType === 'key') {
            if (cleanTarget.toLowerCase() === 'space') {
              code += `${this.pad()}  if (e.code !== "Space" && e.key !== " ") return;\n`;
            } else if (cleanTarget.toLowerCase() === 'lmb') {
              code += `${this.pad()}  if (e.button !== 0) return;\n`;
            } else {
              code += `${this.pad()}  if (e.key !== "${cleanTarget}" && e.code !== "${cleanTarget}") return;\n`;
            }
          }
          this.indentLevel++;
          code += this.emitNodes(node.body);
          this.indentLevel--;
          code += `\n${this.pad()}});`;
          return code;
        }

        case 'EffectNode':
          return `${this.pad()}applyEffect("${node.effect.replace(/^"|"$/g, '')}", "${node.target.replace(/^"|"$/g, '')}");`;

        case 'MovementNode':
          return `${this.pad()}moveEntityForward("${node.entity.replace(/^"|"$/g, '')}");`;

        case 'SenseNode': {
          const targetClean = typeof node.target === 'string' ? node.target.replace(/^"|"$/g, '') : node.target;
          let code = `${this.pad()}setupSense("${targetClean}", async () => {\n`;
          this.indentLevel++;
          code += this.emitNodes(node.body);
          this.indentLevel--;
          code += `\n${this.pad()}});`;
          return code;
        }

        case 'RelationNode': {
          let code = `${this.pad()}setRelation("${node.subject.replace(/^"|"$/g, '')}", "${node.relation}", "${node.object.replace(/^"|"$/g, '')}", async () => {\n`;
          this.indentLevel++;
          code += this.emitNodes(node.body);
          this.indentLevel--;
          code += `\n${this.pad()}});`;
          return code;
        }

        default:
          return '';
      }
    }
  }

  // --- 3. COMPILER API & HOST STUBS ---
  function compile(lsSource) {
    const parser = new Parser(lsSource);
    const ast = parser.parse();

    if (parser.errors.length > 0) {
      return { js: '', errors: parser.errors };
    }

    const emitter = new CodeEmitter();
    const js = emitter.emitNodes(ast);

    return {
      js: `// Generated by Langscript v0.1.1 Browser Compiler\n\n${js}`,
      errors: [],
    };
  }

  function run(lsSource) {
    const result = compile(lsSource);
    if (result.errors.length > 0) {
      result.errors.forEach((e) => console.error(`❌ [Langscript Line ${e.line}] ${e.message}`));
      return;
    }
    try {
      const fn = new Function(result.js);
      fn();
    } catch (err) {
      console.error('❌ Langscript Runtime Error:', err);
    }
  }

  // Browser Host Stubs
  window.applyEffect = function (effect, target) {
    console.log(`[Host Stub] Applying effect "${effect}" to target "${target}"`);
  };
  window.moveEntityForward = function (entity) {
    console.log(`[Host Stub] Moving entity "${entity}" forward`);
  };
  window.setupSense = function (target, callback) {
    console.log(`[Host Stub] Initialized browser sense watcher for: "${target}"`);
    setTimeout(() => callback(), 100);
  };
  window.setRelation = function (subject, relation, object, callback) {
    console.log(`[Host Stub] Browser relation watcher: "${subject}" is ${relation} "${object}"`);
    setTimeout(() => callback(), 200);
  };

  // Expose Global API
  window.Langscript = { compile, run };

  // --- 4. AUTO-LOADER (<script type="text/langscript">) ---
  async function bootLangscriptScripts() {
    const scripts = document.querySelectorAll('script[type="text/langscript"]');
    for (const script of scripts) {
      const src = script.getAttribute('src');
      if (src) {
        try {
          const response = await fetch(src);
          const source = await response.text();
          run(source);
        } catch (err) {
          console.error(`❌ Failed to load Langscript file from "${src}":`, err);
        }
      } else {
        run(script.textContent);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootLangscriptScripts);
  } else {
    bootLangscriptScripts();
  }
})();
