// 把小工具（~/apps/stardew-cheat）里的数据生成静态页 codes.html
// 用法：node build.mjs
// 数据来源只有一个：../apps/stardew-cheat/{items,sprites,codes}.js，小工具改了重跑本脚本即可。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '../../apps/stardew-cheat');
const read = (f) => readFileSync(resolve(APP, f), 'utf8');

function grab(src, name) {
  const m = src.match(new RegExp('export const ' + name + ' = ([\\s\\S]*?);\\n'));
  if (!m) throw new Error('找不到导出 ' + name);
  return JSON.parse(m[1]);
}

const CATEGORIES = grab(read('items.js'), 'CATEGORIES');
const ITEMS = grab(read('items.js'), 'ITEMS');
const SPRITES = grab(read('sprites.js'), 'SPRITES');
const CODE_GROUPS = grab(read('codes.js'), 'CODE_GROUPS');

const codeTotal = CODE_GROUPS.reduce((n, g) => n + g.items.length, 0);
console.log('items', ITEMS.length, 'sprites', Object.keys(SPRITES).length, 'code groups', CODE_GROUPS.length, 'codes', codeTotal);

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#3E8E5A">
<title>星露谷物品代码与作弊码</title>
<style>
:root{
  --paper:#f2f2f7;--surface:#fff;--ink:#1c1c1e;--muted:#8a8a8e;
  --hairline:rgba(60,60,67,.12);--accent:#3e8e5a;--accent-ink:#fff;
  --fill:rgba(120,120,128,.09);--code-bg:rgba(62,142,90,.12);--code-ink:#2f7d4f;
  --warn-bg:rgba(217,83,79,.12);--warn-ink:#b3403c;
  --mono:ui-monospace,"SF Mono",Menlo,monospace;
  --rounded:ui-rounded,"SF Pro Rounded",-apple-system,system-ui,sans-serif;
  --sans:-apple-system,system-ui,"PingFang SC",sans-serif;
  color-scheme:light dark;
}
@media (prefers-color-scheme:dark){
  :root{--paper:#000;--surface:#1c1c1e;--ink:#f2f2f7;--muted:#8d8d93;
    --hairline:rgba(235,235,245,.12);--accent:#4fbf7b;--accent-ink:#06210f;
    --fill:rgba(120,120,128,.2);--code-bg:rgba(79,191,123,.16);--code-ink:#6fd79a;
    --warn-bg:rgba(217,83,79,.2);--warn-ink:#ff9a96;}
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans)}
button{font:inherit;color:inherit;border:0;background:none;padding:0;text-align:left;cursor:pointer}
.wrap{max-width:760px;margin:0 auto;padding:0 0 calc(28px + env(safe-area-inset-bottom))}
header{position:sticky;top:0;z-index:10;padding:calc(8px + env(safe-area-inset-top)) 14px 8px;
  background:color-mix(in srgb,var(--paper) 92%,transparent);
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-bottom:1px solid var(--hairline)}
.brand{font-family:var(--rounded);font-weight:700;font-size:16px;padding:2px 2px 8px;display:flex;align-items:baseline;gap:8px}
.brand small{font-weight:400;font-size:11.5px;color:var(--muted)}
.tabs{display:flex;gap:3px;padding:3px;background:var(--fill);border-radius:12px}
.tab{flex:1;min-height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;
  font-family:var(--rounded);font-size:14px;font-weight:500}
.tab.on{background:var(--surface);box-shadow:0 1px 2px rgba(0,0,0,.08);font-weight:600}
.search{position:relative;margin-top:10px}
.search input{width:100%;height:42px;padding:0 38px 0 38px;border-radius:13px;border:1px solid var(--hairline);
  background:var(--surface);color:var(--ink);font-size:16px;font-family:inherit;-webkit-appearance:none;appearance:none}
.search input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent)}
.search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--muted)}
.chips{display:flex;gap:6px;overflow-x:auto;padding:9px 0 3px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.chips::-webkit-scrollbar{display:none}
.chip{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 11px;border-radius:99px;
  background:var(--surface);border:1px solid var(--hairline);font-family:var(--rounded);font-size:13px}
.chip.on{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600}
.chip b{font-family:var(--mono);font-size:10.5px;font-weight:400;color:var(--muted)}
.chip.on b{color:color-mix(in srgb,var(--accent-ink) 72%,transparent)}
main{padding:10px 14px}
.summary{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 4px 8px;font-size:12.5px;color:var(--muted)}
.sortwrap{display:flex;gap:6px;align-items:center}
.sortbtn,.dirbtn{height:28px;padding:0 10px;border-radius:9px;border:1px solid var(--hairline);background:var(--surface);font-size:12px}
.targetbar{display:flex;align-items:center;gap:8px;padding:0 4px 10px}
.targetbar-label{font-size:12px;color:var(--muted);flex:0 0 auto}
.seg{display:inline-flex;flex:1;padding:3px;gap:3px;border-radius:12px;background:var(--fill)}
.seg-btn{flex:1;min-height:32px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;gap:4px;
  font-family:var(--rounded);font-size:12px;white-space:nowrap}
.seg-btn code{font-family:var(--mono);font-size:10px;color:var(--muted)}
.seg-btn.on{background:var(--surface);box-shadow:0 1px 2px rgba(0,0,0,.08);font-weight:600}
.seg-btn.on code{color:var(--code-ink)}
.group-title{display:flex;align-items:baseline;gap:6px;font-family:var(--rounded);font-size:13px;color:var(--muted);
  margin:14px 4px 6px;font-weight:600}
.group-title b{font-family:var(--mono);font-size:11px;font-weight:400}
ul.items{list-style:none;margin:0;padding:0;background:var(--surface);border-radius:16px;overflow:hidden;
  box-shadow:0 1px 2px rgba(0,0,0,.05)}
ul.items li+li>*{border-top:1px solid var(--hairline)}
.row{width:100%;display:flex;align-items:center;gap:12px;padding:10px 14px;min-height:56px}
.row:active{background:var(--fill)}
.thumb{width:40px;height:40px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;
  background:var(--fill);border-radius:10px}
.thumb img{width:34px;height:34px;object-fit:contain;image-rendering:pixelated}
.row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.zh{font-family:var(--rounded);font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.en{font-size:11.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.code{font-family:var(--mono);font-size:12px;color:var(--code-ink);background:var(--code-bg);padding:4px 8px;
  border-radius:7px;white-space:nowrap;font-variant-numeric:tabular-nums}
.more{width:100%;min-height:46px;margin:14px 0 4px;border-radius:14px;background:var(--surface);
  border:1px solid var(--hairline);display:flex;align-items:center;justify-content:center;gap:8px;font-family:var(--rounded);font-size:14px}
.more span{font-size:12px;color:var(--muted)}
.empty{margin:26px 0;text-align:center;color:var(--muted);font-size:13.5px}
.done{margin:16px 0 4px;text-align:center;color:var(--muted);font-size:12px}
.code-row{display:flex;flex-direction:column;gap:3px;width:100%;padding:11px 14px}
.code-row.warn{background:var(--warn-bg)}
.cmdline{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
.cmd{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--code-ink)}
.code-row.warn .cmd{color:var(--warn-ink)}
.badge{font-size:10px;padding:1px 6px;border-radius:99px;font-family:var(--rounded)}
.badge.warn{background:rgba(217,83,79,.16);color:var(--warn-ink)}
.badge.stale{background:var(--fill);color:var(--muted)}
.code-meta{font-size:11.5px;color:var(--muted)}
.meta-en{opacity:.75}
.note{margin:2px 0 0;font-size:12px;line-height:1.5;color:var(--ink);white-space:pre-line}
.note code{font-family:var(--mono);font-size:11px;background:var(--code-bg);color:var(--code-ink);padding:1px 4px;border-radius:4px}
.note b{font-weight:600}
.toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);
  max-width:86vw;padding:9px 16px;border-radius:99px;background:rgba(28,28,30,.93);color:#fff;font-size:13px;
  z-index:50;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hint{display:none}
</style>
</head>
<body>
<div class="wrap">
<header>
  <div class="brand">星露谷物品码 <small>物品 ${ITEMS.length} · 作弊码 ${codeTotal}</small></div>
  <div class="tabs" role="tablist">
    <button class="tab on" role="tab" data-tab="items">物品</button>
    <button class="tab" role="tab" data-tab="codes">作弊码</button>
  </div>
  <div class="search">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 16.5 21 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <input id="q" type="search" placeholder="搜中文 / 英文 / 物品 ID" aria-label="搜索">
  </div>
  <div class="chips" id="chips"></div>
</header>
<main id="main"></main>
</div>
<div class="toast" id="toast" style="display:none"></div>
<script>
const ITEMS = ${JSON.stringify(ITEMS)};
const SPRITES = ${JSON.stringify(SPRITES)};
const CATEGORIES = ${JSON.stringify(CATEGORIES)};
const CODE_GROUPS = ${JSON.stringify(CODE_GROUPS)};

const PAGE = 200;
const SORTS = [['default','默认'],['zh','中文'],['en','英文'],['id','ID']];
const zhColl = new Intl.Collator('zh-Hans', { sensitivity: 'base' });
const enColl = new Intl.Collator('en', { sensitivity: 'base' });

const state = { tab:'items', q:'', cat:'all', ccat:'all', sort:'default', dir:'asc', limit:PAGE,
  target: (function(){ try { return localStorage.getItem('sdv-copy-target-v1') === 'pc' ? 'pc' : 'mobile'; } catch(e){ return 'mobile'; } })() };

const $ = (s) => document.querySelector(s);
const main = $('#main');
const chipsEl = $('#chips');

function fmt(n){ return n.toLocaleString('en-US'); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function pcOf(cmd){ return 'debug ' + String(cmd || '').replace(/^\\s*\\/\\s*/, ''); }
function cmdText(base){ return state.target === 'pc' ? pcOf(base) : base; }

function noteForTarget(text, target){
  if (target !== 'pc') return text;
  return String(text || '')
    .replace(/\`\\/\\s*/g, '\`debug ')
    .replace(/(也可写作\\s*)\\/\\s*/g, '$1debug ')
    .replace(/(例：)\\s*\\/\\s*/g, '$1debug ')
    .replace(/(；)\\s*\\/\\s*/g, '$1debug ');
}

function noteHTML(text){
  // 轻量 markdown：**粗体** 与 \`行内代码\`
  let out = '';
  for (const rawLine of String(text || '').split('\\n')) {
    let line = esc(rawLine);
    line = line.replace(/\\*\\*([^*]+)\\*\\*/g, '<b>$1</b>');
    line = line.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
    out += (out ? '\\n' : '') + line;
  }
  return out;
}

function itemList(){
  const q = state.q.trim().toLowerCase();
  let list = ITEMS;
  if (q || state.cat !== 'all') {
    list = ITEMS.filter(it => {
      if (state.cat !== 'all' && it.cat !== state.cat) return false;
      if (!q) return true;
      return (it.id + ' ' + it.zh + ' ' + (it.en||'') + ' ' + (it.zs||'') + ' ' + (it.es||'')).toLowerCase().includes(q);
    });
  }
  list = list.slice();
  if (state.sort !== 'default') {
    const pick = (it) => state.sort === 'zh' ? (it.zs || it.zh || '') : state.sort === 'en' ? (it.es || it.en || '') : '';
    list.sort((a, b) => {
      if (state.sort === 'id') {
        const na = /^\\d+$/.test(a.id), nb = /^\\d+$/.test(b.id);
        if (na !== nb) return na ? -1 : 1;
        if (na) return Number(a.id) - Number(b.id);
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      }
      return (pick(a) ? (state.sort === 'zh' ? zhColl : enColl).compare(pick(a), pick(b)) : 1) ||
             (state.sort === 'zh' ? zhColl : enColl).compare(pick(b), pick(a));
    });
    if (state.dir === 'desc') list.reverse();
  }
  return list;
}

function codeList(){
  const q = state.q.trim().toLowerCase();
  return CODE_GROUPS
    .filter(g => state.ccat === 'all' || g.parent === state.ccat)
    .map(g => ({ ...g, list: g.items.filter(c => {
      if (!q) return true;
      return (c.cmd + ' ' + c.zh + ' ' + (c.en||'') + ' ' + (c.note||'')).toLowerCase().includes(q);
    }) }))
    .filter(g => g.list.length);
}

function renderChips(){
  const counts = {};
  for (const it of ITEMS) counts[it.cat] = (counts[it.cat] || 0) + 1;
  if (state.tab === 'items') {
    chipsEl.innerHTML = [{id:'all', zh:'全部', n: ITEMS.length}, ...CATEGORIES].map(c =>
      '<button class="chip' + (state.cat === c.id ? ' on' : '') + '" data-cat="' + c.id + '">' + esc(c.zh) + ' <b>' + fmt(c.n || counts[c.id] || 0) + '</b></button>'
    ).join('');
  } else {
    const parents = [];
    for (const g of CODE_GROUPS) {
      const p = g.parent || '其他';
      const found = parents.find(x => x.id === p);
      if (found) found.n += g.items.length;
      else parents.push({ id: p, zh: p, n: g.items.length });
    }
    const total = CODE_GROUPS.reduce((n, g) => n + g.items.length, 0);
    chipsEl.innerHTML = [{id:'all', zh:'全部', n: total}, ...parents].map(p =>
      '<button class="chip' + (state.ccat === p.id ? ' on' : '') + '" data-ccat="' + esc(p.id) + '">' + esc(p.zh) + ' <b>' + fmt(p.n) + '</b></button>'
    ).join('');
  }
}

function render(){
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  $('.search input').placeholder = state.tab === 'items' ? '搜中文 / 英文 / 物品 ID' : '搜命令 / 中文 / 说明';
  renderChips();
  const targetBar =
    '<div class="targetbar"><span class="targetbar-label">复制为</span><div class="seg">' +
    '<button class="seg-btn' + (state.target === 'mobile' ? ' on' : '') + '" data-target="mobile">手机版 <code>/ i 97</code></button>' +
    '<button class="seg-btn' + (state.target === 'pc' ? ' on' : '') + '" data-target="pc">电脑版 <code>debug i 97</code></button>' +
    '</div></div>';

  if (state.tab === 'items') {
    const list = itemList();
    const shown = list.slice(0, state.limit);
    const rest = list.length - shown.length;
    const sortBar = '<div class="sortwrap">' +
      SORTS.map(s => '<button class="sortbtn' + (state.sort === s[0] ? ' on' : '') + '" data-sort="' + s[0] + '">' + s[1] + '</button>').join('') +
      '<button class="dirbtn" data-dir="1">' + (state.dir === 'asc' ? '↑ 升序' : '↓ 降序') + '</button></div>';
    main.innerHTML =
      '<div class="summary"><span>' + (state.q || state.cat !== 'all' ? fmt(list.length) + ' 条结果' : '全部 ' + fmt(ITEMS.length) + ' 条') + '</span>' + sortBar + '</div>' +
      targetBar +
      (shown.length === 0 ? '<p class="empty">没有匹配的物品，换个关键词试试</p>' :
        '<ul class="items">' + shown.map(it => {
          const cmd = state.target === 'pc' ? 'debug i ' + it.id : '/ i ' + it.id;
          return '<li><button class="row" data-copy="' + esc(cmd) + '" aria-label="复制 ' + esc(it.zh) + '">' +
            '<span class="thumb"><img loading="lazy" decoding="async" src="' + (SPRITES[it.id] || '') + '" alt=""></span>' +
            '<span class="row-main"><span class="zh">' + esc(it.zh) + '</span><span class="en">' + esc(it.en || '—') + '</span></span>' +
            '<span class="code">' + esc(it.id) + '</span></button></li>';
        }).join('') + '</ul>') +
      (rest > 0 ? '<button class="more" data-more="1">加载更多 <span>还有 ' + fmt(rest) + ' 条</span></button>'
                : shown.length ? '<p class="done">已经到底了</p>' : '');
  } else {
    const groups = codeList();
    const total = groups.reduce((n, g) => n + g.list.length, 0);
    main.innerHTML =
      '<div class="summary"><span>' + (state.q || state.ccat !== 'all' ? fmt(total) + ' 条命令' : '共 ' + fmt(total) + ' 条命令') + '</span></div>' +
      targetBar +
      (groups.length === 0 ? '<p class="empty">没有匹配的命令，换个筛选试试</p>' :
        groups.map(g => '<div class="group-title">' + esc(g.zh) + ' <b>' + g.list.length + '</b></div>' +
          '<ul class="items">' + g.list.map(c => {
            const cmd = state.target === 'pc' ? pcOf(c.cmd) : c.cmd;
            return '<li><button class="code-row' + (c.warn ? ' warn' : '') + (c.stale ? ' stale' : '') + '" data-copy="' + esc(cmd) + '">' +
              '<span class="cmdline"><span class="cmd">' + esc(cmd) + '</span>' +
              (c.warn ? '<span class="badge warn">危险</span>' : '') +
              (c.stale ? '<span class="badge stale">过时</span>' : '') + '</span>' +
              '<span class="code-meta">' + esc(c.zh || '') + (c.en ? '<span class="meta-en"> · ' + esc(c.en) + '</span>' : '') + '</span>' +
              (c.note ? '<p class="note">' + noteHTML(noteForTarget(c.note, state.target)) + '</p>' : '') + '</button></li>';
          }).join('') + '</ul>').join(''));
  }
}

async function copyText(text){
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.setAttribute('readonly','');
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}

let toastTimer = 0;
function showToast(msg){
  const t = $('#toast');
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.display = 'none'; }, 1800);
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-tab],[data-cat],[data-ccat],[data-sort],[data-dir],[data-target],[data-copy],[data-more]');
  if (!el) return;
  if (el.dataset.tab) { state.tab = el.dataset.tab; state.q = ''; state.cat = 'all'; state.ccat = 'all'; state.limit = PAGE; $('#q').value = ''; render(); return; }
  if (el.dataset.cat) { state.cat = el.dataset.cat; state.limit = PAGE; render(); return; }
  if (el.dataset.ccat) { state.ccat = el.dataset.ccat; render(); return; }
  if (el.dataset.sort) { state.sort = el.dataset.sort; state.limit = PAGE; render(); return; }
  if (el.dataset.dir) { state.dir = state.dir === 'asc' ? 'desc' : 'asc'; render(); return; }
  if (el.dataset.target) { state.target = el.dataset.target; try { localStorage.setItem('sdv-copy-target-v1', state.target); } catch (err) {} render(); return; }
  if (el.dataset.more) { state.limit += PAGE; render(); return; }
  if (el.dataset.copy) {
    const cmd = el.dataset.copy;
    const ok = await copyText(cmd);
    showToast(ok ? '已复制 ' + cmd : '复制失败，请长按选中：' + cmd);
  }
});

let typing = 0;
$('#q').addEventListener('input', (e) => {
  const v = e.target.value;
  clearTimeout(typing);
  typing = setTimeout(() => { state.q = v; state.limit = PAGE; render(); }, 60);
});

render();
</script>
</body>
</html>
`;

writeFileSync(resolve(here, 'codes.html'), html);
console.log('wrote codes.html', (html.length / 1024 / 1024).toFixed(2), 'MB');
