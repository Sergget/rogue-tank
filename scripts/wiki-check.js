// scripts/wiki-check.js — specs wiki 链接与结构校验（docs/** 的 Markdown）
//
// 用法：
//   node scripts/wiki-check.js            # 全 docs 树校验，失败 exit 1
//   node scripts/wiki-check.js --quiet    # 只打印汇总
//   node scripts/wiki-check.js --json     # 机器可读
//
// 检查项（对应 docs/WIKI-STYLE.md §8 的可自动化部分）：
//   1. 断链：`](./x.md)` / `](../y.md)` 目标文件必须存在
//   2. 失效锚点：`page.md#anchor` 的锚点在目标页有对应标题（GitHub slug 规则）
//   3. 兼容索引页结构：docs/specs/<vol>.md 必须含固定警告块与「详见」链接
//   4. wiki 页模板：docs/specs/<vol>/*.md 必须有 摘要/适用版本/源自/相关 四行 + `## 相关页面`
//
// 已知豁免：
//   · docs/WIKI-STYLE.md —— 全文是格式示例（其 §3.1 已声明「本文所有链接都是格式示意」）
//   · docs/archive/** —— 归档只增不改，历史相对路径问题不修；但会单独统计并在 --json 里报
//
// 与 npm test 的关系：本脚本**不入** run-tests.js（它检查文档，不是代码回归），
// 由 AGENTS.md §3.1/§2.3 要求在「改过 docs 后」手动跑。CI 可另接。

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const SPECS = path.join(DOCS, 'specs');
const VOLUMES = ['combat', 'map', 'cards', 'boss', 'editor'];

const argv = process.argv.slice(2);
const QUIET = argv.includes('--quiet');
const JSON_OUT = argv.includes('--json');

// ---------- GitHub slug（实测标定 2026-10-21） ----------
// 1) 小写  2) 去 HTML 标签  3) 去 emoji/ZWJ/VS16  4) 去反引号与各类引号
// 5) 去其余标点（保留 Unicode 字母/数字/空格/连字符/下划线）  6) 空格 → 连字符
function slug(raw) {
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/[\u200d\ufe0f\u20e3]/g, '');
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
  s = s.replace(/[`'"“”‘’]/g, '');
  s = s.replace(/[^\p{L}\p{N}\s_-]/gu, '');
  s = s.replace(/\s+/g, '-');
  return s;
}

function walkMd(dir, out) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// ---------- 建立 slug 表 ----------
const files = walkMd(DOCS, []);
const slugTable = new Map();
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8');
  const set = new Set();
  let inFence = false;
  for (const line of txt.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(/^#{1,6}\s+(.*)$/);
    if (m) set.add(slug(m[1]));
  }
  slugTable.set(path.resolve(f), set);
}

// ---------- 链接与锚点 ----------
const problems = [];
const archiveProblems = [];
let linkTotal = 0, anchorTotal = 0;

const ARCHIVE_PREFIX = path.resolve(DOCS, 'archive') + path.sep;
const TEMPLATE_FILE = path.resolve(DOCS, 'WIKI-STYLE.md');

for (const f of files) {
  const abs = path.resolve(f);
  const isTemplate = abs === TEMPLATE_FILE;
  const isArchive = abs.startsWith(ARCHIVE_PREFIX);
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    // 跳过行内代码（文档中 `[text](path#anchor)` 这类格式示例）
    const stripped = line.replace(/`[^`]*`/g, '');
    const re = /\[[^\]]*\]\(([^)\s]+)\)/g;
    let m;
    while ((m = re.exec(stripped))) {
      const target = m[1];
      if (/^(https?:|mailto:|tel:)/.test(target)) continue;
      if (isTemplate) continue;                    // 模板文件整体豁免
      linkTotal++;
      const [p, hash] = target.split('#');
      const resolved = p ? path.resolve(path.dirname(f), p) : abs;
      const rel = path.relative(ROOT, f) + ':' + (i + 1);
      if (p && !fs.existsSync(resolved)) {
        (isArchive ? archiveProblems : problems).push(`BROKEN  ${rel} -> ${target}`);
        continue;
      }
      if (hash) {
        anchorTotal++;
        const want = decodeURIComponent(hash).toLowerCase();
        const set = slugTable.get(resolved);
        if (set && !set.has(want)) {
          (isArchive ? archiveProblems : problems).push(`ANCHOR  ${rel} -> ${target}`);
        }
      }
    }
  }
}

// ---------- 兼容索引页结构 ----------
// <vol>.md 必须：① 含「兼容索引」或「§N 兼容层」警告块 ② 每节有「详见」链接
const structProblems = [];
for (const vol of VOLUMES) {
  const compat = path.join(SPECS, vol + '.md');
  if (!fs.existsSync(compat)) { structProblems.push(`MISSING compat index: docs/specs/${vol}.md`); continue; }
  const txt = fs.readFileSync(compat, 'utf8');
  if (!/兼容索引|§N 兼容层/.test(txt)) {
    structProblems.push(`NO-BANNER docs/specs/${vol}.md —— 缺「兼容索引」警告块`);
  }
  const h2 = (txt.match(/^## \d+\./gm) || []).length;
  const see = (txt.match(/\*\*详见\*\*/g) || []).length;
  // §0 主题索引按惯例不设「详见」，故允许 see >= h2-1
  if (h2 > 1 && see < h2 - 1) {
    structProblems.push(`FEW-SEE docs/specs/${vol}.md —— ${h2} 个编号节但只有 ${see} 个「详见」`);
  }
}

// ---------- wiki 页模板 ----------
const tplProblems = [];
let pageCount = 0;
for (const vol of VOLUMES) {
  const dir = path.join(SPECS, vol);
  if (!fs.existsSync(dir)) { tplProblems.push(`MISSING wiki dir: docs/specs/${vol}/`); continue; }
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    pageCount++;
    const p = path.join(dir, name);
    const txt = fs.readFileSync(p, 'utf8');
    const rel = `docs/specs/${vol}/${name}`;
    if (!/\*\*摘要\*\*/.test(txt)) tplProblems.push(`NO-SUMMARY  ${rel}`);
    if (!/\*\*适用版本\*\*/.test(txt)) tplProblems.push(`NO-VERSION  ${rel}`);
    if (!/\*\*源自\*\*/.test(txt)) tplProblems.push(`NO-SOURCE   ${rel}`);
    if (!/## 相关页面/.test(txt)) tplProblems.push(`NO-RELATED  ${rel}`);
    if (!/^# /m.test(txt)) tplProblems.push(`NO-TITLE    ${rel}`);
  }
}

// ---------- 输出 ----------
const summary = {
  files: files.length,
  wikiPages: pageCount,
  links: linkTotal,
  anchors: anchorTotal,
  broken: problems.filter(p => p.startsWith('BROKEN')).length,
  anchorBad: problems.filter(p => p.startsWith('ANCHOR')).length,
  structProblems: structProblems.length,
  templateProblems: tplProblems.length,
  archiveProblems: archiveProblems.length
};

if (JSON_OUT) {
  console.log(JSON.stringify({ summary, problems, structProblems, tplProblems, archiveProblems }, null, 2));
} else {
  if (!QUIET) {
    problems.forEach(p => console.log('  ' + p));
    structProblems.forEach(p => console.log('  ' + p));
    tplProblems.forEach(p => console.log('  ' + p));
    if (archiveProblems.length) {
      console.log('  --- 归档分卷（只增不改，不计入失败）---');
      archiveProblems.forEach(p => console.log('    ' + p));
    }
  }
  console.log(
    `wiki-check: files=${summary.files} pages=${summary.wikiPages} ` +
    `links=${summary.links} broken=${summary.broken} ` +
    `anchors=${summary.anchors} anchorBad=${summary.anchorBad} ` +
    `struct=${summary.structProblems} template=${summary.templateProblems} ` +
    `(archive, ignored: ${summary.archiveProblems})`
  );
  const failed = summary.broken + summary.anchorBad + summary.structProblems + summary.templateProblems;
  console.log(failed === 0 ? 'wiki-check: 全部通过' : `wiki-check: ${failed} 项失败`);
}

process.exitCode = (summary.broken + summary.anchorBad + summary.structProblems + summary.templateProblems) > 0 ? 1 : 0;
