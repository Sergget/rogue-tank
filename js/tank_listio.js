'use strict';

// tank_listio.js — 共享的坦克数据读写层（tanks/ 一型一文件）。
// 统一封装 dev server 的 /api/tanks 端点，供三个原型复用（此前三处各实现一份 fetch/save/fallback）：
//   fetchTankList(cb)       GET  /api/tanks            → cb(list) 或 cb(null)（失败）
//   saveTankEntry(id,spec)  POST /api/tanks/<id>       → 单文件原子写
//   saveTankList(list, cb)  POST 逐条写                → cb(failedIds)
//   deleteTank(id, cb)      DELETE /api/tanks/<id>     → cb(true|false)
//   downloadTankFile(id,spec)  无服务器时的降级：下载 <id>.json 供手动放入 tanks/
// 依赖 dev server（file:// 下三个原型本身就无法工作，fallback 只覆盖"服务器拒绝写"的情况）。
// 纯 fetch + DOM 下载，无其他依赖。

function apiTanksUrl(id){
  return 'api/tanks' + (id !== undefined ? '/' + encodeURIComponent(id) : '');
}

function fetchTankList(onDone){
  fetch(apiTanksUrl())
    .then(res => res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)))
    .then(list => onDone(list))
    .catch(err => {
      console.warn('无法读取 tanks/ 列表:', err.message);
      onDone(null);
    });
}

function saveTankEntry(id, spec, onDone){
  fetch(apiTanksUrl(id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(spec, null, 2)
  })
    .then(res => res.ok ? onDone(true) : Promise.reject(new Error('HTTP ' + res.status)))
    .catch(() => onDone(false));
}

// 批量保存整个列表（compare 页）。逐条 POST；返回失败的 id 数组。
function saveTankList(list, onDone){
  const ids = Object.keys(list);
  const failed = [];
  if(ids.length === 0){ onDone(failed); return; }
  let left = ids.length;
  for(const id of ids){
    saveTankEntry(id, list[id], ok => {
      if(!ok) failed.push(id);
      if(--left === 0) onDone(failed);
    });
  }
}

function deleteTank(id, onDone){
  fetch(apiTanksUrl(id), { method: 'DELETE' })
    .then(res => res.ok ? onDone(true) : Promise.reject(new Error('HTTP ' + res.status)))
    .catch(() => onDone(false));
}

// 无服务器/写失败降级：下载单个 <id>.json（用户手动放入 tanks/）
function downloadTankFile(id, spec){
  const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = id + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    apiTanksUrl,
    fetchTankList,
    saveTankEntry,
    saveTankList,
    deleteTank,
    downloadTankFile
  };
}
