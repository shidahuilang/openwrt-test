// 在线固件生成器 - 前端逻辑
// 纯前端 + GitHub API,无服务器

const REPO = 'shidahuilang/openwrt-test';
const FEED_URL = 'https://shidahuilang.github.io/openwrt-test';
const API = 'https://api.github.com';

// 状态
let allPackages = [];
let selectedPackages = new Set();
let currentFilter = 'all';
let searchKeyword = '';
let token = localStorage.getItem('gh_token') || '';
let currentRunId = null;
let pollTimer = null;

// 分类映射(从包名推断)
const CATEGORIES = {
  'luci-app-': 'LuCI 界面',
  'kmod-': '内核模块',
  'luci-proto-': '协议支持',
  'luci-i18n-': '语言包',
};

// 初始化
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('token').value = token;
  loadArchitectures();
  loadPackages('x86_64');
  bindEvents();
});

function bindEvents() {
  document.getElementById('arch').addEventListener('change', (e) => loadPackages(e.target.value));
  document.getElementById('token').addEventListener('change', (e) => {
    token = e.target.value.trim();
    localStorage.setItem('gh_token', token);
  });
  document.getElementById('search').addEventListener('input', (e) => {
    searchKeyword = e.target.value.toLowerCase();
    renderPackages();
  });
  document.querySelectorAll('.chip').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      currentFilter = c.dataset.cat;
      renderPackages();
    });
  });
  document.getElementById('buildBtn').addEventListener('click', triggerBuild);
}

// 加载架构列表
async function loadArchitectures() {
  // 从 Releases 检测可用架构
  try {
    const res = await fetch(`${API}/repos/${REPO}/releases?per_page=50`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const releases = await res.json();
    const archs = new Set();
    releases.forEach(r => {
      (r.assets || []).forEach(a => {
        const m = a.name.match(/imagebuilder.*-(\w+_\w+)-/);
        if (m) archs.add(m[1]);
      });
    });
    const sel = document.getElementById('arch');
    if (archs.size === 0) {
      sel.innerHTML = '<option value="x86_64">x86_64</option><option value="aarch64_generic">aarch64_generic</option>';
    } else {
      sel.innerHTML = [...archs].map(a => `<option value="${a}">${a}</option>`).join('');
    }
  } catch (e) {
    console.warn('架构加载失败,使用默认');
  }
}

// 加载插件清单
async function loadPackages(arch) {
  const list = document.getElementById('packageList');
  list.innerHTML = '<div class="empty">正在加载插件清单...</div>';
  allPackages = [];
  selectedPackages.clear();
  updateSelectedInfo();

  // 从 gh-pages 软件源读 Packages 索引
  const sources = ['base', 'luci', 'packages', 'routing'];
  const pkgs = [];

  for (const src of sources) {
    try {
      const url = `${FEED_URL}/${arch}/${src}/Packages`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      parsePackagesIndex(text, src, pkgs);
    } catch (e) { /* 源不存在,跳过 */ }
  }

  // 去重(同名包取第一个)
  const seen = new Set();
  allPackages = pkgs.filter(p => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });

  // 按名称排序
  allPackages.sort((a, b) => a.name.localeCompare(b.name));

  if (allPackages.length === 0) {
    list.innerHTML = '<div class="empty">暂无可用插件。请先完成编译并发布软件源。</div>';
  } else {
    renderPackages();
  }
}

// 解析 Packages 索引
function parsePackagesIndex(text, source, out) {
  const blocks = text.split('\n\n');
  for (const block of blocks) {
    const pkg = {};
    for (const line of block.split('\n')) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key === 'Package') pkg.name = val;
      else if (key === 'Description') pkg.desc = val.split(/\n/)[0];
      else if (key === 'Size') pkg.size = parseInt(val);
      else if (key === 'Depends') pkg.depends = val;
    }
    if (pkg.name) {
      pkg.source = source;
      pkg.category = guessCategory(pkg.name);
      out.push(pkg);
    }
  }
}

function guessCategory(name) {
  for (const [prefix, cat] of Object.entries(CATEGORIES)) {
    if (name.startsWith(prefix)) return cat;
  }
  return '其他';
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1048576).toFixed(1) + 'MB';
}

// 渲染插件列表
function renderPackages() {
  const list = document.getElementById('packageList');
  let filtered = allPackages;

  if (currentFilter !== 'all') {
    filtered = filtered.filter(p => p.category === currentFilter);
  }
  if (searchKeyword) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(searchKeyword) ||
      (p.desc && p.desc.toLowerCase().includes(searchKeyword))
    );
  }

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty">没有匹配的插件</div>';
    return;
  }

  list.innerHTML = filtered.map(p => `
    <label class="package-item">
      <input type="checkbox" value="${p.name}" ${selectedPackages.has(p.name) ? 'checked' : ''} data-size="${p.size || 0}">
      <div class="pkg-info">
        <div class="pkg-name">${escape(p.name)} <span class="arch-tag">${p.category}</span></div>
        <div class="pkg-desc">${escape(p.desc || '无描述')}</div>
      </div>
      <div class="pkg-size">${formatSize(p.size)}</div>
    </label>
  `).join('');

  // 绑定勾选事件
  list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const name = cb.value;
      const size = parseInt(cb.dataset.size) || 0;
      if (cb.checked) {
        selectedPackages.set(name, size);
      } else {
        selectedPackages.delete(name);
      }
      updateSelectedInfo();
    });
  });
}

function escape(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function updateSelectedInfo() {
  const count = selectedPackages.size;
  let totalSize = 0;
  selectedPackages.forEach(s => totalSize += s);
  document.getElementById('selCount').textContent = count;
  document.getElementById('selSize').textContent = formatSize(totalSize);
  document.getElementById('buildBtn').disabled = count === 0;
}

// 触发构建
async function triggerBuild() {
  if (!token) {
    alert('请先输入 GitHub Token(需要 workflow 权限)');
    return;
  }

  const arch = document.getElementById('arch').value;
  const profile = document.getElementById('profile').value || 'generic';
  const fwSize = document.getElementById('fwSize').value || '0';
  const packages = [...selectedPackages.keys()].join(' ');

  const btn = document.getElementById('buildBtn');
  btn.disabled = true;
  btn.textContent = '正在提交构建...';

  const statusArea = document.getElementById('statusArea');
  statusArea.classList.add('show');
  document.getElementById('downloadLink').classList.remove('show');
  updateStatus('提交构建请求', 'running');

  try {
    const res = await fetch(`${API}/repos/${REPO}/actions/workflows/image-builder.yml/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          arch,
          packages,
          profile,
          firmware_size: fwSize,
        }
      })
    });

    if (res.status !== 204) {
      const err = await res.json();
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    updateStatus('构建请求已提交', 'done');
    updateStatus('等待 runner 接单...', 'pending');
    // 轮询 run 状态
    setTimeout(() => pollRunStatus(), 5000);

  } catch (e) {
    updateStatus(`提交失败: ${e.message}`, 'error');
    btn.disabled = false;
    btn.textContent = '生成固件';
  }
}

// 轮询构建状态
async function pollRunStatus() {
  if (pollTimer) clearTimeout(pollTimer);

  try {
    // 查最新的 image-builder run
    const res = await fetch(`${API}/repos/${REPO}/actions/workflows/image-builder.yml/runs?per_page=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    const run = data.workflow_runs[0];

    if (!run) {
      pollTimer = setTimeout(pollRunStatus, 10000);
      return;
    }

    currentRunId = run.id;

    if (run.status === 'queued') {
      updateStatus('排队中...', 'pending');
      pollTimer = setTimeout(pollRunStatus, 10000);
    } else if (run.status === 'in_progress') {
      updateStatus('正在生成固件(make image)...', 'running');
      pollTimer = setTimeout(pollRunStatus, 15000);
    } else if (run.conclusion === 'success') {
      updateStatus('固件生成完成', 'done');
      // 从 Release 拿下载链接
      await fetchFirmwareLink();
      document.getElementById('buildBtn').disabled = false;
      document.getElementById('buildBtn').textContent = '生成固件';
    } else {
      updateStatus(`构建失败: ${run.conclusion}`, 'error');
      document.getElementById('buildBtn').disabled = false;
      document.getElementById('buildBtn').textContent = '生成固件';
    }
  } catch (e) {
    updateStatus(`状态查询失败: ${e.message}`, 'error');
    pollTimer = setTimeout(pollRunStatus, 15000);
  }
}

// 从最新 Release 获取固件下载链接
async function fetchFirmwareLink() {
  try {
    const res = await fetch(`${API}/repos/${REPO}/releases?per_page=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const releases = await res.json();
    const r = releases[0];
    if (r) {
      const links = (r.assets || []).map(a =>
        `<a href="${a.browser_download_url}" target="_blank">${a.name}</a> (${formatSize(a.size)})`
      ).join('<br>');
      const dl = document.getElementById('downloadLink');
      dl.innerHTML = `<strong>固件已就绪:</strong><br>${links}<br><br><small>Release: ${r.tag_name}</small>`;
      dl.classList.add('show');
    }
  } catch (e) {
    console.warn('获取下载链接失败:', e);
  }
}

function updateStatus(text, state) {
  const area = document.getElementById('statusSteps');
  const id = 'step-' + text;
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = `status-step pending`;
    el.innerHTML = `<span class="icon">○</span> <span class="text">${text}</span>`;
    area.appendChild(el);
  }
  el.className = `status-step ${state}`;
  const icons = { pending: '○', running: '◐', done: '✓', error: '✗' };
  el.querySelector('.icon').textContent = icons[state] || '○';
  el.querySelector('.text').textContent = text;
}
