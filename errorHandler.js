const CPP_KEYWORDS = new Set([
  "int", "float", "double", "string", "bool", "char", "void", "const",
  "if", "else", "for", "while", "do", "return", "break", "continue",
  "cout", "cin", "endl", "true", "false", "using", "namespace", "std", "main"
]);

const CPP_TYPES = new Set(["int", "float", "double", "string", "bool", "char"]);

function preprocessLine(rawLine, inBlockComment) {
  let codeLine = "";
  let cleanLine = "";
  let inQuotes = false;
  let quoteChar = "";
  let i = 0;

  while (i < rawLine.length) {
    const ch = rawLine[i];
    const next = rawLine[i + 1];

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (!inQuotes) {
      if (ch === "/" && next === "/") break;
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inQuotes = true;
        quoteChar = ch;
        codeLine += ch;
        cleanLine += ch;
        i++;
        continue;
      }
      codeLine += ch;
      cleanLine += ch;
      i++;
    } else {
      codeLine += ch;
      if (ch === "\\" && i + 1 < rawLine.length) {
        codeLine += rawLine[i + 1];
        i += 2;
        continue;
      }
      if (ch === quoteChar) {
        cleanLine += ch;
        inQuotes = false;
        quoteChar = "";
      }
      i++;
    }
  }

  return {
    codeLine: codeLine.trim(),
    cleanLine: cleanLine.trim(),
    inBlockComment,
    unclosedQuote: inQuotes ? quoteChar : null
  };
}

function findVar(scopes, name) {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i][name]) return scopes[i][name];
  }
  return null;
}

function checkUndeclaredVars(text, lineNum, scopes, errors) {
  const words = text.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!CPP_KEYWORDS.has(w) && !findVar(scopes, w)) {
      errors.push(`[Semantic Error] السطر ${lineNum}: المتغير '${w}' غير معرّف.`);
    }
  }
}

function checkDivisionByZero(text, lineNum, errors) {
  if (/(\/|%)\s*0(?!\.\d|\d)/.test(text)) {
    errors.push(`[Semantic Error] السطر ${lineNum}: خطأ رياضي (القسمة على صفر).`);
  }
}

function checkTypeMismatch(varType, valueExpr, lineNum, errors) {
  const val = valueExpr.trim();
  const isNumeric = varType === "int" || varType === "float" || varType === "double";

  if (isNumeric && (val.includes('""') || val.includes("''"))) {
    errors.push(`[Semantic Error] السطر ${lineNum}: لا يمكن إسناد نص لمتغير رقمي من نوع ${varType}.`);
  }
  if (varType === "string" && /^[-+]?\d+(\.\d+)?$/.test(val)) {
    errors.push(`[Semantic Error] السطر ${lineNum}: لا يمكن إسناد رقم لمتغير من نوع string بدون علامات تنصيص.`);
  }
  if (varType === "bool" && (val.includes('""') || val.includes("''"))) {
    errors.push(`[Semantic Error] السطر ${lineNum}: لا يمكن إسناد نص لمتغير منطقي من نوع bool.`);
  }
}

function extractParenContent(line) {
  const start = line.indexOf("(");
  const end = line.lastIndexOf(")");
  if (start === -1 || end === -1 || end < start) return null;
  return line.slice(start + 1, end).trim();
}

function splitTopLevelCommas(str) {
  const parts = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") parts.push(current.trim());
  return parts;
}

function checkErrors(sourceCode) {
  const lines = sourceCode.replace(/\r/g, "").split("\n");
  const errors = [];
  const scopes = [{}];
  let openBraces = 0;
  let inBlockComment = false;
  let blockCommentStart = 0;
  let pendingForScope = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const wasInComment = inBlockComment;
    const processed = preprocessLine(lines[i], inBlockComment);

    if (!wasInComment && processed.inBlockComment) blockCommentStart = lineNum;
    inBlockComment = processed.inBlockComment;

    if (processed.unclosedQuote) {
      errors.push(`[Lexical Error] السطر ${lineNum}: علامة تنصيص (${processed.unclosedQuote}) غير مغلقة.`);
      continue;
    }

    let clean = processed.cleanLine.replace(/\bstd::/g, "").trim();

    if (clean === "" || clean.startsWith("#include") || clean.startsWith("using namespace")) {
      continue;
    }

    if (/[@$`~]/.test(clean)) {
      errors.push(`[Lexical Error] السطر ${lineNum}: يحتوي على رمز غير مدعوم في C++.`);
      continue;
    }
    if (/\b\d+\.\d+\.\d+\b/.test(clean)) {
      errors.push(`[Lexical Error] السطر ${lineNum}: صيغة رقم عشري خاطئة.`);
    }
    if (/\b\d+[a-zA-Z_]+\b/.test(clean)) {
      errors.push(`[Lexical Error] السطر ${lineNum}: اسم المتغير أو الرقم لا يمكن أن يبدأ برقم متبوع بحروف.`);
    }

    const openParens = (clean.match(/\(/g) || []).length;
    const closeParens = (clean.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push(`[Syntax Error] السطر ${lineNum}: الأقواس ( ) غير متوازنة.`);
    }

    while (clean.startsWith("}")) {
      openBraces--;
      if (openBraces < 0) {
        errors.push(`[Syntax Error] السطر ${lineNum}: قوس إغلاق } زائد بدون قوس فتح.`);
        openBraces = 0;
      } else if (scopes.length > 1) {
        scopes.pop();
      }
      clean = clean.slice(1).trim();
    }

    if (clean === "") continue;

    if (clean === "{") {
      openBraces++;
      if (pendingForScope) pendingForScope = false;
      else scopes.push({});
      continue;
    }

    if (/^(int|void)\s+main\s*\(\s*\)\s*\{?$/.test(clean)) {
      if (clean.endsWith("{")) {
        openBraces++;
        scopes.push({});
      }
      continue;
    }

    const hasTrailingOpenBrace = clean.endsWith("{");
    const stmt = hasTrailingOpenBrace ? clean.slice(0, -1).trim() : clean;

    if (stmt.startsWith("if") || stmt.startsWith("else if") || stmt.startsWith("while")) {
      const cond = extractParenContent(stmt);
      if (cond === null) {
        errors.push(`[Syntax Error] السطر ${lineNum}: نسيت الأقواس () حول الشرط.`);
      } else if (cond === "") {
        errors.push(`[Syntax Error] السطر ${lineNum}: الشرط فارغ.`);
      } else {
        checkUndeclaredVars(cond, lineNum, scopes, errors);
        checkDivisionByZero(cond, lineNum, errors);
      }
      if (hasTrailingOpenBrace) {
        openBraces++;
        scopes.push({});
      }
      continue;
    }

    if (stmt === "else" || stmt === "do") {
      if (hasTrailingOpenBrace) {
        openBraces++;
        scopes.push({});
      }
      continue;
    }

    if (stmt.startsWith("for")) {
      const inside = extractParenContent(stmt);
      scopes.push({});
      if (hasTrailingOpenBrace) {
        openBraces++;
      } else {
        pendingForScope = true;
      }

      if (inside === null) {
        errors.push(`[Syntax Error] السطر ${lineNum}: نسيت الأقواس () لحلقة for.`);
        continue;
      }

      const parts = inside.split(";");
      if (parts.length !== 3) {
        errors.push(`[Syntax Error] السطر ${lineNum}: صيغة حلقة for خاطئة (يجب وجود فاصلتين منقوطتين ;).`);
        continue;
      }

      const initPart = parts[0].trim();
      const condPart = parts[1].trim();
      const updatePart = parts[2].trim();

      if (initPart !== "") {
        const forDecl = initPart.match(/^(int|float|double)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(=\s*(.+))?$/);
        if (forDecl) {
          if (forDecl[4]) checkUndeclaredVars(forDecl[4], lineNum, scopes, errors);
          scopes[scopes.length - 1][forDecl[2]] = { type: forDecl[1], isConst: false };
        } else {
          checkUndeclaredVars(initPart, lineNum, scopes, errors);
        }
      }
      if (condPart !== "") checkUndeclaredVars(condPart, lineNum, scopes, errors);
      if (updatePart !== "") checkUndeclaredVars(updatePart, lineNum, scopes, errors);
      continue;
    }

    if (!stmt.endsWith(";")) {
      errors.push(`[Syntax Error] السطر ${lineNum}: نسيت الفاصلة المنقوطة ; في نهاية السطر.`);
      continue;
    }

    if (/^cout\b/.test(stmt)) {
      if (stmt.includes(">>")) {
        errors.push(`[Syntax Error] السطر ${lineNum}: استخدم << مع cout وليس >>.`);
      } else if (!stmt.includes("<<")) {
        errors.push(`[Syntax Error] السطر ${lineNum}: نسيت معامل الطباعة << بعد cout.`);
      } else {
        const body = stmt.replace(/^cout\b/, "").replace(/;$/, "");
        checkUndeclaredVars(body, lineNum, scopes, errors);
        checkDivisionByZero(body, lineNum, errors);
      }
      continue;
    }

    if (/^cin\b/.test(stmt)) {
      if (stmt.includes("<<")) {
        errors.push(`[Syntax Error] السطر ${lineNum}: استخدم >> مع cin وليس <<.`);
      } else if (!stmt.includes(">>")) {
        errors.push(`[Syntax Error] السطر ${lineNum}: نسيت معامل القراءة >> بعد cin.`);
      } else {
        const targets = stmt.replace(/^cin\b/, "").replace(/;$/, "").split(">>").map((t) => t.trim());
        for (let t = 0; t < targets.length; t++) {
          if (!targets[t]) continue;
          const info = findVar(scopes, targets[t]);
          if (!info) {
            errors.push(`[Semantic Error] السطر ${lineNum}: لا يمكن القراءة داخل المتغير غير المعرّف '${targets[t]}'.`);
          } else if (info.isConst) {
            errors.push(`[Semantic Error] السطر ${lineNum}: لا يمكن القراءة داخل الثابت '${targets[t]}'.`);
          }
        }
      }
      continue;
    }

   
    const declMatch = stmt.match(/^(const\s+)?(int|float|double|string|bool|char)\s+(.+);$/);
    if (declMatch) {
      const isConst = Boolean(declMatch[1]);
      const varType = declMatch[2];
      const items = splitTopLevelCommas(declMatch[3]);

      for (let k = 0; k < items.length; k++) {
        const item = items[k];
        const eqIdx = item.indexOf("=");
        const varName = (eqIdx === -1 ? item : item.slice(0, eqIdx)).trim();
        const rhs = eqIdx === -1 ? null : item.slice(eqIdx + 1).trim();

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(varName)) {
          errors.push(`[Lexical Error] السطر ${lineNum}: اسم متغير غير صالح '${varName}'.`);
          continue;
        }
        if (CPP_KEYWORDS.has(varName)) {
          errors.push(`[Syntax Error] السطر ${lineNum}: لا يمكن استخدام الكلمة المحجوزة '${varName}' كاسم متغير.`);
          continue;
        }
        if (scopes[scopes.length - 1][varName]) {
          errors.push(`[Semantic Error] السطر ${lineNum}: المتغير '${varName}' معرّف مسبقاً.`);
          continue;
        }
        if (isConst && (rhs === null || rhs === "")) {
          errors.push(`[Semantic Error] السطر ${lineNum}: الثابت '${varName}' يجب إعطاؤه قيمة ابتدائية.`);
        }
        if (rhs !== null) {
          if (rhs === "" || /[+\-*/%=&|]$/.test(rhs)) {
            errors.push(`[Syntax Error] السطر ${lineNum}: قيمة أو عملية غير مكتملة للمتغير '${varName}'.`);
          } else {
            checkUndeclaredVars(rhs, lineNum, scopes, errors);
            checkDivisionByZero(rhs, lineNum, errors);
            checkTypeMismatch(varType, rhs, lineNum, errors);
          }
        }
        scopes[scopes.length - 1][varName] = { type: varType, isConst };
      }
      continue;
    }

 
    if (/^return\b/.test(stmt)) {
      const retVal = stmt.replace(/^return\b/, "").replace(/;$/, "").trim();
      if (retVal !== "") {
        checkUndeclaredVars(retVal, lineNum, scopes, errors);
        checkDivisionByZero(retVal, lineNum, errors);
      }
      continue;
    }

   
    const assignMatch = stmt.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+|-|\*|\/|%)?=(?!=)\s*(.*);$/);
    if (assignMatch) {
      const varName = assignMatch[1];
      const rhs = assignMatch[3].trim();
      const info = findVar(scopes, varName);

      if (!info) {
        errors.push(`[Semantic Error] السطر ${lineNum}: المتغير '${varName}' غير معرّف.`);
      } else if (info.isConst) {
        errors.push(`[Semantic Error] السطر ${lineNum}: لا يمكن تعديل قيمة الثابت '${varName}'.`);
      }

      if (rhs === "" || /[+\-*/%=&|]$/.test(rhs)) {
        errors.push(`[Syntax Error] السطر ${lineNum}: عملية غير مكتملة بعد علامة المساواة.`);
      } else {
        checkUndeclaredVars(rhs, lineNum, scopes, errors);
        checkDivisionByZero(rhs, lineNum, errors);
        if (info && !assignMatch[2]) checkTypeMismatch(info.type, rhs, lineNum, errors);
      }
      continue;
    }

    const incMatch = stmt.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(\+\+|--)\s*;$/);
    if (incMatch) {
      const info = findVar(scopes, incMatch[1]);
      if (!info) {
        errors.push(`[Semantic Error] السطر ${lineNum}: المتغير '${incMatch[1]}' غير معرّف.`);
      } else if (info.isConst) {
        errors.push(`[Semantic Error] السطر ${lineNum}: لا يمكن تعديل الثابت '${incMatch[1]}'.`);
      }
      continue;
    }

   
    errors.push(`[Syntax Error] السطر ${lineNum}: صيغة غير صحيحة أو جملة غير مدعومة.`);
  }

  if (inBlockComment) {
    errors.push(`[Lexical Error] السطر ${blockCommentStart}: تعليق متعدد الأسطر (/*) غير مغلق.`);
  }
  if (openBraces > 0) {
    errors.push(`[Syntax Error]: يوجد قوس فتح { لم يتم إغلاقه بنهاية الكود.`);
  }

  return errors;
}