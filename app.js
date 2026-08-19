const S = {
    api: localStorage.getItem('zone_api') || '',
    token: sessionStorage.getItem('zone_token') || '',
    servers: [],
    server: null,
    cwd: '.',
    editing: null
};
const $ = id => document.getElementById(id),
    api = () => S.api.replace(/\/+$/, '');

function toast(msg, err = false) {
    const x = document.createElement('div');
    x.className = 'toast' + (err ? ' err' : '');
    x.textContent = msg;
    $('toast').appendChild(x);
    setTimeout(() => x.remove(), 3500)
}

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' } [c])) }

function online(s) { return ['online', 'connected', 'ready', 'running'].includes(String(s.status || '').toLowerCase()) }

async function req(path, opt = {}) {
    if (!api()) throw Error('Manager API URL is empty.');
    const h = new Headers(opt.headers || {});
    h.set('Accept', 'application/json');
    h.set('ngrok-skip-browser-warning', '1');
    if (S.token) h.set('Authorization', 'Bearer ' + S.token);
    if (opt.body && !(opt.body instanceof FormData)) h.set('Content-Type', 'application/json');
    let r;
    try { r = await fetch(api() + path, { ...opt, headers: h }) } catch (e) { $('apiState').textContent = 'API unreachable';
        $('apiState').className = 'pill off'; throw Error('Cannot connect to Manager API. Check URL, CORS, ngrok and the browser console.') }
    const t = await r.text();
    let d = {};
    try { d = t ? JSON.parse(t) : {} } catch { d = { raw: t } }
    if (!r.ok) {
        const m = typeof d.detail === 'string' ? d.detail : d.detail ? JSON.stringify(d.detail) : d.raw || ('HTTP ' + r.status);
        if (r.status === 401) { sessionStorage.removeItem('zone_token');
            S.token = '' }
        throw Error(m)
    }
    $('apiState').textContent = 'API online';
    $('apiState').className = 'pill on';
    return d
}

function showApp() { $('loginView').classList.add('hidden');
    $('app').classList.remove('hidden');
    loadServers() }

function showLogin() { $('app').classList.add('hidden');
    $('loginView').classList.remove('hidden');
    $('loginApi').value = S.api }
$('loginBtn').onclick = async () => {
    const u = $('loginApi').value.trim().replace(/\/+$/, '');
    const t = $('loginToken').value.trim();
    if (!/^https?:\/\//i.test(u) || !t) return toast('Enter a valid API URL and secret.', true);
    S.api = u;
    S.token = t;
    localStorage.setItem('zone_api', u);
    sessionStorage.setItem('zone_token', t);
    try { await req('/api/auth/check');
        showApp() } catch (e) { sessionStorage.removeItem('zone_token');
        S.token = '';
        toast(e.message, true) }
};
$('logout').onclick = () => { sessionStorage.removeItem('zone_token');
    S.token = '';
    showLogin() };
$('settingsBtn').onclick = () => { $('setApi').value = S.api;
    $('settings').classList.remove('hidden') };
$('setClose').onclick = $('setCancel').onclick = () => $('settings').classList.add('hidden');
$('setSave').onclick = async () => {
    const u = $('setApi').value.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(u)) return toast('Invalid API URL', true);
    S.api = u;
    localStorage.setItem('zone_api', u);
    $('settings').classList.add('hidden');
    try { await req('/api/auth/check');
        await loadServers();
        toast('Connection updated.') } catch (e) { toast(e.message, true) }
};
$('refresh').onclick = () => S.server ? loadServer(S.server.id) : loadServers();
$('dashRefresh').onclick = loadServers;
$('serverRefresh').onclick = loadServers;
$('back').onclick = () => page('servers');

function page(p) {
    document.querySelectorAll('.page').forEach(x => x.classList.add('hidden'));
    if (p === 'dashboard') { $('dashboard').classList.remove('hidden');
        $('title').textContent = 'Dashboard' } else if (p === 'servers') { $('servers').classList.remove('hidden');
        $('title').textContent = 'Servers';
        renderTable() } else { $('server').classList.remove('hidden');
        $('title').textContent = S.server?.name || 'Server' }
    document.querySelectorAll('.nav[data-page]').forEach(x => x.classList.toggle('active', x.dataset.page === p))
}
document.querySelectorAll('.nav[data-page]').forEach(x => x.onclick = () => page(x.dataset.page));

async function loadServers() {
    try { S.servers = await req('/api/servers');
        renderCards();
        renderTable() } catch (e) { toast(e.message, true) }
}

function renderCards() {
    $('cards').innerHTML = S.servers.length ? S.servers.map(s => `<article class="server-card" data-id="${s.id}"><div class="server-icon">▣</div><h3>${esc(s.name)}</h3><small>${esc(s.hostname||'Worker')}</small><div class="meta"><div class="mini"><span>Status</span><b>${online(s)?'Online':'Offline'}</b></div><div class="mini"><span>CPU</span><b>${s.cpu_percent==null?'—':s.cpu_percent+'%'}</b></div></div></article>`).join('') : `<div class="panel empty">No Workers registered yet.</div>`;
    document.querySelectorAll('.server-card').forEach(x => x.onclick = () => loadServer(Number(x.dataset.id)))
}

function renderTable() {
    $('table').innerHTML = S.servers.length ? `<table class="table"><thead><tr><th>SERVER</th><th>STATUS</th><th>CPU</th><th>RAM</th><th>DISK</th><th></th></tr></thead><tbody>${S.servers.map(s=>`<tr><td><b>${esc(s.name)}</b><br><small>${esc(s.hostname||'')}</small></td><td>${online(s)?'🟢 Online':'🔴 Offline'}</td><td>${s.cpu_percent==null?'—':s.cpu_percent+'%'}</td><td>${s.ram_percent==null?'—':s.ram_percent+'%'}</td><td>${s.disk_percent==null?'—':s.disk_percent+'%'}</td><td><button class="ghost open" data-id="${s.id}">Open</button></td></tr>`).join('')}</tbody></table>` : `<div class="empty">No Workers registered.</div>`;
    document.querySelectorAll('.open').forEach(x => x.onclick = () => loadServer(Number(x.dataset.id)))
}

async function loadServer(id) {
    S.server = S.servers.find(x => Number(x.id) === id) || { id };
    S.cwd = '.';
    page('server');
    $('serverName').textContent = S.server.name || `Server ${id}`;
    $('serverMeta').textContent = S.server.hostname || S.server.base_url || '';
    $('dot').className = 'dot ' + (online(S.server) ? 'on' : '');
    try {
        const d = await req(`/api/servers/${id}`);
        S.server = { ...S.server, ...d };
        $('serverName').textContent = S.server.name;
        $('serverMeta').textContent = S.server.hostname || S.server.base_url || '';
        $('dot').className = 'dot ' + (online(S.server) ? 'on' : '')
    } catch (e) { toast(e.message, true) }
    renderStats();
    await Promise.allSettled([loadFiles(), loadConsole()])
}

function renderStats() {
    const s = S.server || {};
    $('stats').innerHTML = [
        ['Status', online(s) ? 'Online' : 'Offline'],
        ['CPU', s.cpu_percent == null ? '—' : s.cpu_percent + '%'],
        ['RAM', s.ram_percent == null ? '—' : s.ram_percent + '%'],
        ['Disk', s.disk_percent == null ? '—' : s.disk_percent + '%']
    ].map(x => `<div class="stat"><span>${x[0]}</span><b>${esc(x[1])}</b></div>`).join('')
}

function safe(p) {
    p = (p || '.').replaceAll('\\', '/').trim();
    if (!p || p === '/') return '.';
    const out = [];
    for (const part of p.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') { if (!out.length) throw Error('Invalid path');
            out.pop() } else out.push(part)
    }
    return out.join('/') || '.'
}

function join(a, b) { return safe(a === '.' ? b : a + '/' + b) }

async function loadFiles() {
    if (!S.server) return;
    try {
        const d = await req(`/api/servers/${S.server.id}/files?path=${encodeURIComponent(S.cwd)}`);
        renderFiles(Array.isArray(d) ? d : (d.files || d.items || []))
    } catch (e) { $('fileList').innerHTML = `<div class="empty">${esc(e.message)}</div>` }
}

function renderFiles(list) {
    $('path').textContent = S.cwd === '.' ? '/' : '/' + S.cwd;
    let html = S.cwd !== '.' ? '<div class="file parent" id="parent"><div>↩</div><div>..</div><div></div><div></div></div>' : '';
    html += list.length ? list.map(f => {
        const name = f.name || f.filename || String(f.path || '').split('/').pop();
        const dir = !!(f.is_dir || f.directory || String(f.type || '').toLowerCase() === 'directory');
        const path = safe(f.path || join(S.cwd, name));
        return `<div class="file"><div>${dir?'📁':'📄'}</div><div class="file-name ${dir?'click':''}" data-open="${encodeURIComponent(path)}" data-dir="${dir}">${esc(name)}</div><div>${dir?'Folder':fmt(f.size)}</div><div class="act">${dir?'':`<button class="ghost edit" data-p="${esc(path)}">Edit</button>`}<button class="ghost del" data-p="${esc(path)}">Delete</button></div></div>`
    }).join('') : '<div class="empty">Directory is empty.</div>';
    $('fileList').innerHTML = html;
    if ($('parent')) $('parent').onclick = () => { const a = S.cwd.split('/').filter(Boolean);
        a.pop();
        S.cwd = a.join('/') || '.';
        loadFiles() };
    document.querySelectorAll('[data-open]').forEach(x => x.onclick = () => x.dataset.dir === 'true' ? (S.cwd = safe(decodeURIComponent(x.dataset.open)), loadFiles()) : editFile(decodeURIComponent(x.dataset.open), x.textContent.trim()));
    document.querySelectorAll('.edit').forEach(x => x.onclick = () => editFile(x.dataset.p, x.dataset.p.split('/').pop()));
    document.querySelectorAll('.del').forEach(x => x.onclick = () => delPath(x.dataset.p))
}

function fmt(n) {
    n = Number(n);
    if (!Number.isFinite(n)) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(1) + ' GB'
}

async function editFile(path, name) {
    try {
        const d = await req(`/api/servers/${S.server.id}/file?path=${encodeURIComponent(path)}`);
        S.editing = path;
        $('modalTitle').textContent = 'Edit ' + name;
        $('modalInput').classList.add('hidden');
        $('editor').classList.remove('hidden');
        $('editor').value = d.content ?? d.text ?? '';
        $('modal').classList.remove('hidden');
        $('modalOk').onclick = async () => {
            try {
                await req(`/api/servers/${S.server.id}/file?path=${encodeURIComponent(S.editing)}`, { method: 'PUT', body: JSON.stringify({ content: $('editor').value }) });
                $('modal').classList.add('hidden');
                toast('Saved');
                loadFiles()
            } catch (e) { toast(e.message, true) }
        }
    } catch (e) { toast(e.message, true) }
}

async function delPath(path) {
    if (!confirm('Delete ' + path + '?')) return;
    try { await req(`/api/servers/${S.server.id}/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
        toast('Deleted');
        loadFiles() } catch (e) { toast(e.message, true) }
}

function createModal(title, cb) {
    $('modalTitle').textContent = title;
    $('modalInput').value = '';
    $('modalInput').classList.remove('hidden');
    $('editor').classList.add('hidden');
    $('modal').classList.remove('hidden');
    $('modalOk').onclick = async () => {
        const n = $('modalInput').value.trim();
        if (!n) return;
        try { await cb(n);
            $('modal').classList.add('hidden');
            toast('Done');
            loadFiles() } catch (e) { toast(e.message, true) }
    }
}
$('newFile').onclick = () => createModal('Create file', n => req(`/api/servers/${S.server.id}/file?path=${encodeURIComponent(join(S.cwd,n))}`, { method: 'PUT', body: JSON.stringify({ content: '' }) }));
$('newDir').onclick = () => createModal('Create folder', n => req(`/api/servers/${S.server.id}/mkdir?path=${encodeURIComponent(join(S.cwd,n))}`, { method: 'POST' }));
$('reloadFiles').onclick = loadFiles;
$('modalClose').onclick = $('modalCancel').onclick = () => $('modal').classList.add('hidden');
$('upload').onchange = async e => {
    for (const f of [...e.target.files]) {
        try { const c = await f.text();
            await req(`/api/servers/${S.server.id}/file?path=${encodeURIComponent(join(S.cwd,f.name))}`, { method: 'PUT', body: JSON.stringify({ content: c }) }) } catch (x) { toast(`${f.name}: ${x.message}`, true) }
    }
    e.target.value = '';
    loadFiles()
};

async function loadConsole() {
    if (!S.server) return;
    $('consoleState').textContent = 'Loading';
    try {
        const d = await req(`/api/servers/${S.server.id}/console`);
        $('consoleOut').textContent = d.output ?? d.console ?? '';
        $('consoleState').textContent = 'Connected'
    } catch (e) { $('consoleOut').textContent = '[Manager] ' + e.message;
        $('consoleState').textContent = 'Worker unavailable' }
}
$('cmd').onsubmit = async e => {
    e.preventDefault();
    const c = $('cmdInput').value.trim();
    if (!c) return;
    $('cmdInput').value = '';
    $('consoleOut').textContent += `$ ${c}\n`;
    try {
        const d = await req(`/api/servers/${S.server.id}/run`, { method: 'POST', body: JSON.stringify({ command: c, cwd: S.cwd, timeout: 60 }) });
        $('consoleOut').textContent += (d.output ?? d.stdout ?? JSON.stringify(d)) + '\n'
    } catch (x) { $('consoleOut').textContent += '[ERROR] ' + x.message + '\n' }
    $('consoleOut').scrollTop = $('consoleOut').scrollHeight
};

async function loadProc() {
    try {
        const d = await req(`/api/servers/${S.server.id}/processes`);
        const a = Array.isArray(d) ? d : (d.processes || []);
        $('procList').innerHTML = a.length ? a.map(p => `<div class="file"><div>⚙</div><div>${esc(p.command||p.name)}</div><div>PID ${esc(p.pid)}</div><div class="act"><button class="ghost kill" data-pid="${p.pid}">Stop</button></div></div>`).join('') : '<div class="empty">No running processes.</div>';
        document.querySelectorAll('.kill').forEach(x => x.onclick = async () => { await req(`/api/servers/${S.server.id}/processes/${x.dataset.pid}`, { method: 'DELETE' });
            loadProc() })
    } catch (e) { $('procList').innerHTML = `<div class="empty">${esc(e.message)}</div>` }
}
$('reloadProc').onclick = loadProc;
$('pkg').onsubmit = async e => {
    e.preventDefault();
    try {
        const d = await req(`/api/servers/${S.server.id}/packages/install`, { method: 'POST', body: JSON.stringify({ package: $('pkgName').value.trim() }) });
        $('pkgOut').textContent = d.output ?? JSON.stringify(d)
    } catch (x) { $('pkgOut').textContent = x.message }
};

async function logs() {
    try {
        const d = await req(`/api/servers/${S.server.id}/logs`);
        $('logsOut').textContent = d.logs ?? d.output ?? ''
    } catch (e) { $('logsOut').textContent = e.message }
}
$('reloadLogs').onclick = logs;
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    ['files', 'console', 'processes', 'packages', 'logs'].forEach(x => $(`${x}`).classList.toggle('hidden', x !== t.dataset.tab));
    if (t.dataset.tab === 'files') loadFiles();
    if (t.dataset.tab === 'console') loadConsole();
    if (t.dataset.tab === 'processes') loadProc();
    if (t.dataset.tab === 'logs') logs()
});
if (S.token && S.api) {
    req('/api/auth/check').then(showApp).catch(() => { sessionStorage.removeItem('zone_token');
        S.token = '';
        showLogin() })
} else showLogin();
