// =============================================================
// CRM Dashboard Profissional — Módulo de Análise Comercial
// Evolução do CRM existente. Não altera outras funcionalidades.
// =============================================================

(function () {
    'use strict';

    // ---- Configuração das etapas do funil (inclui PERDIDO) ----
    const CRM_ETAPAS = [
        { status: 'novo',       label: 'Novo',       color: '#a78bfa', bg: 'rgba(111,66,193,0.15)' },
        { status: 'contatado',  label: 'Em Contato', color: '#60a5fa', bg: 'rgba(59,130,246,0.15)' },
        { status: 'negociando', label: 'Proposta',    color: '#fbbf24', bg: 'rgba(217,119,6,0.15)' },
        { status: 'ganho',      label: 'Fechado',    color: '#4ade80', bg: 'rgba(22,163,74,0.15)' },
        { status: 'perdido',    label: 'Perdido',     color: '#f87171', bg: 'rgba(220,38,38,0.15)' }
    ];

    const ORIGENS = ['Instagram','Facebook','WhatsApp','Google','Site','Indicação','Tráfego pago','Tráfego orgânico','Outros'];
    const MOTIVOS_PERDA = ['Preço','Escolheu concorrente','Sem interesse','Prazo','Serviço não adequado','Não respondeu','Outro'];
    const TIPOS_ATIVIDADE = ['Ligação','WhatsApp','E-mail','Reunião','Proposta','Retorno','Tarefa'];

    let crmCharts = {};
    let crmContatos = [];
    let crmTarefas = [];
    let crmFiltros = { responsavel: '', etapa: '', origem: '', servico: '', status: '', periodo: '90' };

    // ---- Helpers ----
    function fmtMoeda(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function fmtData(d) { return d ? new Date(d).toLocaleDateString('pt-BR') : '—'; }
    function fmtDataHora(d) { return d ? new Date(d).toLocaleString('pt-BR') : '—'; }
    function esc(s) { return String(s ?? '').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
    function avgDays(arr) { if (!arr.length) return 0; return +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1); }

    function filtrarContatos() {
        return crmContatos.filter(c => {
            if (crmFiltros.responsavel && c.responsavel !== crmFiltros.responsavel) return false;
            if (crmFiltros.etapa && c.status !== crmFiltros.etapa) return false;
            if (crmFiltros.origem && (c.origem || 'nao_informado') !== crmFiltros.origem) return false;
            if (crmFiltros.servico && c.servico_interesse !== crmFiltros.servico) return false;
            if (crmFiltros.status && c.tipo !== crmFiltros.status) return false;
            if (crmFiltros.periodo !== 'all') {
                const dias = parseInt(crmFiltros.periodo);
                if (dias && c.datacriacao) {
                    const diff = (Date.now() - new Date(c.datacriacao).getTime()) / 86400000;
                    if (diff > dias) return false;
                }
            }
            return true;
        });
    }

    function destruirChart(id) { if (crmCharts[id]) { crmCharts[id].destroy(); delete crmCharts[id]; } }

    // ---- Cálculo de indicadores ----
    function calcularStats(contatos) {
        const total = contatos.length;
        const leads = contatos.filter(c => c.tipo === 'lead').length;
        const clientes = contatos.filter(c => c.tipo === 'cliente').length;
        const ganhos = contatos.filter(c => c.status === 'ganho').length;
        const perdidos = contatos.filter(c => c.status === 'perdido').length;
        const emAndamento = contatos.filter(c => ['novo', 'contatado', 'negociando'].includes(c.status)).length;
        const valorTotal = contatos.filter(c => c.status !== 'perdido').reduce((s, c) => s + Number(c.valor_proposta || 0), 0);
        const valorFechado = contatos.filter(c => c.status === 'ganho').reduce((s, c) => s + Number(c.valor_proposta || 0), 0);

        const etapas = CRM_ETAPAS.map(e => {
            const count = contatos.filter(c => c.status === e.status).length;
            return { etapa: e.status, label: e.label, quantidade: count, percentual: total > 0 ? +(count / total * 100).toFixed(1) : 0 };
        });

        const totalProposta = contatos.filter(c => ['negociando', 'ganho', 'perdido'].includes(c.status)).length;
        const convLeadCliente = total > 0 ? +(clientes / total * 100).toFixed(1) : 0;
        const convLeadProposta = total > 0 ? +(totalProposta / total * 100).toFixed(1) : 0;
        const convPropostaFechado = totalProposta > 0 ? +(ganhos / totalProposta * 100).toFixed(1) : 0;
        const convGeral = total > 0 ? +(ganhos / total * 100).toFixed(1) : 0;

        const t1 = avgDays(contatos.filter(c => c.datacriacao && c.data_primeiro_contato).map(c => (new Date(c.data_primeiro_contato) - new Date(c.datacriacao)) / 86400000));
        const t2 = avgDays(contatos.filter(c => c.data_primeiro_contato && c.data_proposta).map(c => (new Date(c.data_proposta) - new Date(c.data_primeiro_contato)) / 86400000));
        const t3 = avgDays(contatos.filter(c => c.data_proposta && c.data_fechamento).map(c => (new Date(c.data_fechamento) - new Date(c.data_proposta)) / 86400000));
        const t4 = avgDays(contatos.filter(c => c.datacriacao && c.data_fechamento).map(c => (new Date(c.data_fechamento) - new Date(c.datacriacao)) / 86400000));

        const fontesMap = {};
        contatos.forEach(c => { const o = c.origem || 'nao_informado'; fontesMap[o] = (fontesMap[o] || 0) + 1; });
        const fontes = Object.entries(fontesMap).map(([origem, count]) => ({ origem, count }));

        const motivosMap = {};
        contatos.filter(c => c.status === 'perdido').forEach(c => { const m = c.motivo_perda || 'nao_informado'; motivosMap[m] = (motivosMap[m] || 0) + 1; });
        const motivos = Object.entries(motivosMap).map(([motivo, count]) => ({ motivo, count }));

        return { total, leads, clientes, ganhos, perdidos, emAndamento, valorTotal, valorFechado,
                 etapas, conversao: { convLeadCliente, convLeadProposta, convPropostaFechado, convGeral },
                 tempoMedio: { t1, t2, t3, t4 }, fontes, motivos };
    }

    // ---- Renderização dos cards ----
    function renderCards(stats) {
        const cards = [
            { label: 'Total de Contatos', value: stats.total, sub: 'cadastros', icon: 'users', color: 'rgba(59,130,246,0.15)', ic: '#60a5fa' },
            { label: 'Leads', value: stats.leads, sub: 'em prospecção', icon: 'user-plus', color: 'rgba(217,119,6,0.15)', ic: '#fbbf24' },
            { label: 'Clientes', value: stats.clientes, sub: 'convertidos', icon: 'user-check', color: 'rgba(22,163,74,0.15)', ic: '#4ade80' },
            { label: 'Negócios Ganhos', value: stats.ganhos, sub: 'fechados', icon: 'trophy', color: 'rgba(22,163,74,0.15)', ic: '#4ade80' },
            { label: 'Em Andamento', value: stats.emAndamento, sub: 'em negociação', icon: 'loader', color: 'rgba(59,130,246,0.15)', ic: '#60a5fa' },
            { label: 'Negócios Perdidos', value: stats.perdidos, sub: 'não convertidos', icon: 'x-circle', color: 'rgba(220,38,38,0.15)', ic: '#f87171' }
        ];
        document.getElementById('crm-cards').innerHTML = cards.map(c => `
            <div class="metric-card">
                <div class="metric-card-top">
                    <div class="metric-label">${c.label}</div>
                    <div class="metric-icon" style="background:${c.color};color:${c.ic};"><i data-lucide="${c.icon}"></i></div>
                </div>
                <div class="metric-value">${c.value}</div>
                <div class="metric-sub">${c.sub}</div>
            </div>`).join('');
    }

    // ---- Gráfico: Negociações por status ao longo do tempo ----
    function renderChartSeries(contatos) {
        const ctx = document.getElementById('crm-chart-series');
        if (!ctx) return;
        destruirChart('series');

        const dias = parseInt(crmFiltros.periodo) || 90;
        const labels = [], ganhos = [], perdidos = [], andamento = [], total = [];
        const hoje = new Date();
        for (let i = dias - 1; i >= 0; i--) {
            const d = new Date(hoje); d.setDate(d.getDate() - i);
            const dStr = d.toISOString().slice(0, 10);
            labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
            const doDia = contatos.filter(c => c.datacriacao && c.datacriacao.toISOString().slice(0, 10) === dStr);
            ganhos.push(doDia.filter(c => c.status === 'ganho').length);
            perdidos.push(doDia.filter(c => c.status === 'perdido').length);
            andamento.push(doDia.filter(c => ['novo', 'contatado', 'negociando'].includes(c.status)).length);
            total.push(doDia.length);
        }
        crmCharts.series = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [
                { label: 'Ganhas', data: ganhos, borderColor: '#4ade80', backgroundColor: 'rgba(74,222,128,0.08)', tension: 0.3, fill: true },
                { label: 'Perdidas', data: perdidos, borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.08)', tension: 0.3, fill: true },
                { label: 'Em andamento', data: andamento, borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.08)', tension: 0.3, fill: true },
                { label: 'Total', data: total, borderColor: '#a78bfa', borderDash: [5, 5], tension: 0.3, fill: false }
            ]},
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#a0a5b1', font: { size: 11 } } } },
                scales: { x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                          y: { ticks: { color: '#6b7280', font: { size: 10 }, precision: 0 }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true } } }
        });
    }

    // ---- Gráfico: Fontes dos leads (doughnut) ----
    function renderChartFontes(fontes) {
        const ctx = document.getElementById('crm-chart-fontes');
        if (!ctx) return;
        destruirChart('fontes');
        const labels = fontes.map(f => f.origem === 'nao_informado' ? 'Não informado' : f.origem);
        const data = fontes.map(f => f.count);
        const colors = ['#a78bfa','#60a5fa','#fbbf24','#4ade80','#f87171','#ec4899','#14b8a6','#f97316','#8b5cf6','#6b7280'];
        crmCharts.fontes = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#a0a5b1', font: { size: 11 }, padding: 10 } } } }
        });
    }

    // ---- Gráfico: Motivos de perda (barra horizontal) ----
    function renderChartMotivos(motivos) {
        const ctx = document.getElementById('crm-chart-motivos');
        if (!ctx) return;
        destruirChart('motivos');
        const labels = motivos.map(m => m.motivo === 'nao_informado' ? 'Não informado' : m.motivo);
        const data = motivos.map(m => m.count);
        crmCharts.motivos = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: '#f87171', borderRadius: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } },
                scales: { x: { ticks: { color: '#6b7280', precision: 0 }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true },
                          y: { ticks: { color: '#a0a5b1', font: { size: 11 } }, grid: { display: false } } } }
        });
    }

    // ---- Tabela de análise por etapa ----
    function renderEtapaTable(etapas) {
        const tb = document.getElementById('crm-etapa-tbody');
        if (!tb) return;
        if (!etapas.length) { tb.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-muted);">Sem dados.</td></tr>'; return; }
        tb.innerHTML = etapas.map(e => `
            <tr>
                <td><span class="badge" style="background:${CRM_ETAPAS.find(x=>x.status===e.etapa)?.bg};color:${CRM_ETAPAS.find(x=>x.status===e.etapa)?.color};">${e.label}</span></td>
                <td style="font-weight:600;">${e.quantidade}</td>
                <td>${e.percentual}%</td>
            </tr>`).join('');
    }

    // ---- Indicadores de conversão e tempo médio ----
    function renderConversao(conv, tm) {
        const el = document.getElementById('crm-conversao');
        if (!el) return;
        el.innerHTML = `
            <div class="crm-mini-card"><div class="crm-mini-value" style="color:#4ade80;">${conv.convLeadCliente}%</div><div class="crm-mini-label">Lead → Cliente</div></div>
            <div class="crm-mini-card"><div class="crm-mini-value" style="color:#60a5fa;">${conv.convLeadProposta}%</div><div class="crm-mini-label">Lead → Proposta</div></div>
            <div class="crm-mini-card"><div class="crm-mini-value" style="color:#fbbf24;">${conv.convPropostaFechado}%</div><div class="crm-mini-label">Proposta → Fechado</div></div>
            <div class="crm-mini-card"><div class="crm-mini-value" style="color:#a78bfa;">${conv.convGeral}%</div><div class="crm-mini-label">Conversão Geral</div></div>`;
        const elT = document.getElementById('crm-tempo');
        if (!elT) return;
        elT.innerHTML = `
            <div class="crm-mini-card"><div class="crm-mini-value">${tm.t1} <span class="crm-mini-unit">dias</span></div><div class="crm-mini-label">Criação → 1º contato</div></div>
            <div class="crm-mini-card"><div class="crm-mini-value">${tm.t2} <span class="crm-mini-unit">dias</span></div><div class="crm-mini-label">1º contato → Proposta</div></div>
            <div class="crm-mini-card"><div class="crm-mini-value">${tm.t3} <span class="crm-mini-unit">dias</span></div><div class="crm-mini-label">Proposta → Fechamento</div></div>
            <div class="crm-mini-card"><div class="crm-mini-value">${tm.t4} <span class="crm-mini-unit">dias</span></div><div class="crm-mini-label">Tempo total</div></div>`;
    }

    // ---- Dashboard gerencial (valores) ----
    function renderGerencial(stats) {
        const el = document.getElementById('crm-gerencial');
        if (!el) return;
        el.innerHTML = `
            <div class="crm-mini-card"><div class="crm-mini-value">${stats.leads}</div><div class="crm-mini-label">Total de Leads</div></div>
            <div class="crm-mini-card"><div class="crm-mini-value">${stats.clientes}</div><div class="crm-mini-label">Clientes</div></div>
            <div class="crm-mini-card"><div class="crm-mini-value">${stats.emAndamento}</div><div class="crm-mini-label">Neg. em Andamento</div></div>
            <div class="crm-mini-card"><div class="crm-mini-value" style="color:#4ade80;">${stats.ganhos}</div><div class="crm-mini-label">Negócios Ganhos</div></div>
            <div class="crm-mini-card"><div class="crm-mini-value" style="color:#f87171;">${stats.perdidos}</div><div class="crm-mini-label">Negócios Perdidos</div></div>
            <div class="crm-mini-card"><div class="crm-mini-value" style="font-size:18px;">${fmtMoeda(stats.valorTotal)}</div><div class="crm-mini-label">Valor das Oportunidades</div></div>
            <div class="crm-mini-card"><div class="crm-mini-value" style="font-size:18px;color:#4ade80;">${fmtMoeda(stats.valorFechado)}</div><div class="crm-mini-label">Valor Fechado</div></div>`;
    }

    // ---- Kanban ----
    function renderKanban(contatos) {
        const board = document.getElementById('crm-kanban');
        if (!board) return;
        board.innerHTML = CRM_ETAPAS.map(etapa => {
            const cards = contatos.filter(c => c.status === etapa.status);
            return `
                <div class="kanban-column">
                    <div class="kanban-column-header">
                        <span class="kanban-column-title" style="color:${etapa.color};">${etapa.label}</span>
                        <span class="kanban-column-count" style="background:${etapa.bg};color:${etapa.color};">${cards.length}</span>
                    </div>
                    <div class="kanban-cards" data-status="${etapa.status}" ondragover="crmKanbanDragOver(event)" ondrop="crmKanbanDrop(event,'${etapa.status}')" ondragleave="crmKanbanDragLeave(event)">
                        ${cards.length === 0 ? '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">Arraste aqui</div>' : cards.map(c => `
                        <div class="kanban-card" draggable="true" ondragstart="crmKanbanDragStart(event,${c.id})" ondragend="crmKanbanDragEnd(event)" onclick="abrirFichaCRM(${c.id})">
                            <div class="kanban-card-name">${esc(c.nome)}</div>
                            ${c.empresa ? `<div class="kanban-card-info"><i data-lucide="building-2" style="width:11px;height:11px;display:inline;vertical-align:middle;"></i> ${esc(c.empresa)}</div>` : ''}
                            ${c.telefone ? `<div class="kanban-card-info"><i data-lucide="phone" style="width:11px;height:11px;display:inline;vertical-align:middle;"></i> ${esc(c.telefone)}</div>` : ''}
                            ${c.email ? `<div class="kanban-card-info"><i data-lucide="mail" style="width:11px;height:11px;display:inline;vertical-align:middle;"></i> ${esc(c.email)}</div>` : ''}
                            ${c.servico_interesse ? `<div class="kanban-card-info" style="color:#fbbf24;"><i data-lucide="briefcase" style="width:11px;height:11px;display:inline;vertical-align:middle;"></i> ${esc(c.servico_interesse)}</div>` : ''}
                            ${Number(c.valor_proposta) > 0 ? `<div class="kanban-card-info" style="color:#4ade80;font-weight:600;"><i data-lucide="dollar-sign" style="width:11px;height:11px;display:inline;vertical-align:middle;"></i> ${fmtMoeda(c.valor_proposta)}</div>` : ''}
                            ${c.responsavel ? `<div class="kanban-card-info"><i data-lucide="user" style="width:11px;height:11px;display:inline;vertical-align:middle;"></i> ${esc(c.responsavel)}</div>` : ''}
                            ${c.proxima_tarefa ? `<div class="kanban-card-info" style="color:#60a5fa;"><i data-lucide="clock" style="width:11px;height:11px;display:inline;vertical-align:middle;"></i> ${esc(c.proxima_tarefa)}</div>` : ''}
                            <div class="kanban-card-actions" onclick="event.stopPropagation()">
                                <button class="btn-sm btn-sm-blue" onclick="abrirModalCRMEditar(${c.id})">Editar</button>
                                <button class="btn-sm btn-sm-red" onclick="deletarCRM(${c.id})">Excluir</button>
                            </div>
                        </div>`).join('')}
                    </div>
                </div>`;
        }).join('');
    }

    // ---- Tarefas e follow-up ----
    function renderTarefas() {
        const el = document.getElementById('crm-tarefas');
        if (!el) return;
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const atrasadas = crmTarefas.filter(t => t.status === 'pendente' && t.prazo && new Date(t.prazo) < hoje);
        const hojeList = crmTarefas.filter(t => t.status === 'pendente' && t.prazo && new Date(t.prazo).toDateString() === hoje.toDateString());
        const proximas = crmTarefas.filter(t => t.status === 'pendente' && t.prazo && new Date(t.prazo) > hoje);

        function renderGroup(lista, titulo, cor) {
            if (!lista.length) return '';
            return `<div style="margin-bottom:16px;"><div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${cor};margin-bottom:8px;">${titulo} (${lista.length})</div>
                ${lista.map(t => `
                <div class="crm-task-item">
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:13px;">${esc(t.descricao)}</div>
                        <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">
                            ${t.contato_nome ? `👤 ${esc(t.contato_nome)}` : ''} ${t.contato_empresa ? `· 🏢 ${esc(t.contato_empresa)}` : ''}
                            · 📅 ${fmtData(t.prazo)} · 👤 ${esc(t.responsavel || '—')}
                        </div>
                    </div>
                    <span class="badge badge-${t.prioridade === 'urgente' ? 'urgente' : t.prioridade === 'alta' ? 'atencao' : 'grey'}">${(t.prioridade || 'media').toUpperCase()}</span>
                    <button class="btn-sm btn-sm-green" onclick="concluirTarefaCRM(${t.id})">✓</button>
                    <button class="btn-sm btn-sm-red" onclick="deletarTarefaCRM(${t.id})">✕</button>
                </div>`).join('')}
            </div>`;
        }
        el.innerHTML = renderGroup(atrasadas, '🔴 Atrasadas', '#f87171') + renderGroup(hojeList, '🟡 Tarefas de Hoje', '#fbbf24') + renderGroup(proximas, '🟢 Próximas', '#4ade80') ||
            '<div style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma tarefa cadastrada.</div>';
    }

    // ---- Barra de filtros ----
    function renderFiltros() {
        const responsaveis = [...new Set(crmContatos.map(c => c.responsavel).filter(Boolean))];
        const servicos = [...new Set(crmContatos.map(c => c.servico_interesse).filter(Boolean))];
        const el = document.getElementById('crm-filtros');
        if (!el) return;
        el.innerHTML = `
            <select id="crm-f-periodo" onchange="crmAplicarFiltros()">
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="90" selected>Últimos 90 dias</option>
                <option value="365">Este ano</option>
                <option value="all">Todo o período</option>
            </select>
            <select id="crm-f-responsavel" onchange="crmAplicarFiltros()">
                <option value="">Todos responsáveis</option>
                ${responsaveis.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}
            </select>
            <select id="crm-f-etapa" onchange="crmAplicarFiltros()">
                <option value="">Todas as etapas</option>
                ${CRM_ETAPAS.map(e => `<option value="${e.status}">${e.label}</option>`).join('')}
            </select>
            <select id="crm-f-origem" onchange="crmAplicarFiltros()">
                <option value="">Todas as origens</option>
                ${ORIGENS.map(o => `<option value="${o}">${o}</option>`).join('')}
                <option value="nao_informado">Não informado</option>
            </select>
            <select id="crm-f-servico" onchange="crmAplicarFiltros()">
                <option value="">Todos os serviços</option>
                ${servicos.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
            </select>
            <select id="crm-f-status" onchange="crmAplicarFiltros()">
                <option value="">Todos os status</option>
                <option value="lead">Lead</option>
                <option value="prospect">Prospect</option>
                <option value="cliente">Cliente</option>
                <option value="inativo">Inativo</option>
            </select>
            <button class="btn-sm btn-sm-blue" onclick="limparFiltrosCRM()">Limpar</button>`;
        // Sincroniza valores atuais
        document.getElementById('crm-f-periodo').value = crmFiltros.periodo;
        document.getElementById('crm-f-responsavel').value = crmFiltros.responsavel;
        document.getElementById('crm-f-etapa').value = crmFiltros.etapa;
        document.getElementById('crm-f-origem').value = crmFiltros.origem;
        document.getElementById('crm-f-servico').value = crmFiltros.servico;
        document.getElementById('crm-f-status').value = crmFiltros.status;
    }

    // ---- Atualização completa do dashboard ----
    function atualizarDashboard() {
        const contatos = filtrarContatos();
        const stats = calcularStats(contatos);
        renderCards(stats);
        renderChartSeries(contatos);
        renderChartFontes(stats.fontes);
        renderChartMotivos(stats.motivos);
        renderEtapaTable(stats.etapas);
        renderConversao(stats.conversao, stats.tempoMedio);
        renderGerencial(stats);
        renderKanban(contatos);
        renderTarefas();
        if (window.lucide) lucide.createIcons();
    }

    // ---- VIEW principal do CRM (sobrescreve a existente) ----
    views.crm = async function () {
        document.getElementById('content').innerHTML = `
            <h1 class="page-title">CRM — Análise Comercial</h1>
            <p class="page-subtitle">Painel profissional de gestão comercial e relacionamento com clientes</p>

            <!-- Filtros -->
            <div class="crm-filtros-bar" id="crm-filtros"></div>

            <!-- Botões de ação -->
            <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
                <button class="btn-sm btn-sm-blue" onclick="abrirModalCRM()">+ Novo Contato</button>
                <button class="btn-sm btn-sm-green" onclick="abrirModalTarefaCRM()">+ Nova Tarefa</button>
                <button class="btn-sm btn-sm-blue" onclick="exportarCRM('leads')">Exportar Leads</button>
                <button class="btn-sm btn-sm-blue" onclick="exportarCRM('clientes')">Exportar Clientes</button>
                <button class="btn-sm btn-sm-blue" onclick="exportarCRM('ganhos')">Exportar Ganhos</button>
                <button class="btn-sm btn-sm-blue" onclick="exportarCRM('perdidos')">Exportar Perdidos</button>
                <button class="btn-sm btn-sm-blue" onclick="exportarCRM('all')">Exportar Tudo</button>
            </div>

            <!-- Cards principais -->
            <div class="metrics-grid" id="crm-cards"></div>

            <!-- Gráficos -->
            <div class="crm-charts-row">
                <div class="crm-chart-card" style="flex:2;">
                    <div class="crm-chart-title">Negociações por Status ao Longo do Tempo</div>
                    <div style="height:260px;position:relative;"><canvas id="crm-chart-series"></canvas></div>
                </div>
                <div class="crm-chart-card" style="flex:1;">
                    <div class="crm-chart-title">Fontes dos Leads</div>
                    <div style="height:260px;position:relative;"><canvas id="crm-chart-fontes"></canvas></div>
                </div>
            </div>

            <div class="crm-charts-row">
                <div class="crm-chart-card" style="flex:1;">
                    <div class="crm-chart-title">Motivos de Perda</div>
                    <div style="height:220px;position:relative;"><canvas id="crm-chart-motivos"></canvas></div>
                </div>
                <div class="crm-chart-card" style="flex:1;">
                    <div class="crm-chart-title">Dashboard Gerencial</div>
                    <div class="crm-mini-grid" id="crm-gerencial"></div>
                </div>
            </div>

            <!-- Conversão e tempo médio -->
            <div class="crm-charts-row">
                <div class="crm-chart-card" style="flex:1;">
                    <div class="crm-chart-title">Taxa de Conversão</div>
                    <div class="crm-mini-grid" id="crm-conversao"></div>
                </div>
                <div class="crm-chart-card" style="flex:1;">
                    <div class="crm-chart-title">Tempo Médio de Conversão</div>
                    <div class="crm-mini-grid" id="crm-tempo"></div>
                </div>
            </div>

            <!-- Análise por etapa -->
            <div class="table-card" style="margin-bottom:24px;">
                <div class="table-header"><div><h3>Análise por Etapa</h3></div></div>
                <div style="overflow-x:auto;"><table class="data-table">
                    <thead><tr><th>Etapa</th><th>Quantidade</th><th>Percentual</th></tr></thead>
                    <tbody id="crm-etapa-tbody"></tbody>
                </table></div>
            </div>

            <!-- Funil Kanban -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="font-size:16px;font-weight:700;">Funil de Vendas — Kanban</h3>
                <span style="font-size:12px;color:var(--text-secondary);">Clique em um cartão para ver a ficha completa</span>
            </div>
            <div class="kanban-board" id="crm-kanban"></div>

            <!-- Tarefas e Follow-up -->
            <div class="table-card" style="margin-top:24px;">
                <div class="table-header"><div><h3>Tarefas e Follow-up</h3></div><button class="btn-sm btn-sm-blue" onclick="abrirModalTarefaCRM()">+ Nova Tarefa</button></div>
                <div style="padding:20px;" id="crm-tarefas"></div>
            </div>`;

        try {
            const [contatos, tarefas] = await Promise.all([
                api('/api/crm/contatos'),
                api('/api/crm/tarefas').catch(() => [])
            ]);
            crmContatos = contatos;
            crmTarefas = tarefas;
            renderFiltros();
            atualizarDashboard();
        } catch (e) {
            document.getElementById('crm-kanban').innerHTML = '<div style="color:var(--text-muted);padding:40px;">Erro ao carregar.</div>';
        }
        if (window.lucide) lucide.createIcons();
    };

    // ---- Drag and drop do Kanban ----
    let crmKanbanDragId = null;
    window.crmKanbanDragStart = function (e, id) { crmKanbanDragId = id; e.target.classList.add('dragging'); };
    window.crmKanbanDragEnd = function (e) { e.target.classList.remove('dragging'); };
    window.crmKanbanDragOver = function (e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); };
    window.crmKanbanDragLeave = function (e) { e.currentTarget.classList.remove('drag-over'); };
    window.crmKanbanDrop = async function (e, status) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        if (!crmKanbanDragId) return;
        const id = crmKanbanDragId;
        crmKanbanDragId = null;
        const contato = crmContatos.find(c => c.id == id);
        if (contato && contato.status === status) return;

        if (status === 'perdido') {
            abrirModalPerda(id, status);
            return;
        }
        try {
            await api(`/api/crm/contatos/${id}/etapa`, { method: 'PUT', body: JSON.stringify({ status, responsavel: nomeEscritorio }) });
            contato.status = status;
            if (status === 'ganho') contato.data_fechamento = new Date().toISOString();
            if (status === 'contatado' && !contato.data_primeiro_contato) contato.data_primeiro_contato = new Date().toISOString();
            if (status === 'negociando' && !contato.data_proposta) contato.data_proposta = new Date().toISOString();
            atualizarDashboard();
        } catch (e) { alert(e.message); }
    };

    // ---- Modal de motivo de perda ----
    window.abrirModalPerda = function (id, status) {
        showDynamicModal('Motivo da Perda', `
            <form onsubmit="confirmarPerda(event, ${id})">
                <div class="form-group"><label>Selecione o motivo da perda *</label>
                    <select id="_perda_motivo" required>
                        ${MOTIVOS_PERDA.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
                    <button type="button" class="btn-cancel" onclick="fecharModal('modal-dynamic')">Cancelar</button>
                    <button type="submit" class="btn-submit">Confirmar Perda</button>
                </div>
            </form>`);
    };
    window.confirmarPerda = async function (e, id) {
        e.preventDefault();
        const motivo = document.getElementById('_perda_motivo').value;
        try {
            await api(`/api/crm/contatos/${id}/etapa`, { method: 'PUT', body: JSON.stringify({ status: 'perdido', motivo_perda: motivo, responsavel: nomeEscritorio }) });
            const c = crmContatos.find(x => x.id == id);
            if (c) { c.status = 'perdido'; c.motivo_perda = motivo; }
            fecharModal('modal-dynamic');
            atualizarDashboard();
        } catch (e) { alert(e.message); }
    };

    // ---- Filtros ----
    window.crmAplicarFiltros = function () {
        crmFiltros.periodo = document.getElementById('crm-f-periodo').value;
        crmFiltros.responsavel = document.getElementById('crm-f-responsavel').value;
        crmFiltros.etapa = document.getElementById('crm-f-etapa').value;
        crmFiltros.origem = document.getElementById('crm-f-origem').value;
        crmFiltros.servico = document.getElementById('crm-f-servico').value;
        crmFiltros.status = document.getElementById('crm-f-status').value;
        atualizarDashboard();
    };
    window.limparFiltrosCRM = function () {
        crmFiltros = { responsavel: '', etapa: '', origem: '', servico: '', status: '', periodo: '90' };
        renderFiltros();
        atualizarDashboard();
    };

    // ---- Exportação CSV ----
    window.exportarCRM = function (tipo) {
        window.open(`/api/crm/export?tipo=${tipo}`, '_blank');
    };

    // ---- Tarefas ----
    window.abrirModalTarefaCRM = function () {
        const contatosOpts = crmContatos.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
        showDynamicModal('Nova Tarefa CRM', `
            <form onsubmit="criarTarefaCRM(event)">
                <div class="form-group"><label>Contato (opcional)</label><select id="_tarefa_contato"><option value="">Selecione...</option>${contatosOpts}</select></div>
                <div class="form-group"><label>Descrição *</label><input type="text" id="_tarefa_desc" required placeholder="Descrição da tarefa"></div>
                <div class="form-grid">
                    <div class="form-group"><label>Prazo</label><input type="date" id="_tarefa_prazo"></div>
                    <div class="form-group"><label>Responsável</label><input type="text" id="_tarefa_resp" placeholder="Responsável"></div>
                </div>
                <div class="form-group"><label>Prioridade</label><select id="_tarefa_prio"><option value="urgente">Urgente</option><option value="alta">Alta</option><option value="media" selected>Média</option><option value="baixa">Baixa</option></select></div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;"><button type="button" class="btn-cancel" onclick="fecharModal('modal-dynamic')">Cancelar</button><button type="submit" class="btn-submit">Criar</button></div>
            </form>`);
    };
    window.criarTarefaCRM = async function (e) {
        e.preventDefault();
        try {
            await api('/api/crm/tarefas', { method: 'POST', body: JSON.stringify({
                contato_id: document.getElementById('_tarefa_contato').value || null,
                descricao: document.getElementById('_tarefa_desc').value,
                prazo: document.getElementById('_tarefa_prazo').value || null,
                responsavel: document.getElementById('_tarefa_resp').value,
                prioridade: document.getElementById('_tarefa_prio').value
            })});
            fecharModal('modal-dynamic');
            crmTarefas = await api('/api/crm/tarefas');
            atualizarDashboard();
        } catch (e) { alert(e.message); }
    };
    window.concluirTarefaCRM = async function (id) {
        try { await api(`/api/crm/tarefas/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'concluido' }) }); crmTarefas = await api('/api/crm/tarefas'); atualizarDashboard(); } catch (e) { alert(e.message); }
    };
    window.deletarTarefaCRM = async function (id) {
        if (!confirm('Excluir esta tarefa?')) return;
        try { await api(`/api/crm/tarefas/${id}`, { method: 'DELETE' }); crmTarefas = await api('/api/crm/tarefas'); atualizarDashboard(); } catch (e) { alert(e.message); }
    };

    // ---- Ficha completa do lead/cliente ----
    window.abrirFichaCRM = async function (id) {
        try {
            const [contato, atividades, historico] = await Promise.all([
                api('/api/crm/contatos').then(cs => cs.find(c => c.id == id)),
                api(`/api/crm/contatos/${id}/atividades`).catch(() => []),
                api(`/api/crm/contatos/${id}/historico`).catch(() => [])
            ]);
            if (!contato) return;

            // Busca dados contábeis se vinculado a empresa
            let dadosContabeis = '';
            if (contato.empresa_id) {
                try {
                    const [docs, guias, fin, pend] = await Promise.all([
                        api('/api/documentos').then(d => d.filter(x => x.empresa_id == contato.empresa_id)).catch(() => []),
                        api('/api/guias').then(g => g.filter(x => x.cnpj).catch(() => [])).catch(() => []),
                        api('/api/financeiro').then(f => f.filter(x => x.empresa_id == contato.empresa_id)).catch(() => []),
                        api('/api/pendencias').then(p => p.filter(x => x.empresa_id == contato.empresa_id)).catch(() => [])
                    ]);
                    dadosContabeis = `
                        <div class="crm-ficha-section">
                            <h4>Contabilidade</h4>
                            <div class="crm-ficha-stats">
                                <div class="crm-ficha-stat"><span class="crm-ficha-num">${docs.length}</span><span>Documentos</span></div>
                                <div class="crm-ficha-stat"><span class="crm-ficha-num">${guias.length}</span><span>Guias</span></div>
                                <div class="crm-ficha-stat"><span class="crm-ficha-num">${fin.length}</span><span>Financeiro</span></div>
                                <div class="crm-ficha-stat"><span class="crm-ficha-num">${pend.length}</span><span>Pendências</span></div>
                            </div>
                        </div>`;
                } catch { dadosContabeis = '<div class="crm-ficha-section"><h4>Contabilidade</h4><p style="color:var(--text-muted);">Erro ao carregar dados contábeis.</p></div>'; }
            }

            const etapaAtual = CRM_ETAPAS.find(e => e.status === contato.status);
            showDynamicModal(`Ficha: ${esc(contato.nome)}`, `
                <div class="crm-ficha">
                    <div class="crm-ficha-header">
                        <div>
                            <div style="font-size:18px;font-weight:700;">${esc(contato.nome)}</div>
                            <div style="font-size:13px;color:var(--text-secondary);">${contato.cargo || ''} ${contato.empresa ? '· ' + esc(contato.empresa) : ''}</div>
                        </div>
                        <span class="badge" style="background:${etapaAtual?.bg};color:${etapaAtual?.color};font-size:13px;padding:6px 16px;">${etapaAtual?.label || contato.status}</span>
                    </div>

                    <div class="crm-ficha-grid">
                        <div class="crm-ficha-section">
                            <h4>Dados do Contato</h4>
                            <div class="crm-ficha-row"><span>Telefone</span><b>${esc(contato.telefone || '—')}</b></div>
                            <div class="crm-ficha-row"><span>WhatsApp</span><b>${esc(contato.whatsapp || '—')}</b></div>
                            <div class="crm-ficha-row"><span>E-mail</span><b>${esc(contato.email || '—')}</b></div>
                        </div>
                        <div class="crm-ficha-section">
                            <h4>CRM</h4>
                            <div class="crm-ficha-row"><span>Origem</span><b>${esc(contato.origem || 'Não informado')}</b></div>
                            <div class="crm-ficha-row"><span>Responsável</span><b>${esc(contato.responsavel || '—')}</b></div>
                            <div class="crm-ficha-row"><span>Serviço</span><b>${esc(contato.servico_interesse || '—')}</b></div>
                            <div class="crm-ficha-row"><span>Valor</span><b style="color:#4ade80;">${fmtMoeda(contato.valor_proposta)}</b></div>
                            <div class="crm-ficha-row"><span>Próxima tarefa</span><b>${esc(contato.proxima_tarefa || '—')}</b></div>
                            ${contato.motivo_perda ? `<div class="crm-ficha-row"><span>Motivo perda</span><b style="color:#f87171;">${esc(contato.motivo_perda)}</b></div>` : ''}
                        </div>
                    </div>

                    ${dadosContabeis}

                    <div class="crm-ficha-section">
                        <h4>Histórico de Etapas</h4>
                        ${historico.length === 0 ? '<p style="color:var(--text-muted);font-size:13px;">Sem movimentações registradas.</p>' :
                            `<div class="crm-timeline">${historico.map(h => `
                                <div class="crm-timeline-item">
                                    <div class="crm-timeline-dot"></div>
                                    <div><b>${CRM_ETAPAS.find(e=>e.status===h.etapa_anterior)?.label || h.etapa_anterior}</b> → <b style="color:${CRM_ETAPAS.find(e=>e.status===h.etapa_nova)?.color}">${CRM_ETAPAS.find(e=>e.status===h.etapa_nova)?.label || h.etapa_nova}</b>
                                    <div style="font-size:11px;color:var(--text-muted);">${fmtDataHora(h.data_mudanca)} ${h.responsavel ? '· ' + esc(h.responsavel) : ''}</div></div>
                                </div>`).join('')}</div>`}
                    </div>

                    <div class="crm-ficha-section">
                        <h4>Atividades</h4>
                        <button class="btn-sm btn-sm-blue" style="margin-bottom:10px;" onclick="abrirModalAtividadeCRM(${contato.id})">+ Registrar Atividade</button>
                        ${atividades.length === 0 ? '<p style="color:var(--text-muted);font-size:13px;">Nenhuma atividade registrada.</p>' :
                            atividades.map(a => `
                                <div class="crm-atividade-item">
                                    <span class="badge badge-blue">${esc(a.tipo)}</span>
                                    <div style="flex:1;margin-left:10px;">
                                        <div style="font-size:13px;">${esc(a.descricao)}</div>
                                        <div style="font-size:11px;color:var(--text-muted);">${fmtDataHora(a.data)} · ${esc(a.responsavel || '—')} ${a.resultado ? '· Resultado: ' + esc(a.resultado) : ''}</div>
                                    </div>
                                </div>`).join('')}
                    </div>

                    <div class="crm-ficha-section">
                        <h4>Comunicação</h4>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            ${contato.whatsapp || contato.telefone ? `<a href="https://wa.me/55${(contato.whatsapp || contato.telefone || '').replace(/\\D/g,'')}" target="_blank" class="btn-sm btn-sm-green"><i data-lucide="message-circle" style="width:14px;height:14px;display:inline;"></i> WhatsApp</a>` : ''}
                            ${contato.email ? `<a href="mailto:${esc(contato.email)}" class="btn-sm btn-sm-blue"><i data-lucide="mail" style="width:14px;height:14px;display:inline;"></i> E-mail</a>` : ''}
                            ${contato.empresa_id ? `<button class="btn-sm btn-sm-blue" onclick="navigate('chat');setTimeout(()=>selectChatEmpresa(${contato.empresa_id}),300)"><i data-lucide="message-square" style="width:14px;height:14px;display:inline;"></i> Chat</button>` : ''}
                        </div>
                    </div>

                    ${!contato.empresa_id ? `
                    <div class="crm-ficha-section" style="text-align:center;">
                        <button class="btn-submit" onclick="abrirModalConverterCRM(${contato.id})">Converter em Cliente</button>
                    </div>` : `
                    <div class="crm-ficha-section" style="text-align:center;">
                        <span class="badge badge-green" style="font-size:13px;padding:8px 20px;">✓ Convertido em Cliente</span>
                    </div>`}
                </div>`);
            if (window.lucide) lucide.createIcons();
        } catch (e) { alert(e.message); }
    };

    // ---- Modal de atividade ----
    window.abrirModalAtividadeCRM = function (contatoId) {
        showDynamicModal('Registrar Atividade', `
            <form onsubmit="criarAtividadeCRM(event, ${contatoId})">
                <div class="form-group"><label>Tipo</label><select id="_ativ_tipo">${TIPOS_ATIVIDADE.map(t => `<option value="${t.toLowerCase()}">${t}</option>`).join('')}</select></div>
                <div class="form-group"><label>Descrição *</label><textarea id="_ativ_desc" rows="2" required placeholder="Descrição da atividade..."></textarea></div>
                <div class="form-grid">
                    <div class="form-group"><label>Resultado</label><input type="text" id="_ativ_result" placeholder="Resultado obtido"></div>
                    <div class="form-group"><label>Próxima ação</label><input type="text" id="_ativ_prox" placeholder="Próxima ação"></div>
                </div>
                <div class="form-group"><label>Responsável</label><input type="text" id="_ativ_resp" value="${esc(nomeEscritorio || '')}"></div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;"><button type="button" class="btn-cancel" onclick="fecharModal('modal-dynamic')">Cancelar</button><button type="submit" class="btn-submit">Registrar</button></div>
            </form>`);
    };
    window.criarAtividadeCRM = async function (e, contatoId) {
        e.preventDefault();
        try {
            await api(`/api/crm/contatos/${contatoId}/atividades`, { method: 'POST', body: JSON.stringify({
                tipo: document.getElementById('_ativ_tipo').value,
                descricao: document.getElementById('_ativ_desc').value,
                resultado: document.getElementById('_ativ_result').value,
                proxima_acao: document.getElementById('_ativ_prox').value,
                responsavel: document.getElementById('_ativ_resp').value
            })});
            fecharModal('modal-dynamic');
            abrirFichaCRM(contatoId);
        } catch (e) { alert(e.message); }
    };

    // ---- Modal de conversão lead → cliente ----
    window.abrirModalConverterCRM = function (contatoId) {
        const contato = crmContatos.find(c => c.id == contatoId);
        showDynamicModal('Converter Lead em Cliente', `
            <form onsubmit="confirmarConversaoCRM(event, ${contatoId})">
                <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">O lead será convertido em cliente. Se informar o CNPJ, será criado um cadastro de empresa vinculado (sem duplicar).</p>
                <div class="form-group"><label>CNPJ (opcional — se informado, cria empresa)</label><input type="text" id="_conv_cnpj" placeholder="00.000.000/0001-00" onblur="consultarCnpj(this.value)"></div>
                <div class="form-group"><label>Razão Social</label><input type="text" id="_conv_razao" value="${esc(contato?.empresa || '')}" placeholder="Razão Social"></div>
                <div class="form-group"><label>E-mail da Empresa</label><input type="email" id="_conv_email" value="${esc(contato?.email || '')}" placeholder="empresa@email.com"></div>
                <div class="form-group"><label>Senha Provisória (se criar empresa)</label><input type="text" id="_conv_senha" placeholder="Deixe vazio para gerar depois"></div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;"><button type="button" class="btn-cancel" onclick="fecharModal('modal-dynamic')">Cancelar</button><button type="submit" class="btn-submit">Converter</button></div>
            </form>`);
    };
    window.confirmarConversaoCRM = async function (e, contatoId) {
        e.preventDefault();
        try {
            const r = await api(`/api/crm/contatos/${contatoId}/converter`, { method: 'POST', body: JSON.stringify({
                cnpj: document.getElementById('_conv_cnpj').value || null,
                razao_social: document.getElementById('_conv_razao').value || null,
                email_empresa: document.getElementById('_conv_email').value || null,
                senha: document.getElementById('_conv_senha').value || null,
                responsavel: nomeEscritorio
            })});
            fecharModal('modal-dynamic');
            // Recarrega contatos
            crmContatos = await api('/api/crm/contatos');
            await carregarEmpresasCache();
            atualizarDashboard();
            alert(r.mensagem);
        } catch (e) { alert(e.message); }
    };

    // ---- Sobrescrever modal de criar contato com novos campos ----
    window.abrirModalCRM = function () {
        showDynamicModal('Novo Contato CRM', `
            <form onsubmit="criarCRM(event)">
                <div class="form-group"><label>Nome *</label><input type="text" id="_crm_nome" required placeholder="Nome do contato"></div>
                <div class="form-grid">
                    <div class="form-group"><label>E-mail</label><input type="email" id="_crm_email" placeholder="email@exemplo.com"></div>
                    <div class="form-group"><label>Telefone</label><input type="text" id="_crm_tel" placeholder="(00) 00000-0000"></div>
                </div>
                <div class="form-grid">
                    <div class="form-group"><label>WhatsApp</label><input type="text" id="_crm_wpp" placeholder="(00) 00000-0000"></div>
                    <div class="form-group"><label>Empresa</label><input type="text" id="_crm_empresa" placeholder="Empresa do contato"></div>
                </div>
                <div class="form-grid">
                    <div class="form-group"><label>Cargo</label><input type="text" id="_crm_cargo" placeholder="Cargo"></div>
                    <div class="form-group"><label>Origem</label><select id="_crm_origem"><option value="">Selecione...</option>${ORIGENS.map(o => `<option value="${o}">${o}</option>`).join('')}</select></div>
                </div>
                <div class="form-grid">
                    <div class="form-group"><label>Serviço de Interesse</label><input type="text" id="_crm_servico" placeholder="Ex: Contabilidade, Folha, Fiscal"></div>
                    <div class="form-group"><label>Responsável</label><input type="text" id="_crm_resp" value="${esc(nomeEscritorio || '')}" placeholder="Responsável"></div>
                </div>
                <div class="form-grid">
                    <div class="form-group"><label>Tipo</label><select id="_crm_tipo"><option value="lead">Lead</option><option value="prospect">Prospect</option><option value="cliente">Cliente</option><option value="inativo">Inativo</option></select></div>
                    <div class="form-group"><label>Status</label><select id="_crm_status"><option value="novo">Novo</option><option value="contatado">Contatado</option><option value="negociando">Negociando</option><option value="ganho">Ganho</option><option value="perdido">Perdido</option></select></div>
                </div>
                <div class="form-group"><label>Valor da Proposta (R$)</label><input type="text" id="_crm_valor" placeholder="0,00"></div>
                <div class="form-group"><label>Próxima Tarefa</label><input type="text" id="_crm_prox" placeholder="Próxima ação/tarefa"></div>
                <div class="form-group"><label>Observação</label><textarea id="_crm_obs" rows="2" placeholder="Anotações sobre o contato..."></textarea></div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;"><button type="button" class="btn-cancel" onclick="fecharModal('modal-dynamic')">Cancelar</button><button type="submit" class="btn-submit">Salvar</button></div>
            </form>`);
    };
    window.criarCRM = async function (e) {
        e.preventDefault();
        try {
            await api('/api/crm/contatos', { method: 'POST', body: JSON.stringify({
                nome: document.getElementById('_crm_nome').value,
                email: document.getElementById('_crm_email').value,
                telefone: document.getElementById('_crm_tel').value,
                whatsapp: document.getElementById('_crm_wpp').value,
                empresa: document.getElementById('_crm_empresa').value,
                cargo: document.getElementById('_crm_cargo').value,
                origem: document.getElementById('_crm_origem').value || null,
                servico_interesse: document.getElementById('_crm_servico').value || null,
                responsavel: document.getElementById('_crm_resp').value || null,
                tipo: document.getElementById('_crm_tipo').value,
                status: document.getElementById('_crm_status').value,
                valor_proposta: document.getElementById('_crm_valor').value.replace(/\./g, '').replace(',', '.') || 0,
                proxima_tarefa: document.getElementById('_crm_prox').value || null,
                observacao: document.getElementById('_crm_obs').value
            })});
            fecharModal('modal-dynamic');
            crmContatos = await api('/api/crm/contatos');
            atualizarDashboard();
        } catch (e) { alert(e.message); }
    };

    // ---- Sobrescrever modal de editar contato com novos campos ----
    window.abrirModalCRMEditar = async function (id) {
        try {
            const c = crmContatos.find(x => x.id == id) || (await api('/api/crm/contatos')).find(x => x.id == id);
            if (!c) return;
            showDynamicModal('Editar Contato', `
                <form onsubmit="editarCRM(event, ${id})">
                    <div class="form-group"><label>Nome *</label><input type="text" id="_crm_nome" required value="${esc(c.nome)}"></div>
                    <div class="form-grid">
                        <div class="form-group"><label>E-mail</label><input type="email" id="_crm_email" value="${esc(c.email)}"></div>
                        <div class="form-group"><label>Telefone</label><input type="text" id="_crm_tel" value="${esc(c.telefone)}"></div>
                    </div>
                    <div class="form-grid">
                        <div class="form-group"><label>WhatsApp</label><input type="text" id="_crm_wpp" value="${esc(c.whatsapp || '')}"></div>
                        <div class="form-group"><label>Empresa</label><input type="text" id="_crm_empresa" value="${esc(c.empresa)}"></div>
                    </div>
                    <div class="form-grid">
                        <div class="form-group"><label>Cargo</label><input type="text" id="_crm_cargo" value="${esc(c.cargo || '')}"></div>
                        <div class="form-group"><label>Origem</label><select id="_crm_origem"><option value="">Selecione...</option>${ORIGENS.map(o => `<option value="${o}" ${c.origem === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
                    </div>
                    <div class="form-grid">
                        <div class="form-group"><label>Serviço de Interesse</label><input type="text" id="_crm_servico" value="${esc(c.servico_interesse || '')}"></div>
                        <div class="form-group"><label>Responsável</label><input type="text" id="_crm_resp" value="${esc(c.responsavel || '')}"></div>
                    </div>
                    <div class="form-grid">
                        <div class="form-group"><label>Tipo</label><select id="_crm_tipo">${['lead','prospect','cliente','inativo'].map(t => `<option value="${t}" ${c.tipo === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}</select></div>
                        <div class="form-group"><label>Status</label><select id="_crm_status">${['novo','contatado','negociando','ganho','perdido'].map(s => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}</select></div>
                    </div>
                    <div class="form-group"><label>Valor da Proposta (R$)</label><input type="text" id="_crm_valor" value="${c.valor_proposta ? Number(c.valor_proposta).toFixed(2).replace('.', ',') : ''}"></div>
                    <div class="form-group"><label>Próxima Tarefa</label><input type="text" id="_crm_prox" value="${esc(c.proxima_tarefa || '')}"></div>
                    ${c.status === 'perdido' ? `<div class="form-group"><label>Motivo da Perda</label><select id="_crm_motivo">${MOTIVOS_PERDA.map(m => `<option value="${m}" ${c.motivo_perda === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>` : ''}
                    <div class="form-group"><label>Observação</label><textarea id="_crm_obs" rows="2">${esc(c.observacao || '')}</textarea></div>
                    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;"><button type="button" class="btn-cancel" onclick="fecharModal('modal-dynamic')">Cancelar</button><button type="submit" class="btn-submit">Salvar</button></div>
                </form>`);
        } catch (e) { alert(e.message); }
    };
    window.editarCRM = async function (e, id) {
        e.preventDefault();
        const motivoEl = document.getElementById('_crm_motivo');
        try {
            await api(`/api/crm/contatos/${id}`, { method: 'PUT', body: JSON.stringify({
                nome: document.getElementById('_crm_nome').value,
                email: document.getElementById('_crm_email').value,
                telefone: document.getElementById('_crm_tel').value,
                whatsapp: document.getElementById('_crm_wpp').value,
                empresa: document.getElementById('_crm_empresa').value,
                cargo: document.getElementById('_crm_cargo').value,
                origem: document.getElementById('_crm_origem').value || null,
                servico_interesse: document.getElementById('_crm_servico').value || null,
                responsavel: document.getElementById('_crm_resp').value || null,
                tipo: document.getElementById('_crm_tipo').value,
                status: document.getElementById('_crm_status').value,
                valor_proposta: document.getElementById('_crm_valor').value.replace(/\./g, '').replace(',', '.') || 0,
                proxima_tarefa: document.getElementById('_crm_prox').value || null,
                motivo_perda: motivoEl ? motivoEl.value : undefined,
                observacao: document.getElementById('_crm_obs').value
            })});
            fecharModal('modal-dynamic');
            crmContatos = await api('/api/crm/contatos');
            atualizarDashboard();
        } catch (e) { alert(e.message); }
    };

    // Manter função deletarCRM original funcionando com reload do dashboard
    window.deletarCRM = async function (id) {
        if (!confirm('Excluir este contato?')) return;
        try {
            await api(`/api/crm/contatos/${id}`, { method: 'DELETE' });
            crmContatos = await api('/api/crm/contatos');
            atualizarDashboard();
        } catch (e) { alert(e.message); }
    };

    console.log('✅ Módulo CRM Dashboard carregado.');
})();
