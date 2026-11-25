const cppInput = document.getElementById("cppInput");
const jsOutput = document.getElementById("jsOutput");
const errorBox = document.getElementById("errorBox");
const convertBtn = document.getElementById("convertBtn");

const cppLines = document.getElementById("cppLines");
const jsLines = document.getElementById("jsLines");

function updateLineNumbers(textarea, linesBox) {
  const count = textarea.value.split("\n").length;
  let numbers = "";
  for (let i = 1; i <= count; i++) {
    numbers += i + "\n";
  }
  linesBox.textContent = numbers;
}

cppInput.addEventListener("input", () => updateLineNumbers(cppInput, cppLines));

cppInput.addEventListener("scroll", () => {
  cppLines.scrollTop = cppInput.scrollTop;
});
jsOutput.addEventListener("scroll", () => {
  jsLines.scrollTop = jsOutput.scrollTop;
});

convertBtn.addEventListener("click", convertCode);

function mapOutsideQuotes(str, fn) {
  let result = "";
  let segment = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (!inQuotes && (ch === '"' || ch === "'")) {
      result += fn(segment);
      segment = ch;
      inQuotes = true;
      quoteChar = ch;
    } else if (inQuotes && ch === quoteChar && str[i - 1] !== "\\") {
      segment += ch;
      result += segment;
      segment = "";
      inQuotes = false;
    } else {
      segment += ch;
    }
  }
  result += inQuotes ? segment : fn(segment);
  return result;
}

function splitOutsideQuotes(str, sep) {
  const parts = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (!inQuotes && (ch === '"' || ch === "'")) {
      inQuotes = true;
      quoteChar = ch;
      current += ch;
    } else if (inQuotes && ch === quoteChar && str[i - 1] !== "\\") {
      inQuotes = false;
      current += ch;
    } else if (!inQuotes && str.slice(i, i + sep.length) === sep) {
      parts.push(current.trim());
      current = "";
      i += sep.length - 1;
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") parts.push(current.trim());
  return parts;
}

function fixOperators(line) {
  return mapOutsideQuotes(line, (seg) =>
    seg.replace(/\bstd::/g, "").replace(/==/g, "===").replace(/!=/g, "!==")
  );
}

function convertCode() {
  const sourceCode = cppInput.value;

  const errors = checkErrors(sourceCode);
  if (errors.length > 0) {
    errorBox.style.display = "block";
    errorBox.textContent = errors.join("\n");
    jsOutput.value = "";
    updateLineNumbers(jsOutput, jsLines);
    return;
  }

  errorBox.style.display = "none";

  const lines = sourceCode.replace(/\r/g, "").split("\n");
  const result = [];
  const varTypes = {};
  let openBraces = 0;
  let insideMain = false;
  let waitingMainBrace = false;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const processed = preprocessLine(lines[i], inBlockComment);
    inBlockComment = processed.inBlockComment;

    let line = processed.codeLine;
    if (line === "" || line.startsWith("#include") || line.startsWith("using namespace")) {
      continue;
    }

    line = fixOperators(line);

    if (/^(int|void)\s+main\s*\(\s*\)\s*\{?$/.test(line)) {
      insideMain = true;
      if (line.endsWith("{")) {
        openBraces++;
      } else {
        waitingMainBrace = true;
      }
      continue;
    }

    if (waitingMainBrace && line === "{") {
      waitingMainBrace = false;
      openBraces++;
      continue;
    }

    if (insideMain && /^return\b/.test(line)) {
      continue;
    }

    const baseIndent = Math.max(0, openBraces - (insideMain ? 1 : 0));
    const pad = "  ".repeat(line.startsWith("}") ? Math.max(0, baseIndent - 1) : baseIndent);

    const clean = processed.cleanLine;
    for (let j = 0; j < clean.length; j++) {
      if (clean[j] === "{") openBraces++;
      if (clean[j] === "}") openBraces--;
    }

    if (line === "}" && insideMain && openBraces === 0) {
      insideMain = false;
      continue;
    }

    if (/^cout\b/.test(line)) {
      const content = line.replace(/^cout\b/, "").replace(/;\s*$/, "").trim();
      const parts = splitOutsideQuotes(content, "<<").filter((p) => p !== "" && p !== "endl");
      result.push(`${pad}console.log(${parts.length ? parts.join(", ") : '""'});`);
      continue;
    }

    if (/^cin\b/.test(line)) {
      const content = line.replace(/^cin\b/, "").replace(/;\s*$/, "").trim();
      const vars = splitOutsideQuotes(content, ">>");
      for (let v = 0; v < vars.length; v++) {
        const varName = vars[v];
        if (varTypes[varName] === "string" || varTypes[varName] === "char") {
          result.push(`${pad}${varName} = prompt("Enter ${varName}:");`);
        } else {
          result.push(`${pad}${varName} = Number(prompt("Enter ${varName}:"));`);
        }
      }
      continue;
    }

    if (/^for\b/.test(line)) {
      result.push(`${pad}${line.replace(/\b(int|float|double)\b/, "let")}`);
      continue;
    }

    const declMatch = line.match(/^(const\s+)?(int|float|double|string|bool|char)\s+(.+);$/);
    if (declMatch) {
      const isConst = Boolean(declMatch[1]);
      const type = declMatch[2];
      const items = splitTopLevelCommas(declMatch[3]);
      for (let k = 0; k < items.length; k++) {
        const name = items[k].split("=")[0].trim();
        varTypes[name] = type;
      }
      const jsKeyword = isConst ? "const" : "let";
      result.push(`${pad}${jsKeyword} ${declMatch[3]};`);
      continue;
    }

    result.push(`${pad}${line}`);
  }

  jsOutput.value = result.join("\n");
  updateLineNumbers(jsOutput, jsLines);
}

updateLineNumbers(cppInput, cppLines);
convertCode();