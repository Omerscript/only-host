const DEFAULT_API = "https://oilless-superficial-elenora.ngrok-free.dev";

const state = {
  api: localStorage.getItem("zone_api") || DEFAULT_API,
  token: sessionStorage.getItem("zone_token") || "",
  servers: [],
  server: null,
  cwd: "/",
  editing: null,
  activeTab: "files"
};

const $ = (id) => document.getElementById(id);
const apiUrl = () => state.api.replace(/\/+$/, "");

function toast(message, type="ok") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  $("toast").appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

async function api(path, options={}) {
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set("Authorization", `Bearer ${state.token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let res;
  try {
    res = await fetch(`${apiUrl()}${path}`, {...options, headers});
  } catch (e) {
    $("apiStatus").textContent = "API unreachable";
    $("apiStatus").className = "status-pill offline";
    throw new Error("Cannot connect to Manager API. Check the API URL, ngrok status and CORS.");
  }
  $("apiStatus").textContent = res.ok ? "API online" : `API ${res.status}`;
  $("apiStatus").className = `status-pill ${res.ok ? "online" : "offline"}`;
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = {raw: text}; }
  if (!res.ok) throw new Error(data.detail || data.message || data.raw || `HTTP ${res.status}`);
  return data;
}

function showApp() {
  $("loginView").classList.add("hidden");
  $("app").classList.remove("hidden");
  loadServers();
}
function showLogin() {
  $("app").classList.add("hidden");
  $("loginView").classList.remove("hidden");
}
if (state.token) showApp();

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  state.token = $("loginToken").value.trim();
  if (!state.token) return;
  sessionStorage.setItem("zone_token", state.token);
  try {
    await loadServers();
    showApp();
  } catch (e) {
    sessionStorage.removeItem("zone_token");
    state.token = "";
    toast(e.message, "error");
  }
});

$("logoutBtn").onclick = () => {
  sessionStorage.removeItem("zone_token");
  state.token = "";
  showLogin();
};

$("settingsBtn").onclick = () => {
  $("apiUrlInput").value = state.api;
  $("settingsModal").classList.remove("hidden");
};
$("saveSettingsBtn").onclick = () => {
  const value = $("apiUrlInput").value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(value)) return toast("Enter a valid http(s) API URL.", "error");
  state.api = value;
  localStorage.setItem("zone_api", value);
  $("settingsModal").classList.add("hidden");
  toast("API URL saved.");
  loadServers();
};

document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => $(b.dataset.close).classList.add("hidden"));

document.querySelectorAll(".nav-item[data-page]").forEach(b => b.onclick = () => {
  document.querySelectorAll(".nav-item[data-page]").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  openPage(b.dataset.page);
});
function openPage(page) {
  ["dashboardPage","serversPage","serverPage"].forEach(x => $(x).classList.add("hidden"));
  $("pageTitle").textContent = page === "dashboard" ? "Dashboard" : page === "servers" ? "Servers" : (state.server?.name || "Server");
  if (page === "dashboard") $("dashboardPage").classList.remove("hidden");
  if (page === "servers") { $("serversPage").classList.remove("hidden"); renderServersTable(); }
  if (page === "server") $("serverPage").classList.remove("hidden");
}
$("refreshBtn").onclick = () => state.server ? loadServer(state.server.id) : loadServers();
$("dashboardRefresh").onclick = loadServers;
$("serversRefresh").onclick = loadServers;
$("backToServers").onclick = () => openPage("servers");

async function loadServers() {
  const data = await api("/api/servers");
  state.servers = Array.isArray(data) ? data : (data.servers || []);
  renderServerCards();
  renderServersTable();
  return data;
}
function serverStatus(s) {
  return String(s.status || (s.online ? "online" : "offline")).toLowerCase();
}
function renderServerCards() {
  $("serverCards").innerHTML = state.servers.length ? state.servers.map(s => {
    const online = ["online","connected","running","ready"].includes(serverStatus(s));
    return `<article class="server-card" onclick="loadServer('${escapeHtml(s.id)}')">
      <div class="server-card-head"><div class="server-icon">▣</div><span class="${online?'online-dot':'online-dot offline-dot'}"></span></div>
      <h3>${escapeHtml(s.name || `Server ${s.id}`)}</h3>
      <span class="muted">${escapeHtml(s.host || s.address || "Worker")}</span>
      <div class="server-meta">
        <div class="mini-stat"><span>Status</span><strong>${online?'Online':'Offline'}</strong></div>
        <div class="mini-stat"><span>CPU</span><strong>${s.cpu_percent != null ? s.cpu_percent+"%" : "—"}</strong></div>
      </div>
    </article>`;
  }).join("") : `<div class="panel empty">No servers registered yet. Start a Worker and connect it to the Manager.</div>`;
}
function renderServersTable() {
  if (!$("serversTable")) return;
  $("serversTable").innerHTML = state.servers.length ? `<table class="server-table">
    <thead><tr><th>SERVER</th><th>STATUS</th><th>CPU</th><th>RAM</th><th>ACTION</th></tr></thead>
    <tbody>${state.servers.map(s => {
      const online = ["online","connected","running","ready"].includes(serverStatus(s));
      return `<tr><td><strong>${escapeHtml(s.name || s.id)}</strong><br><small class="muted">${escapeHtml(s.id)}</small></td>
      <td><span class="status-text ${online?'online':'offline'}">● ${online?'Online':'Offline'}</span></td>
      <td>${s.cpu_percent != null ? s.cpu_percent+"%" : "—"}</td>
      <td>${s.ram_percent != null ? s.ram_percent+"%" : "—"}</td>
      <td><button class="ghost" onclick="loadServer('${escapeHtml(s.id)}')">Open</button></td></tr>`;
    }).join("")}</tbody></table>` : `<div class="empty">No servers registered.</div>`;
}

async function loadServer(id) {
  const s = state.servers.find(x => String(x.id) === String(id)) || {id};
  state.server = s;
  state.cwd = "/";
  openPage("server");
  $("selectedServerName").textContent = s.name || `Server ${id}`;
  $("selectedServerMeta").textContent = s.host || s.address || `ID: ${id}`;
  $("serverDot").className = `dot ${["online","connected","running","ready"].includes(serverStatus(s)) ? "online" : ""}`;
  try {
    const detail = await api(`/api/servers/${encodeURIComponent(id)}`);
    state.server = {...s, ...detail};
    $("selectedServerName").textContent = state.server.name || `Server ${id}`;
    $("selectedServerMeta").textContent = state.server.host || state.server.address || `ID: ${id}`;
    renderStats(state.server);
  } catch (e) {
    renderStats(s);
    toast(e.message, "error");
  }
  await loadFiles();
  loadConsole();
}
$("serverRefresh").onclick = () => state.server && loadServer(state.server.id);

function renderStats(s) {
  $("stats").innerHTML = [
    ["Status", serverStatus(s)],
    ["CPU", s.cpu_percent != null ? `${s.cpu_percent}%` : "—"],
    ["RAM", s.ram_percent != null ? `${s.ram_percent}%` : "—"],
    ["Disk", s.disk_percent != null ? `${s.disk_percent}%` : "—"]
  ].map(([a,b]) => `<div class="stat-card"><span>${a}</span><strong>${escapeHtml(b)}</strong></div>`).join("");
}

document.querySelectorAll(".tab").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  state.activeTab = b.dataset.tab;
  ["files","console","processes","packages","logs"].forEach(t => $(`${t}Tab`).classList.toggle("hidden", t !== state.activeTab));
  if (state.activeTab === "files") loadFiles();
  if (state.activeTab === "processes") loadProcesses();
  if (state.activeTab === "logs") loadLogs();
});

function normalizePath(path) {
  if (!path) return "/";
  path = path.replaceAll("\\","/");
  if (!path.startsWith("/")) path = "/" + path;
  return path.replace(/\/+/g,"/").replace(/\/$/,"") || "/";
}
function joinPath(dir,name) { return normalizePath(`${dir}/${name}`); }

async function loadFiles() {
  if (!state.server) return;
  try {
    const q = encodeURIComponent(state.cwd);
    const data = await api(`/api/servers/${encodeURIComponent(state.server.id)}/files?path=${q}`);
    const files = Array.isArray(data) ? data : (data.files || data.items || []);
    renderFiles(files);
  } catch (e) {
    $("fileList").innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
  }
}
function renderFiles(files) {
  $("breadcrumb").textContent = state.cwd;
  if (!files.length) {
    $("fileList").innerHTML = `<div class="empty">This directory is empty.</div>`;
    return;
  }
  const parent = state.cwd !== "/" ? `<div class="file-row" onclick="goParent()" style="cursor:pointer">
    <div class="file-icon">↩</div><div class="file-name clickable">..</div><div></div><div></div></div>` : "";
  $("fileList").innerHTML = parent + files.map(f => {
    const name = f.name || f.filename || String(f.path || "").split("/").pop();
    const type = String(f.type || (f.is_dir || f.directory ? "directory" : "file")).toLowerCase();
    const dir = ["dir","directory","folder"].includes(type);
    const path = f.path || joinPath(state.cwd,name);
    return `<div class="file-row">
      <div class="file-icon">${dir?'📁':'📄'}</div>
      <div class="file-name ${dir?'clickable':''}" ${dir?`onclick="openDir('${encodeURIComponent(path)}')"`:`onclick="editFile('${encodeURIComponent(path)}','${escapeHtml(name)}')"`}>${escapeHtml(name)}</div>
      <div class="file-size">${dir?'Folder':escapeHtml(formatBytes(f.size))}</div>
      <div class="file-actions">
        ${!dir?`<button class="ghost" onclick="editFile('${encodeURIComponent(path)}','${escapeHtml(name)}')">Edit</button>`:""}
        <button class="ghost" onclick="deletePath('${encodeURIComponent(path)}')">Delete</button>
      </div>
    </div>`;
  }).join("");
}
function formatBytes(n){ if(n==null) return "—"; n=Number(n); if(!Number.isFinite(n))return "—"; const u=["B","KB","MB","GB"]; let i=0; while(n>=1024&&i<3){n/=1024;i++} return `${n.toFixed(i?1:0)} ${u[i]}`; }
window.openDir = encoded => { state.cwd=normalizePath(decodeURIComponent(encoded)); loadFiles(); };
window.goParent = () => { const p=state.cwd.split("/").filter(Boolean); p.pop(); state.cwd="/"+p.join("/"); if(state.cwd!="/")state.cwd+="/"; state.cwd=normalizePath(state.cwd); loadFiles(); };

async function deletePath(encoded) {
  const path=decodeURIComponent(encoded);
  if(!confirm(`Delete ${path}?`))return;
  try { await api(`/api/servers/${encodeURIComponent(state.server.id)}/file`,{method:"DELETE",body:JSON.stringify({path})}); toast("Deleted."); loadFiles(); }
  catch(e){toast(e.message,"error")}
}

window.editFile = async (encoded,name) => {
  const path=decodeURIComponent(encoded);
  try {
    const data=await api(`/api/servers/${encodeURIComponent(state.server.id)}/file?path=${encodeURIComponent(path)}`);
    state.editing=path;
    $("editorTitle").textContent=name;
    $("editorContent").value=data.content ?? data.text ?? data.raw ?? "";
    $("editorModal").classList.remove("hidden");
  } catch(e){toast(e.message,"error")}
};
$("saveFileBtn").onclick = async () => {
  try {
    await api(`/api/servers/${encodeURIComponent(state.server.id)}/file`,{method:"PUT",body:JSON.stringify({path:state.editing,content:$("editorContent").value})});
    $("editorModal").classList.add("hidden"); toast("File saved."); loadFiles();
  } catch(e){toast(e.message,"error")}
};

function openCreate(title, action) {
  $("simpleTitle").textContent=title; $("simpleInput").value=""; $("simpleModal").classList.remove("hidden");
  $("simpleSubmit").onclick = async () => {
    const name=$("simpleInput").value.trim(); if(!name)return;
    try{await action(name);$("simpleModal").classList.add("hidden");toast("Created.");loadFiles()}catch(e){toast(e.message,"error")}
  };
}
$("newFileBtn").onclick=()=>openCreate("Create file",name=>api(`/api/servers/${encodeURIComponent(state.server.id)}/file`,{method:"POST",body:JSON.stringify({path:joinPath(state.cwd,name),content:""})}));
$("newFolderBtn").onclick=()=>openCreate("Create folder",name=>api(`/api/servers/${encodeURIComponent(state.server.id)}/directory`,{method:"POST",body:JSON.stringify({path:joinPath(state.cwd,name)})}));
$("refreshFilesBtn").onclick=loadFiles;

$("uploadInput").onchange = async e => {
  const files=[...e.target.files]; if(!files.length)return;
  for(const file of files){
    try{
      const content=await file.text();
      await api(`/api/servers/${encodeURIComponent(state.server.id)}/file`,{method:"PUT",body:JSON.stringify({path:joinPath(state.cwd,file.name),content})});
    }catch(err){toast(`${file.name}: ${err.message}`,"error")}
  }
  e.target.value=""; loadFiles();
};

$("commandForm").onsubmit = async e => {
  e.preventDefault();
  const command=$("commandInput").value.trim(); if(!command||!state.server)return;
  $("commandInput").value="";
  appendConsole(`$ ${command}`);
  try{
    const data=await api(`/api/servers/${encodeURIComponent(state.server.id)}/run`,{method:"POST",body:JSON.stringify({command})});
    appendConsole(data.output || data.stdout || data.result || JSON.stringify(data,null,2));
  }catch(err){appendConsole(`[ERROR] ${err.message}`)}
};
function appendConsole(text){$("consoleOutput").textContent += `${text}\n`; $("consoleOutput").scrollTop=$("consoleOutput").scrollHeight}
async function loadConsole(){
  $("consoleState").textContent="Loading...";
  try{
    const data=await api(`/api/servers/${encodeURIComponent(state.server.id)}/console`);
    $("consoleOutput").textContent=data.output || data.console || data.content || "";
    $("consoleState").textContent="Connected";
  }catch(e){$("consoleState").textContent="Waiting for Worker"; $("consoleOutput").textContent=""; }
}

async function loadProcesses(){
  try{
    const data=await api(`/api/servers/${encodeURIComponent(state.server.id)}/processes`);
    const list=Array.isArray(data)?data:(data.processes||[]);
    $("processList").innerHTML=list.length?list.map(p=>`<div class="file-row"><div class="file-icon">⚙</div><div><strong>${escapeHtml(p.name||p.command||"Python process")}</strong></div><div>${escapeHtml(String(p.pid??"—"))}</div><div><button class="ghost" onclick="stopProcess('${escapeHtml(String(p.pid))}')">Stop</button></div></div>`).join(""):`<div class="empty">No running processes.</div>`;
  }catch(e){$("processList").innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`}
}
window.stopProcess=async pid=>{try{await api(`/api/servers/${encodeURIComponent(state.server.id)}/processes/${encodeURIComponent(pid)}`,{method:"DELETE"});toast("Process stopped.");loadProcesses()}catch(e){toast(e.message,"error")}};
$("refreshProcesses").onclick=loadProcesses;

$("packageForm").onsubmit=async e=>{e.preventDefault();const packageName=$("packageInput").value.trim();if(!packageName)return;try{const d=await api(`/api/servers/${encodeURIComponent(state.server.id)}/packages/install`,{method:"POST",body:JSON.stringify({package:packageName})});$("packageOutput").textContent=d.output||d.message||JSON.stringify(d,null,2)}catch(err){$("packageOutput").textContent=err.message}};

async function loadLogs(){try{const d=await api(`/api/servers/${encodeURIComponent(state.server.id)}/logs`);$("logsOutput").textContent=d.output||d.logs||d.content||JSON.stringify(d,null,2)}catch(e){$("logsOutput").textContent=e.message}}
$("refreshLogs").onclick=loadLogs;

$("dashboardRefresh").onclick=loadServers;
$("refreshBtn").onclick=()=>state.server?loadServer(state.server.id):loadServers();

if (!state.token) showLogin();
