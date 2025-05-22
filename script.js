const apiUrl = "https://api.baserow.io/api/database/rows/table/487909/?user_field_names=true";
const token = "GdJw5jXKGaLpqqizFpNxHxOUpsTNI0sK";
const webhookUrl = "https://n8n-webhook.chinaragomes.com/webhook/reenvia-notificacao";

let dadosOriginais = [];
let oldDados = [];
let filtroAtual = localStorage.getItem("filtroSelecionado") || "todos";
let notificationData = [];
let notificationActive = false;

// -- Filtros
const filtros = [
  { id: "todos", label: "Todos", func: lista => lista },
  { id: "hoje", label: "Agendamentos do Dia", func: lista => {
    const hoje = new Date().toISOString().split("T")[0];
    return lista.filter(i => {
      let [d,m,y] = (i.dataDoAgendamento||"").split("/");
      if (!y) return false;
      let iso = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
      return iso === hoje;
    });
  }},
  { id: "sem resposta", label: "Sem resposta", func: lista => lista.filter(i => !i.resposta || i.resposta.trim() === "") },
  { id: "confirmar", label: "Confirmados", func: lista => lista.filter(i => i.resposta && i.resposta.toLowerCase() === "confirmar") },
  { id: "reagendar", label: "Reagendados", func: lista => lista.filter(i => i.resposta && i.resposta.toLowerCase() === "reagendar") },
  { id: "cancelar", label: "Cancelados", func: lista => lista.filter(i => i.resposta && i.resposta.toLowerCase() === "cancelar") },
  { id: "canceladoSistema", label: "Cancelado pelo sistema", func: lista => lista.filter(i => i.resposta && i.resposta.toLowerCase() === "canceladosistema") },
  { id: "enviadas", label: "Enviadas", func: lista => lista.filter(i => String(i.statusNotificacao || "").toUpperCase() === "ENVIADA") },
  { id: "falhou", label: "Falhou", func: lista => lista.filter(i => String(i.statusNotificacao || "").toUpperCase() !== "ENVIADA") },
  { id: "pago", label: "Pagos", func: lista => [] },
];

function gerarBotoesFiltro() {
  const section = document.getElementById("filters-section");
  section.innerHTML = '';
  filtros.forEach(f => {
    if (f.id === "pago") return;
    section.innerHTML += `<button id="btn-${f.id}" onclick="filtrar('${f.id}')" data-filtro="${f.id}">${f.label} <span class="contador" id="contador-${f.id}">(0/0)</span></button>`;
  });
  section.innerHTML += `<button id="btn-pago" onclick="filtrar('pago')" data-filtro="pago" style="pointer-events:none;opacity:0.5;">Pagos <span class="contador" id="contador-pago">(0/0)</span></button>`;
}
function atualizarContagensFiltros() {
  const total = dadosOriginais.length;
  filtros.forEach(f => {
    let filtrados = (f.id === "todos") ? dadosOriginais : f.func(dadosOriginais);
    let el = document.getElementById(`contador-${f.id}`);
    if (el) el.textContent = `(${filtrados.length}/${total})`;
  });
}

// ======= NOTIFICAÇÃO (correção clique: mostra mensagens reais SEM limpar notificationData no click) ======
// Atualiza notificationData, cada vez que dados mudam
function atualizarNotificacoes(novosDados) {
  let novo = [], editados = [];
  let oldMap = {};
  if (oldDados && Array.isArray(oldDados)) oldDados.forEach(i => { oldMap[i.id] = i; });
  novosDados.forEach(n => {
    if (!oldMap[n.id]) novo.push(n);
    else if (JSON.stringify(n) !== JSON.stringify(oldMap[n.id])) editados.push(n);
  });

  if (novo.length || editados.length) {
    notificationData = [];
    if (novo.length)
      notificationData.push({tipo: "Novos", lista: novo.map(n => n.clienteId)});
    if (editados.length)
      notificationData.push({tipo: "Atualizados", lista: editados.map(n => n.clienteId)});
    ativarNotificacao();
  }
  oldDados = JSON.parse(JSON.stringify(novosDados));
}

function ativarNotificacao() {
  notificationActive = true;
  document.getElementById("notification-dot").style.display = 'inline-block';
}

function desativarNotificacao() {
  notificationActive = false;
  document.getElementById("notification-dot").style.display = 'none';
  // NÃO limpa notificationData aqui, só ao nova atualização!
}

function toggleNotificationPanel() {
  let panel = document.getElementById("notification-panel");
  // Se já aberto, fecha
  if (panel.style.display === 'block') {
    panel.style.display = 'none';
    return;
  }
  let ul = document.getElementById("notification-content");
  ul.innerHTML = '';
  if (!notificationData.length) {
    ul.innerHTML = '<li>Nenhuma atualização recente.</li>';
  } else {
    notificationData.forEach(obj => {
      ul.innerHTML += `<li><strong>${obj.tipo}:</strong> ${obj.lista.join(', ')}</li>`;
    });
  }
  panel.style.display = 'block';
  desativarNotificacao();
}
document.addEventListener('mousedown', function(event) {
  const panel = document.getElementById('notification-panel');
  const btn = document.getElementById('notification-btn');
  if (!panel.contains(event.target) && !btn.contains(event.target)) {
    panel.style.display = 'none';
  }
});
// ======= Fim NOTIFICAÇÃO =======

async function buscarDados() {
  const res = await fetch(apiUrl, {
    headers: { Authorization: `Token ${token}` },
  });
  const { results } = await res.json();
  atualizarNotificacoes(results);
  dadosOriginais = results;
  gerarBotoesFiltro();
  atualizarContagensFiltros();
  aplicarFiltro(filtroAtual);
}

function atualizarDashboard(results) {
  const statsBase = dadosOriginais.length ? dadosOriginais : [];
  const total = statsBase.length || 1;
  const respostasPreenchidas = statsBase.filter(
    item => item.resposta && item.resposta.trim() !== ""
  );
  const respostasVazias = statsBase.filter(
    item => !item.resposta || item.resposta.trim() === ""
  );
  const statusEnviado = statsBase.filter(
    item => String(item.statusNotificacao || "").toUpperCase() === "ENVIADA"
  );
  const statusFalhou = statsBase.filter(
    item => String(item.statusNotificacao || "").toUpperCase() !== "ENVIADA"
  );

  document.getElementById("respostas-ok").innerText = `${((respostasPreenchidas.length/total)*100).toFixed(1)}%`;
  document.getElementById("respostas-vazias").innerText = `${((respostasVazias.length/total)*100).toFixed(1)}%`;
  document.getElementById("status-enviado").innerText = `${((statusEnviado.length/total)*100).toFixed(1)}%`;
  document.getElementById("status-falhou").innerText = `${((statusFalhou.length/total)*100).toFixed(1)}%`;

  renderizarBlocos(results);
}

function statusRespostaTransform(resposta) {
  if (!resposta || resposta.trim() === "") return "SEM RESPOSTA";
  const st = resposta.toLowerCase();
  if (st === "confirmar") return "CONFIRMADO";
  if (st === "reagendar") return "REAGENDADO";
  if (st === "cancelar") return "CANCELADO";
  if (st === "canceladosistema") return "CANCELADO P. SISTEMA";
  return resposta.toUpperCase();
}
function corResposta(resposta) {
  if (!resposta || resposta.trim() === "") return "cinza";
  const st = resposta.toLowerCase();
  if (st === "confirmar") return "verde";
  if (st === "reagendar") return "azul";
  if (st === "cancelar" || st === "canceladosistema") return "vermelho";
  return "cinza";
}
function statusNotificacaoIcon(status) {
  if (String(status || '').toUpperCase() === "ENVIADA") {
    return `<span class="envio-check" title="Enviada">✅</span>`;
  } else {
    return `<span class="envio-fail" title="Falhou">❌</span>`;
  }
}
function getCountdownString_Hoje() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7,0,0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59);
  if (now > end) return "00:00:00";
  if (now < start) {
    let diff = Math.floor((end - start) / 1000);
    return formatTime(diff);
  }
  let diff = Math.floor((end - now) / 1000);
  if (diff < 0) diff = 0;
  return formatTime(diff);
}
function formatTime(s) {
  let h = Math.floor(s/3600);
  let m = Math.floor((s%3600)/60);
  let sec = s%60;
  return [h,m,sec].map(i=>i<10?"0"+i:i).join(":");
}
function addCopyBtn(html, value, id) {
  const idBtn = `copy-btn-${id}`;
  return `${html} <button class="copy-btn" onclick="copiarCampo('${value}','${idBtn}')" id="${idBtn}" title="Copiar"><svg width="15" height="15" viewBox="0 0 24 24" style="vertical-align: middle;" fill="none"><path d="M8 16h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v4" stroke="#bbb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="2" y="12" width="8" height="8" rx="2" stroke="#bbb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
}

function atualizarCronometrosHoje() {
  document.querySelectorAll('.cronometro-row').forEach(div => {
    div.querySelector('.cronometro-txt').textContent = getCountdownString_Hoje();
  });
}

// --- NOVO: Função do botão para enviar webhook ---
function reenviaNotificacao(clienteId, btnId) {
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Enviando...";
  }
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clienteId: clienteId })
  })
  .then(res => res.json().catch(()=>res.text()))
  .then(data => {
    showPopupMsg("✅ Notificação reenviada!", true);
  })
  .catch(e => {
    showPopupMsg("❌ Falha ao enviar notificação.", false);
  })
  .finally(()=>{
    if (btn) {
      setTimeout(()=>{
        btn.disabled = false;
        btn.textContent = "Reenviar notif.";
      }, 1400);
    }
  });
}
function showPopupMsg(msg, ok) {
  // Mensagem visual central
  const div = document.getElementById("popup-msg");
  div.innerHTML = msg;
  div.style.display = "block";
  div.style.background = ok ? "#235d36" : "#7f1d1d";
  div.style.color = "#fff";
  div.style.position = "fixed";
  div.style.top = "22%";
  div.style.left = "50%";
  div.style.transform = "translateX(-50%)";
  div.style.padding = "12px 34px";
  div.style.zIndex = 3000;
  div.style.borderRadius = "8px";
  div.style.boxShadow = "0 2px 12px rgba(0,0,0,.36)";
  setTimeout(()=>{div.style.display="none";}, 2600);
}

function renderizarBlocos(lista) {
  if (window.cronometroInt) clearInterval(window.cronometroInt);
  const container = document.getElementById("dados");
  container.innerHTML = "";
  const ordem = [
    item => !item.resposta || item.resposta.trim() === "",
    item => item.resposta && item.resposta.toLowerCase() === "confirmar",
    item => item.resposta && item.resposta.toLowerCase() === "reagendar",
    item => item.resposta && item.resposta.toLowerCase() === "cancelar",
    item => item.resposta && item.resposta.toLowerCase() === "canceladosistema",
    () => true 
  ];
  const ordenados = [...lista].sort((a, b) => {
    for (let i = 0; i < ordem.length; i++) {
      const fn = ordem[i];
      const aCheck = fn(a);
      const bCheck = fn(b);
      if (aCheck !== bCheck) {
        return aCheck ? -1 : 1;
      }
    }
    return 0;
  });
  ordenados.forEach(item => {
    let cor = corResposta(item.resposta);
    let statusTexto = statusRespostaTransform(item.resposta);
    let uniqueId = String(item.id).replace(/\D/g,'') + Math.random().toString().slice(2);
    let html = `
      <div class="item-info">
        <strong>ID Cliente:</strong> ${addCopyBtn(item.clienteId||'', item.clienteId||'', `id-${uniqueId}`)}
      </div>
      <div class="item-info">
        <strong>Nome:</strong> ${item.nomeCliente || ''}
      </div>
      <div class="item-info">
        <strong>WhatsApp:</strong> ${addCopyBtn(item.whatsApp||'', item.whatsApp||'', `wpp-${uniqueId}`)}
      </div>
      <div class="item-info">
        <strong>Data do agendamento:</strong> ${item.dataDoAgendamento || ''}
      </div>
      <div class="status ${cor}">
        ${statusTexto}
        ${statusNotificacaoIcon(item.statusNotificacao)}
      </div>
    `;
    if (!item.resposta || item.resposta.trim() === "") {
      // Botão de reenvio de notificação
      let btnId = `btn-reenviar-${uniqueId}`;
      html += `
        <div class="cronometro-row">
          <span><strong>Tempo para confirmação:</strong></span> <span class="cronometro-txt">${getCountdownString_Hoje()}</span>
          <button class="reenvio-btn" id="${btnId}" onclick="reenviaNotificacao('${item.clienteId}','${btnId}')">Reenviar notif.</button>
        </div>
      `;
    }
    const bloco = document.createElement("div");
    bloco.className = "item";
    bloco.innerHTML = html;
    container.appendChild(bloco);
  });
  window.cronometroInt = setInterval(atualizarCronometrosHoje, 1000);
}
function aplicarFiltro(filtro) {
  filtroAtual = filtro;
  localStorage.setItem("filtroSelecionado", filtro);

  document.querySelectorAll(".filters button").forEach(btn => {
    btn.classList.remove("active");
    if (btn.getAttribute("data-filtro") === filtro) {
      btn.classList.add("active");
    }
  });

  let filtrados = [];
  const filtroObj = filtros.find(f => f.id === filtro);
  if (!filtroObj) {
    filtrados = dadosOriginais;
  } else if (filtro === "todos") {
    filtrados = dadosOriginais;
  } else {
    filtrados = filtroObj.func(dadosOriginais);
  }

  atualizarContagensFiltros();
  atualizarDashboard(filtrados);
}
function filtrar(filtro) { aplicarFiltro(filtro); }

// Copiar
window.copiarCampo = function (valor, idBtn) {
  navigator.clipboard.writeText(valor).then(() => {
    let btn = document.getElementById(idBtn);
    if (!btn) return;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" style="vertical-align: middle;" fill="none"><path d="M20 6L9 17l-5-5" stroke="#4CAF50" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    setTimeout(() => {
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" style="vertical-align: middle;" fill="none"><path d="M8 16h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v4" stroke="#bbb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="2" y="12" width="8" height="8" rx="2" stroke="#bbb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }, 1200);
  });
}

window.onload = function () {
  document.getElementById('currentYear').textContent = new Date().getFullYear();
};
buscarDados();
setInterval(buscarDados, 5000);
