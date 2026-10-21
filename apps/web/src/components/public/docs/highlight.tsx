/** Patterns are built with the RegExp constructor (named groups and lookbehind need ES2018, the
 *  project targets ES2017 for TypeScript; every browser we support runs them).
 *
 *  A deliberately tiny syntax highlighter for the snippets on /developers (bash, JSON, JavaScript,
 *  Python, HTTP). One regex per language with named groups, matched left to right; everything
 *  unmatched stays plain text. No dependency, no runtime cost beyond one pass per snippet. */
import * as React from "react";

export type Lang = "bash" | "json" | "js" | "py" | "http" | "text";

const RX: Record<Exclude<Lang, "text">, RegExp> = {
  json: new RegExp(String.raw`(?<key>"(?:\\.|[^"\\])*"(?=\s*:))|(?<str>"(?:\\.|[^"\\])*")|(?<num>-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\btrue\b|\bfalse\b|\bnull\b)|(?<punct>[{}[\],:])`, "g"),
  js: new RegExp(String.raw`(?<com>\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(?<str>\x60(?:\\.|[^\x60\\])*\x60|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(?<kw>\b(?:import|from|const|let|return|if|await|async|new|function|export|default|typeof|else)\b)|(?<num>\b\d+(?:\.\d+)?\b|\btrue\b|\bfalse\b|\bnull\b)|(?<fn>\b[A-Za-z_$][\w$]*(?=\())`, "g"),
  py: new RegExp(String.raw`(?<com>#[^\n]*)|(?<str>b?"(?:\\.|[^"\\\n])*"|b?'(?:\\.|[^'\\\n])*')|(?<kw>\b(?:import|from|def|return|if|not|and|or|as|None|True|False)\b)|(?<deco>@[\w.]+)|(?<num>\b\d+\b)|(?<fn>\b[A-Za-z_][\w]*(?=\())`, "g"),
  bash: new RegExp(String.raw`(?<com>(?:^|(?<=\s))#[^\n]*)|(?<str>"(?:\\.|[^"\\])*"|'[^']*')|(?<cmd>(?:^|(?<=\n))\s*curl\b)|(?<flag>(?<=\s)-{1,2}[A-Za-z][\w-]*)|(?<var>\$[A-Z_][A-Z0-9_]*)`, "g"),
  http: new RegExp(String.raw`(?<kw>^(?:GET|POST|PATCH|PUT|DELETE)\b|HTTP\/1\.1)|(?<key>(?<=^|\n)[A-Za-z][\w-]*(?=:\s))`, "gm"),
};

const CLS: Record<string, string> = {
  key: "text-[#8ec5ff]",
  str: "text-[#b9dba5]",
  num: "text-[#e9c47a]",
  punct: "text-[#9c9ca3]",
  com: "text-[#80828b] italic",
  kw: "text-[#c6a8ff]",
  fn: "text-[#f0f0f2]",
  deco: "text-[#e9c47a]",
  cmd: "text-[#e9c47a]",
  flag: "text-[#c6a8ff]",
  var: "text-[#8ec5ff]",
};

export function highlight(code: string, lang: Lang): React.ReactNode[] {
  if (lang === "text") return [code];
  const rx = new RegExp(RX[lang].source, RX[lang].flags);
  const out: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of code.matchAll(rx)) {
    const at = m.index ?? 0;
    if (at > last) out.push(code.slice(last, at));
    const kind = Object.entries(m.groups ?? {}).find(([, v]) => v !== undefined)?.[0];
    out.push(kind ? <span key={i++} className={CLS[kind]}>{m[0]}</span> : m[0]);
    last = at + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}
