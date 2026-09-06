// 在线固件生成器 - 前端逻辑 v2
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
let deviceList = [];
let selectedProfile = 'generic';

// 常用插件清单(参考 openwrt.ai)
const POPULAR_PACKAGES = [
  ['luci-app-accesscontrol-plus','访问控制'],
  ['luci-app-acme','HTTPS证书申请'],
  ['luci-app-adguardhome','ADG去广告'],
  ['luci-app-aliyundrive-webdav','阿里云盘WebDAV'],
  ['luci-app-ap-modem','访问AP/光猫'],
  ['luci-app-aria2','Aria2下载工具'],
  ['luci-app-arpbind','ARP绑定'],
  ['luci-app-bandix','流量监控限速'],
  ['luci-app-cifs-mount','共享盘挂载'],
  ['luci-app-clouddrive2','多云盘管理工具'],
  ['luci-app-cloudreve','多存储网盘'],
  ['luci-app-cupsd','CUPS打印服务'],
  ['luci-app-ddns','动态域名解析'],
  ['luci-app-ddns-go','动态域名解析'],
  ['luci-app-ddnsto','内网穿透'],
  ['luci-app-diskman','磁盘管理'],
  ['luci-app-dufs','WebDAV文件管理'],
  ['luci-app-easymesh','Mesh组网'],
  ['luci-app-easytier','异地组网'],
  ['luci-app-eqosplus','IP限速'],
  ['luci-app-filebrowser-q','文件网盘管理'],
  ['luci-app-frpc','内网穿透'],
  ['luci-app-guest-wifi','访客WIFI'],
  ['luci-app-hd-idle','硬盘休眠'],
  ['luci-app-homeassistant','智能家居'],
  ['luci-app-iptvhelper','IPTV助手'],
  ['luci-app-kodexplorer','可道云网盘'],
  ['luci-app-ksmbd','内核级文件共享'],
  ['luci-app-linkease','易有云文件管理'],
  ['luci-app-lucky','Lucy多功能网络工具'],
  ['luci-app-minidlna','DLNA媒体服务'],
  ['luci-app-mosdns','DNS转发'],
  ['luci-app-mwan3-nft','负载均衡'],
  ['luci-app-natmap','内网穿透'],
  ['luci-app-nft-timecontrol','上网时间控制'],
  ['luci-app-netdata','性能监测'],
  ['luci-app-fastnet','网络体检/测速'],
  ['luci-app-nlbwmon','流量统计'],
  ['luci-app-oaf','应用过滤'],
  ['luci-app-openlist2','原alist多存储文件列表'],
  ['luci-app-p910nd','USB打印机'],
  ['luci-app-parentcontrol','家长控制'],
  ['luci-app-partexp','分区扩容'],
  ['luci-app-qbittorrent','BT下载工具'],
  ['luci-app-quickfile','文件管理器'],
  ['luci-app-rclone','云盘挂载同步'],
  ['luci-app-samba4','samba文件共享'],
  ['luci-app-smartdns','SmartDNS'],
  ['luci-app-socat','端口转发'],
  ['luci-app-softethervpn','SoftEther VPN'],
  ['luci-app-statistics','系统监控统计'],
  ['luci-app-store','iStore应用商店'],
  ['luci-app-subconverter','订阅转换'],
  ['luci-app-syncdial','多拨'],
  ['luci-app-tailscale-community','Tailscale虚拟组网'],
  ['luci-app-taskplan','定时/开机任务'],
  ['luci-app-thunder','迅雷下载'],
  ['luci-app-timedreboot','定时重启'],
  ['luci-app-timewol','网络唤醒'],
  ['luci-app-transmission','BT下载'],
  ['luci-app-ttyd','网页版命令行'],
  ['luci-app-turboacc','网络加速'],
  ['luci-app-unblockneteasemusic','解锁网易云'],
  ['luci-app-unishare','多种文件共享'],
  ['luci-app-vlmcsd','KMS服务器'],
  ['luci-app-vsftpd','FTP服务器'],
  ['luci-app-watchcat','断网检测重启'],
  ['luci-app-webdav','WebDAV服务'],
  ['luci-app-wechatpush','通知推送'],
  ['luci-app-wireguard','WireGuard VPN'],
  ['luci-app-wrtbwmon','流量监控'],
  ['luci-app-zerotier','ZeroTier内网穿透'],
  ['luci-theme-argon','Argon主题'],
  ['luci-theme-kucat','KuCat主题'],
  ['luci-theme-alpha','Alpha主题'],
  ['luci-theme-aurora','Aurora主题'],
  ['automount','自动挂载USB/硬盘'],
  ['btop','性能监控'],
  ['open-vm-tools','VMware工具'],
  ['qemu-ga','QEMU来宾代理'],
];

// 分类映射
const CATEGORIES = {
  'luci-app-': 'LuCI 界面',
  'kmod-': '内核模块',
  'luci-proto-': '协议支持',
  'luci-i18n-': '语言包',
  'luci-theme-': '主题',
};

// 初始化
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('token').value = token;
  loadArchitectures();
  loadPackages('x86_64');
  loadDevices('x86_64');
  renderPopularPackages();
  bindEvents();
});

function bindEvents() {
  document.getElementById('arch').addEventListener('change', (e) => {
    loadPackages(e.target.value);
    loadDevices(e.target.value);
  });
  document.getElementById('token').addEventListener('change', (e) => {
    token = e.target.value.trim();
    localStorage.setItem('gh_token', token);
  });
  document.getElementById('search').addEventListener('input', (e) => {
    searchKeyword = e.target.value.toLowerCase();
    renderPackages();
  });
  document.querySelectorAll('.chip[data-cat]').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('.chip[data-cat]').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      currentFilter = c.dataset.cat;
      renderPackages();
    });
  });
  document.getElementById('buildBtn').addEventListener('click', triggerBuild);

  // 设备搜索
  const ds = document.getElementById('deviceSearch');
  ds.addEventListener('input', () => renderDeviceDropdown(ds.value));
  ds.addEventListener('focus', () => renderDeviceDropdown(ds.value));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.device-search')) {
      document.getElementById('deviceDropdown').classList.remove('show');
    }
  });
}

// ========== 设备列表 ==========
async function loadDevices(arch) {
  deviceList = [];
  try {
    const res = await fetch(`${FEED_URL}/devices.json`);
    if (res.ok) {
      const data = await res.json();
      deviceList = data.profiles || [];
      console.log(`加载 ${deviceList.length} 个设备`);
    }
  } catch (e) { /* 设备列表暂未生成 */ }
  document.getElementById('deviceSearch').value = 'Generic';
  selectedProfile = 'generic';
}

function renderDeviceDropdown(keyword) {
  const dd = document.getElementById('deviceDropdown');
  const kw = keyword.toLowerCase().trim();
  if (!kw) {
    dd.classList.remove('show');
    return;
  }
  let filtered = deviceList.filter(d =>
    d.profile.toLowerCase().includes(kw) || (d.desc || '').toLowerCase().includes(kw)
  ).slice(0, 30);

  // 如果没有动态列表,加一个 generic fallback
  if (filtered.length === 0 && deviceList.length === 0) {
    filtered = [{ profile: 'generic', desc: '通用设备(x86)' }];
  }

  dd.innerHTML = filtered.map(d =>
    `<div class="device-option" data-profile="${d.profile}" data-desc="${escape(d.desc || '')}">
      <span class="profile">${d.profile}</span>
      <span class="desc">${escape(d.desc || '')}</span>
    </div>`
  ).join('');

  dd.classList.add('show');
  dd.querySelectorAll('.device-option').forEach(opt => {
    opt.addEventListener('click', () => {
      selectedProfile = opt.dataset.profile;
      document.getElementById('deviceSearch').value = `${opt.dataset.profile} (${opt.dataset.desc})`;
      dd.classList.remove('show');
    });
  });
}

// ========== 架构列表 ==========
async function loadArchitectures() {
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
    if (archs.size > 0) {
      sel.innerHTML = [...archs].map(a => `<option value="${a}">${a}</option>`).join('');
    }
  } catch (e) { /* 使用默认 */ }
}

// ========== 常用插件 ==========
function renderPopularPackages() {
  const grid = document.getElementById('popularGrid');
  grid.innerHTML = POPULAR_PACKAGES.map(([pkg, desc]) =>
    `<div class="popular-item" data-pkg="${pkg}" data-desc="${escape(desc)}">
      <span class="check">✓</span>
      <span class="pkg">${pkg}</span>
      <span class="desc">${escape(desc)}</span>
    </div>`
  ).join('');
  grid.querySelectorAll('.popular-item').forEach(item => {
    item.addEventListener('click', () => {
      const pkg = item.dataset.pkg;
      if (selectedPackages.has(pkg)) {
        selectedPackages.delete(pkg);
        item.classList.remove('selected');
      } else {
        selectedPackages.add(pkg);
        item.classList.add('selected');
      }
      updateSelectedInfo();
      // 同步搜索列表中的勾选状态
      const cb = document.querySelector(`#packageList input[value="${pkg}"]`);
      if (cb) cb.checked = selectedPackages.has(pkg);
    });
  });
}

// ========== 全量插件列表 ==========
async function loadPackages(arch) {
  const list = document.getElementById('packageList');
  list.innerHTML = '<div class="empty">正在加载插件清单...</div>';
  allPackages = [];
  const sources = ['base', 'luci', 'packages', 'routing'];
  const pkgs = [];
  for (const src of sources) {
    try {
      const url = `${FEED_URL}/${arch}/${src}/Packages`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      parsePackagesIndex(text, src, pkgs);
    } catch (e) {}
  }
  const seen = new Set();
  allPackages = pkgs.filter(p => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
  allPackages.sort((a, b) => a.name.localeCompare(b.name));
  if (allPackages.length === 0) {
    list.innerHTML = '<div class="empty">暂无可用插件。请先完成编译并发布软件源。</div>';
  } else {
    renderPackages();
    // 同步常用插件的选中状态
    document.querySelectorAll('.popular-item').forEach(item => {
      if (selectedPackages.has(item.dataset.pkg)) {
        item.classList.add('selected');
      }
    });
  }
}

function parsePackagesIndex(text, source, out) {
  for (const block of text.split('\n\n')) {
    const pkg = {};
    for (const line of block.split('\n')) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key === 'Package') pkg.name = val;
      else if (key === 'Description') pkg.desc = val.split(/\n/)[0];
      else if (key === 'Size') pkg.size = parseInt(val);
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
  list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const name = cb.value;
      const size = parseInt(cb.dataset.size) || 0;
      if (cb.checked) {
        selectedPackages.set(name, size);
        // 同步常用插件
        const pop = document.querySelector(`.popular-item[data-pkg="${name}"]`);
        if (pop) pop.classList.add('selected');
      } else {
        selectedPackages.delete(name);
        const pop = document.querySelector(`.popular-item[data-pkg="${name}"]`);
        if (pop) pop.classList.remove('selected');
      }
      updateSelectedInfo();
    });
  });
}

function escape(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function updateSelectedInfo() {
  document.getElementById('selCount').textContent = selectedPackages.size;
  let totalSize = 0;
  selectedPackages.forEach(s => totalSize += s);
  document.getElementById('selSize').textContent = formatSize(totalSize);
  document.getElementById('buildBtn').disabled = selectedPackages.size === 0;
}

// ========== 触发构建 ==========
async function triggerBuild() {
  if (!token) { alert('请先输入 GitHub Token'); return; }
  const arch = document.getElementById('arch').value;
  const fwSize = document.getElementById('fwSize').value || '0';
  const packages = [...selectedPackages.keys()].join(' ');

  // 收集代理工具勾选
  const proxyChips = document.querySelectorAll('.proxy-chips input:checked');
  proxyChips.forEach(cb => { if (cb.value) packages += ` ${cb.value}`; });

  // 主题
  const theme = document.getElementById('theme').value;
  if (theme) packages += ` ${theme}`;
  // Web 服务器
  const ws = document.getElementById('webServer').value;
  if (ws === 'uhttpd') packages += ' uhttpd';
  else if (ws === 'lighttpd') packages += ' lighttpd';

  const btn = document.getElementById('buildBtn');
  btn.disabled = true;
  btn.textContent = '正在提交...';
  document.getElementById('statusArea').classList.add('show');
  document.getElementById('downloadLink').classList.remove('show');
  document.getElementById('statusSteps').innerHTML = '';
  updateStatus('提交构建请求', 'running');

  try {
    const res = await fetch(`${API}/repos/${REPO}/actions/workflows/image-builder.yml/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({ ref: 'main', inputs: {
        arch, packages: packages.trim(), profile: selectedProfile, firmware_size: fwSize,
        ipv6: document.getElementById('swIPv6').checked ? 'true' : 'false',
        docker: document.getElementById('swDocker').checked ? 'true' : 'false',
        efi: document.getElementById('swEFI').checked ? 'true' : 'false',
        legacy: document.getElementById('swLegacy').checked ? 'true' : 'false',
        ext4: document.getElementById('swExt4').checked ? 'true' : 'false',
      }})
    });
    if (res.status !== 204) {
      const err = await res.json();
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    updateStatus('构建请求已提交', 'done');
    updateStatus('等待 runner...', 'pending');
    setTimeout(() => pollRunStatus(), 5000);
  } catch (e) {
    updateStatus(`提交失败: ${e.message}`, 'error');
    btn.disabled = false;
    btn.textContent = '生成固件';
  }
}

async function pollRunStatus() {
  if (pollTimer) clearTimeout(pollTimer);
  try {
    const res = await fetch(`${API}/repos/${REPO}/actions/workflows/image-builder.yml/runs?per_page=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    const run = data.workflow_runs[0];
    if (!run) { pollTimer = setTimeout(pollRunStatus, 10000); return; }
    currentRunId = run.id;
    if (run.status === 'queued') {
      updateStatus('排队中...', 'pending');
      pollTimer = setTimeout(pollRunStatus, 10000);
    } else if (run.status === 'in_progress') {
      updateStatus('正在生成固件...', 'running');
      pollTimer = setTimeout(pollRunStatus, 15000);
    } else if (run.conclusion === 'success') {
      updateStatus('固件生成完成', 'done');
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
  } catch (e) {}
}

function updateStatus(text, state) {
  const area = document.getElementById('statusSteps');
  const id = 'step-' + text;
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'status-step pending';
    el.innerHTML = `<span class="icon">○</span> <span class="text">${text}</span>`;
    area.appendChild(el);
  }
  el.className = `status-step ${state}`;
  const icons = { pending: '○', running: '◐', done: '✓', error: '✗' };
  el.querySelector('.icon').textContent = icons[state] || '○';
  el.querySelector('.text').textContent = text;
}
