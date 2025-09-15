let cpuChart, memChart, diskChart, actChart;
let currentChatGroupId = null;

async function fetchMetrics(){
  const res = await fetch('/api/metrics');
  if(!res.ok) throw new Error('metrics error');
  return res.json();
}

async function fetchGroups(){
  const res = await fetch('/api/groups');
  if(!res.ok) return { groups: [] };
  return res.json();
}

async function fetchGroupSummary(){
  const res = await fetch('/api/groups/summary');
  if(!res.ok) return { groups: [] };
  return res.json();
}

async function fetchGroupMessages(id, limit=30){
  const res = await fetch(`/api/group/${encodeURIComponent(id)}/messages?limit=${limit}`);
  if(!res.ok) return { id, name: id, messages: [] };
  return res.json();
}

function fmtBytes(x){
  if(!x) return '0 B';
  const units = ['B','KB','MB','GB','TB'];
  let i=0; let n=x;
  while(n>=1024 && i<units.length-1){ n/=1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

function initCharts(){
  const gauge = document.getElementById('cpuGauge').getContext('2d');
  const pieMem = document.getElementById('memPie').getContext('2d');
  const pieDisk = document.getElementById('diskPie').getContext('2d');
  const barAct = document.getElementById('activityBar').getContext('2d');

  cpuChart = new Chart(gauge, {
    type: 'doughnut',
    data: { labels:['Uso','Libre'], datasets:[{ data:[0,100], backgroundColor:['#00d1b2','#2a2a36'], borderWidth:0 }] },
    options: { cutout:'70%', plugins:{ legend:{ display:false } } }
  });

  memChart = new Chart(pieMem, {
    type: 'doughnut',
    data: { labels:['Usada','Libre'], datasets:[{ data:[0,0], backgroundColor:['#7c4dff','#2a2a36'], borderWidth:0 }] },
    options: { cutout:'60%', plugins:{ legend:{ display:false } } }
  });

  diskChart = new Chart(pieDisk, {
    type: 'doughnut',
    data: { labels:['Usado','Libre'], datasets:[{ data:[0,0], backgroundColor:['#ff6d00','#2a2a36'], borderWidth:0 }] },
    options: { cutout:'60%', plugins:{ legend:{ display:false } } }
  });

  actChart = new Chart(barAct, {
    type: 'bar',
    data: { labels:['Grupos','Usuarios'], datasets:[{ label:'Conteo', data:[0,0], backgroundColor:['#00bcd4','#00d1b2'] }] },
    options: { responsive:true, plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ color:'#9aa0a6' } }, y:{ ticks:{ color:'#9aa0a6' }, beginAtZero:true } } }
  });
}

function updateCharts(m){
  const cpu = Math.max(0, Math.min(100, m.cpuPercent));
  cpuChart.data.datasets[0].data = [cpu, 100-cpu];
  cpuChart.update();
  document.getElementById('cpuText').textContent = `${cpu.toFixed(0)}%`;

  const memUsed = m.memSystemUsed || 0;
  const memFree = Math.max(0, (m.memSystemTotal||0) - memUsed);
  memChart.data.datasets[0].data = [memUsed, memFree];
  memChart.update();
  document.getElementById('memText').textContent = `${fmtBytes(memUsed)} / ${fmtBytes(m.memSystemTotal||0)}`;

  const dUsed = m.diskUsed||0; const dFree = Math.max(0,(m.diskTotal||0)-dUsed);
  diskChart.data.datasets[0].data = [dUsed, dFree];
  diskChart.update();
  document.getElementById('diskText').textContent = `${fmtBytes(dUsed)} / ${fmtBytes(m.diskTotal||0)}`;

  actChart.data.datasets[0].data = [m.groupsCount||0, m.usersCount||0];
  actChart.update();
  document.getElementById('actText').textContent = `Grupos: ${m.groupsCount||0} · Usuarios: ${m.usersCount||0}`;

  document.getElementById('uptime').textContent = `${m.uptimeSec||0}s`;
}

async function tick(){
  try{
    const m = await fetchMetrics();
    updateCharts(m);
  }catch(e){
    // Ignorar errores transitorios
  }finally{
  setTimeout(tick, 4000);
  }
}

initCharts();
tick();

// Terminal UI
const outEl = document.getElementById('termOutput');
const inputEl = document.getElementById('cmdInput');
const btnEl = document.getElementById('sendBtn');
const selEl = document.getElementById('groupSelect');
const refEl = document.getElementById('refreshBtn');

function logLine(text, type='info'){
  const line = document.createElement('div');
  line.textContent = text;
  line.style.color = type === 'error' ? '#ff8a80' : '#9aa0a6';
  outEl.appendChild(line);
  outEl.scrollTop = outEl.scrollHeight;
}

async function refreshGroups(){
  try{
    const { groups=[] } = await fetchGroups();
    selEl.innerHTML = '';
    for(const g of groups){
      const opt = document.createElement('option');
      opt.value = g.id || g;
      opt.textContent = g.name ? `${g.name} (${g.id})` : (g.id || g);
      selEl.appendChild(opt);
    }
  }catch{ /* ignore */ }
}

async function sendCmd(){
  const text = (inputEl.value || '').trim();
  const groupId = selEl.value;
  if(!text || !groupId){ logLine('Selecciona grupo y escribe un comando', 'error'); return; }
  logLine(`> ${text}`);
  try{
    let res = await fetch('/api/command', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ groupId, text }) });
    if(!res.ok){
      // Fallback a GET si falla POST
      const url = `/api/command?groupId=${encodeURIComponent(groupId)}&text=${encodeURIComponent(text)}`;
      res = await fetch(url, { method:'GET' });
    }
    const data = await res.json().catch(()=>({ error: 'Respuesta inválida' }));
    if(!res.ok){ throw new Error(data.error || 'error'); }
    if (Array.isArray(data.outputs)){
      for (const o of data.outputs){ logLine(o.text || JSON.stringify(o)); }
    } else { logLine('ok'); }
    inputEl.value = '';
  }catch(e){
    logLine(String(e), 'error');
  }
}

btnEl.addEventListener('click', sendCmd);
inputEl.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ sendCmd(); } });
refreshGroups();
refEl.addEventListener('click', refreshGroups);
setInterval(refreshGroups, 20000);

// Poll logs con intervalo moderado
async function pollLogs(){
  try{
    const r = await fetch('/api/panel-logs');
    if(r.ok){
      const { logs=[] } = await r.json();
      outEl.innerHTML = '';
      for(const l of logs){ logLine(l.text || JSON.stringify(l)); }
    }
  }catch{}
  setTimeout(pollLogs, 3000);
}

pollLogs();

// ---- Right panel: groups summary + chat ----
const groupsListEl = document.getElementById('groupsList');
const chatTitleEl = document.getElementById('chatTitle');
const chatMsgsEl = document.getElementById('chatMessages');

function renderGroupItem(g, idx){
  const wrapper = document.createElement('div');
  wrapper.className = 'group-item';
  const head = document.createElement('div');
  head.className = 'group-head';
  const name = document.createElement('div');
  name.className = 'group-name';
  name.textContent = g.name || g.id;
  const last = document.createElement('div');
  last.className = 'group-last';
  last.textContent = g.last ? `${new Date(g.last.time).toLocaleTimeString()} · ${g.last.text}` : 'sin mensajes';
  head.appendChild(name);
  head.appendChild(last);
  wrapper.appendChild(head);

  const body = document.createElement('div');
  body.className = 'group-body' + (idx < 2 ? ' open' : '');
  // Load last few messages for preview
  (async()=>{
    try{
      const data = await fetchGroupMessages(g.id, 5);
      body.innerHTML = '';
      for(const m of data.messages){
        const d = document.createElement('div');
        d.className = 'msg';
        d.textContent = `${new Date(m.time).toLocaleTimeString()} · ${m.text}`;
        body.appendChild(d);
      }
    }catch{ body.textContent = 'error'; }
  })();
  wrapper.appendChild(body);

  head.addEventListener('click', ()=>{
    body.classList.toggle('open');
    // Set as current chat
    openChat(g.id, g.name || g.id);
  });

  return wrapper;
}

async function renderGroupsSummary(){
  try{
    const { groups=[] } = await fetchGroupSummary();
    groupsListEl.innerHTML = '';
    groups.forEach((g, idx)=>{
      groupsListEl.appendChild(renderGroupItem(g, idx));
    });
  }catch{}
}

async function openChat(id, title){
  currentChatGroupId = id;
  chatTitleEl.textContent = title;
  try{
    const data = await fetchGroupMessages(id, 50);
    chatMsgsEl.innerHTML = '';
    for(const m of data.messages){
      const d = document.createElement('div');
      d.className = 'msg';
      d.textContent = `${new Date(m.time).toLocaleTimeString()} · ${m.text}`;
      chatMsgsEl.appendChild(d);
    }
    chatMsgsEl.scrollTop = chatMsgsEl.scrollHeight;
  }catch{}
}

async function pollChat(){
  if(currentChatGroupId){
    await openChat(currentChatGroupId, chatTitleEl.textContent || currentChatGroupId);
  }
  await renderGroupsSummary();
  setTimeout(pollChat, 4000);
}

pollChat();
