// =============================================================
// ORDEM DE SERVIÇO — Integrada ao CRM
// =============================================================

(function () {
    'use strict';

    const STATUS_OS = [
        { value: 'rascunho',    label: 'Rascunho',     color: '#a0a5b1' },
        { value: 'em_analise',  label: 'Em análise',   color: '#fbbf24' },
        { value: 'aprovada',    label: 'Aprovada',     color: '#60a5fa' },
        { value: 'em_execucao', label: 'Em execução',  color: '#a78bfa' },
        { value: 'concluida',   label: 'Concluída',    color: '#4ade80' },
        { value: 'cancelada',   label: 'Cancelada',    color: '#f87171' }
    ];

    let osLista = [];
    let osBusca = '';
    let osFiltroStatus = '';
    let empresasCache = [];
    let contatosCache = [];

    function esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }
    function fmtData(d) {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('pt-BR');
    }
    function fmtMoeda(v) {
        return parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    function statusInfo(val) {
        return STATUS_OS.find(s => s.value === val) || { label: val, color: '#a0a5b1' };
    }

    const css = `
        <style id="os-styles">
        .os-topo { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; margin-bottom: 24px; }
        .os-card-stat {
            background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(111,66,193,0.06));
            border: 1px solid rgba(59,130,246,0.2);
            border-radius: 14px; padding: 16px 18px; position: relative; overflow: hidden;
        }
        .os-card-stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--text-secondary, #a0a5b1); margin-bottom: 6px; }
        .os-card-stat-value { font-size: 26px; font-weight: 800; color: var(--text-primary, #fff); line-height: 1; }

        .os-toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
        .os-search {
            flex: 1; min-width: 200px;
            display: flex; align-items: center; gap: 10px;
            background: var(--bg-card, #1a1f2b); border: 1px solid var(--border-light, #2a3142);
            border-radius: 12px; padding: 10px 16px;
        }
        .os-search:focus-within { border-color: var(--accent-blue, #3b82f6); box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
        .os-search i { width: 18px; height: 18px; color: var(--text-muted, #6b7280); flex-shrink: 0; }
        .os-search input { flex: 1; background: transparent; border: none; outline: none; color: var(--text-primary, #fff); font-size: 14px; font-family: inherit; }
        .os-search input::placeholder { color: var(--text-muted, #6b7280); }
        .os-select-filtro {
            background: var(--bg-card, #1a1f2b); border: 1px solid var(--border-light, #2a3142);
            border-radius: 12px; padding: 10px 14px; color: var(--text-primary, #fff); font-size: 14px;
            font-family: inherit; outline: none; cursor: pointer;
        }
        .os-btn-new {
            display: flex; align-items: center; gap: 8px;
            background: linear-gradient(135deg, #3b82f6, #6f42c1); color: #fff; border: none;
            border-radius: 12px; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
            transition: transform 0.15s, box-shadow 0.2s; white-space: nowrap; font-family: inherit;
        }
        .os-btn-new:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(59,130,246,0.3); }
        .os-btn-new i { width: 16px; height: 16px; }

        .os-table-wrap { background: var(--bg-card, #1a1f2b); border: 1px solid var(--border-light, #2a3142); border-radius: 16px; overflow: hidden; }
        .os-table { width: 100%; border-collapse: collapse; }
        .os-table th { text-align: left; padding: 14px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text-secondary, #a0a5b1); border-bottom: 1px solid var(--border-light, #2a3142); }
        .os-table td { padding: 14px 16px; font-size: 14px; color: var(--text-primary, #fff); border-bottom: 1px solid rgba(255,255,255,0.04); }
        .os-table tr:hover td { background: rgba(59,130,246,0.04); }
        .os-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .os-btn-mini {
            font-size: 11px; font-weight: 600; padding: 5px 8px; border-radius: 6px;
            border: 1px solid transparent; cursor: pointer; transition: all 0.15s; font-family: inherit;
            display: inline-flex; align-items: center; gap: 4px; line-height: 1;
        }
        .os-btn-mini i { width: 13px; height: 13px; }
        .os-btn-view { background: rgba(59,130,246,0.12); color: #60a5fa; border-color: rgba(59,130,246,0.2); }
        .os-btn-view:hover { background: rgba(59,130,246,0.2); }
        .os-btn-edit { background: rgba(251,191,36,0.12); color: #fbbf24; border-color: rgba(251,191,36,0.2); }
        .os-btn-edit:hover { background: rgba(251,191,36,0.2); }
        .os-btn-del { background: rgba(220,38,38,0.1); color: #f87171; border-color: rgba(220,38,38,0.2); }
        .os-btn-del:hover { background: rgba(220,38,38,0.2); }
        .os-btn-fiscal { background: rgba(34,197,94,0.12); color: #4ade80; border-color: rgba(34,197,94,0.2); }
        .os-btn-fiscal:hover { background: rgba(34,197,94,0.2); }
        .os-empty { text-align: center; color: var(--text-muted, #6b7280); padding: 40px; }

        .os-itens-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .os-itens-table th { text-align: left; padding: 8px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary, #a0a5b1); border-bottom: 1px solid var(--border-light, #2a3142); }
        .os-itens-table td { padding: 8px 10px; font-size: 13px; color: var(--text-primary, #fff); }
        .os-itens-table input { width: 100%; background: var(--bg-body, #0c0f16); border: 1px solid var(--border-light, #2a3142); border-radius: 6px; padding: 6px 8px; color: var(--text-primary, #fff); font-size: 13px; font-family: inherit; }
        .os-itens-table input:focus { border-color: var(--accent-blue, #3b82f6); outline: none; }
        .os-item-row { border-bottom: 1px solid rgba(255,255,255,0.04); }
        .os-item-del { cursor: pointer; color: #f87171; font-size: 16px; padding: 4px 8px; }
        .os-item-del:hover { color: #fca5a5; }
        .os-item-add {
            margin-top: 10px; display: inline-flex; align-items: center; gap: 6px;
            background: rgba(59,130,246,0.1); color: #60a5fa; border: 1px solid rgba(59,130,246,0.2);
            border-radius: 8px; padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
        }
        .os-item-add:hover { background: rgba(59,130,246,0.2); }

        .os-details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .os-details-item { background: var(--bg-body, #0c0f16); border: 1px solid var(--border-light, #2a3142); border-radius: 10px; padding: 12px 14px; }
        .os-details-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted, #6b7280); margin-bottom: 4px; }
        .os-details-value { font-size: 14px; color: var(--text-primary, #fff); font-weight: 500; word-break: break-word; }
        .os-details-full { grid-column: 1 / -1; }

        .os-timeline { margin-top: 16px; }
        .os-timeline-item { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .os-timeline-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent-blue, #3b82f6); margin-top: 5px; flex-shrink: 0; }
        .os-timeline-content { flex: 1; }
        .os-timeline-acao { font-size: 14px; font-weight: 600; color: var(--text-primary, #fff); }
        .os-timeline-detalhe { font-size: 12px; color: var(--text-secondary, #a0a5b1); margin-top: 2px; }
        .os-timeline-data { font-size: 11px; color: var(--text-muted, #6b7280); margin-top: 2px; }

        .os-fiscal-section { margin-top: 20px; padding: 16px; background: rgba(34,197,94,0.04); border: 1px solid rgba(34,197,94,0.15); border-radius: 12px; }
        .os-fiscal-title { font-size: 14px; font-weight: 700; color: #4ade80; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .os-fiscal-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
        .os-fiscal-ok { background: rgba(34,197,94,0.15); color: #4ade80; }
        .os-fiscal-pendente { background: rgba(251,191,36,0.15); color: #fbbf24; }

        @media (max-width: 768px) {
            .os-topo { grid-template-columns: 1fr 1fr; }
            .os-table-wrap { overflow-x: auto; }
            .os-details-grid { grid-template-columns: 1fr; }
        }
        </style>
    `;
    if (!document.getElementById('os-styles')) {
        document.head.insertAdjacentHTML('beforeend', css);
    }

    function filtrar() {
        let lista = osLista;
        if (osFiltroStatus) lista = lista.filter(o => o.status === osFiltroStatus);
        if (osBusca) {
            const q = osBusca.toLowerCase();
            lista = lista.filter(o =>
                (o.numero || '').toLowerCase().includes(q) ||
                (o.empresa_nome || '').toLowerCase().includes(q) ||
                (o.contato_nome || '').toLowerCase().includes(q) ||
                (o.responsavel || '').toLowerCase().includes(q) ||
                (o.descricao || '').toLowerCase().includes(q)
            );
        }
        return lista;
    }

    views['ordens-servico'] = async function () {
        document.getElementById('content').innerHTML = `
            <h1 class="page-title">Ordem de Serviço</h1>
            <p class="page-subtitle">Gerencie ordens de serviço integradas ao CRM</p>
            <div class="os-topo" id="os-topo"></div>
            <div class="os-toolbar">
                <div class="os-search">
                    <i data-lucide="search"></i>
                    <input type="text" id="os-busca-input" placeholder="Pesquisar OS..." value="${esc(osBusca)}">
                </div>
                <select class="os-select-filtro" id="os-filtro-status">
                    <option value="">Todos os status</option>
                    ${STATUS_OS.map(s => `<option value="${s.value}" ${osFiltroStatus === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
                </select>
                <button class="os-btn-new" onclick="osNova()"><i data-lucide="plus"></i> Nova OS</button>
            </div>
            <div id="os-lista"></div>
        `;

        document.getElementById('os-busca-input').addEventListener('input', function () {
            osBusca = this.value;
            renderLista();
        });
        document.getElementById('os-filtro-status').addEventListener('change', function () {
            osFiltroStatus = this.value;
            renderLista();
        });

        try {
            const [osData, emps, contatos] = await Promise.all([
                api('/api/os'),
                api('/api/empresas'),
                api('/api/crm/contatos')
            ]);
            osLista = osData;
            empresasCache = emps;
            contatosCache = contatos;
            renderTopo();
            renderLista();
        } catch (e) {
            document.getElementById('os-lista').innerHTML = '<div class="os-empty">Erro ao carregar ordens de serviço.</div>';
        }
        lucide.createIcons();
    };

    function renderTopo() {
        const total = osLista.length;
        const rascunho = osLista.filter(o => o.status === 'rascunho').length;
        const execucao = osLista.filter(o => o.status === 'em_execucao' || o.status === 'aprovada').length;
        const concluida = osLista.filter(o => o.status === 'concluida').length;
        const valorTotal = osLista.filter(o => o.status !== 'cancelada').reduce((s, o) => s + parseFloat(o.valor_total || 0), 0);
        document.getElementById('os-topo').innerHTML = `
            <div class="os-card-stat"><div class="os-card-stat-label">Total</div><div class="os-card-stat-value">${total}</div></div>
            <div class="os-card-stat"><div class="os-card-stat-label">Rascunho</div><div class="os-card-stat-value">${rascunho}</div></div>
            <div class="os-card-stat"><div class="os-card-stat-label">Em andamento</div><div class="os-card-stat-value">${execucao}</div></div>
            <div class="os-card-stat"><div class="os-card-stat-label">Concluídas</div><div class="os-card-stat-value">${concluida}</div></div>
            <div class="os-card-stat"><div class="os-card-stat-label">Valor Total</div><div class="os-card-stat-value" style="font-size:18px;">${fmtMoeda(valorTotal)}</div></div>
        `;
    }

    function renderLista() {
        const lista = filtrar();
        if (lista.length === 0) {
            document.getElementById('os-lista').innerHTML = '<div class="os-empty">Nenhuma ordem de serviço encontrada.</div>';
            return;
        }
        document.getElementById('os-lista').innerHTML = `
            <div class="os-table-wrap">
                <table class="os-table">
                    <thead>
                        <tr>
                            <th>Nº</th><th>Empresa</th><th>Cliente</th><th>Data</th>
                            <th>Responsável</th><th>Valor</th><th>Status</th><th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(o => {
                            const si = statusInfo(o.status);
                            const podeEditar = ['rascunho', 'em_analise'].includes(o.status);
                            return `
                                <tr>
                                    <td><strong>${esc(o.numero) || '—'}</strong></td>
                                    <td>${esc(o.empresa_nome) || '—'}</td>
                                    <td>${esc(o.contato_nome) || '—'}</td>
                                    <td>${fmtData(o.data)}</td>
                                    <td>${esc(o.responsavel) || '—'}</td>
                                    <td>${fmtMoeda(o.valor_total)}</td>
                                    <td><span class="os-badge" style="background:${si.color}22;color:${si.color};">${si.label}</span></td>
                                    <td style="white-space:nowrap;">
                                        <button class="os-btn-mini os-btn-view" onclick="osDetalhes(${o.id})" title="Detalhes"><i data-lucide="info"></i></button>
                                        ${podeEditar ? `<button class="os-btn-mini os-btn-edit" onclick="osEditar(${o.id})" title="Editar"><i data-lucide="pencil"></i></button>` : ''}
                                        <button class="os-btn-mini os-btn-fiscal" onclick="osPrepararFiscal(${o.id})" title="Preparar emissão fiscal"><i data-lucide="file-text"></i></button>
                                        <button class="os-btn-mini os-btn-del" onclick="osExcluir(${o.id})" title="Excluir"><i data-lucide="trash-2"></i></button>
                                    </td>
                                </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
        lucide.createIcons();
    }

    // ---- Nova OS ----
    window.osNova = function () {
        const empOptions = empresasCache.map(e => `<option value="${e.id}">${esc(e.razaosocial)}</option>`).join('');
        const contatoOptions = contatosCache.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');

        showDynamicModal('Nova Ordem de Serviço', `
            <form onsubmit="osSalvarNova(event)">
                <div class="crm-form-grid">
                    <div class="crm-form-group">
                        <label>Número (auto se vazio)</label>
                        <input type="text" id="os-numero" placeholder="Auto">
                    </div>
                    <div class="crm-form-group">
                        <label>Data</label>
                        <input type="date" id="os-data" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                </div>
                <div class="crm-form-grid">
                    <div class="crm-form-group">
                        <label>Empresa</label>
                        <select id="os-empresa"><option value="">Selecione...</option>${empOptions}</select>
                    </div>
                    <div class="crm-form-group">
                        <label>Cliente (CRM)</label>
                        <select id="os-contato"><option value="">Selecione...</option>${contatoOptions}</select>
                    </div>
                </div>
                <div class="crm-form-group">
                    <label>Responsável</label>
                    <input type="text" id="os-responsavel" placeholder="Responsável pela OS">
                </div>
                <div class="crm-form-group">
                    <label>Descrição</label>
                    <textarea id="os-descricao" rows="2" placeholder="Descrição do serviço..."></textarea>
                </div>
                <div style="margin-top:16px;border-top:1px solid var(--border-light,#2a3142);padding-top:14px;">
                    <strong style="font-size:14px;">Itens / Serviços</strong>
                    <table class="os-itens-table" id="os-itens-table">
                        <thead><tr><th>Descrição</th><th style="width:80px;">Qtd</th><th style="width:110px;">Valor Unit.</th><th style="width:90px;">Desc.</th><th style="width:110px;">Total</th><th style="width:30px;"></th></tr></thead>
                        <tbody id="os-itens-body"></tbody>
                    </table>
                    <button type="button" class="os-item-add" onclick="osAddItem()"><i data-lucide="plus"></i> Adicionar item</button>
                </div>
                <div class="crm-form-grid" style="margin-top:14px;">
                    <div class="crm-form-group">
                        <label>Desconto global</label>
                        <input type="number" id="os-desconto" step="0.01" value="0" oninput="osCalcTotal()">
                    </div>
                    <div class="crm-form-group">
                        <label>Valor total calculado</label>
                        <input type="text" id="os-valor-total" readonly style="font-weight:700;color:#4ade80;">
                    </div>
                </div>
                <div class="crm-form-group">
                    <label>Observações</label>
                    <textarea id="os-obs" rows="2" placeholder="Observações..."></textarea>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
                    <button type="button" class="btn-cancel" onclick="fecharModal('modal-dynamic')">Cancelar</button>
                    <button type="submit" class="btn-submit">Criar OS</button>
                </div>
            </form>
        `);
        osAddItem();
        osCalcTotal();
        lucide.createIcons();
    };

    let osItensTemp = [];

    window.osAddItem = function () {
        const row = document.createElement('tr');
        row.className = 'os-item-row';
        row.innerHTML = `
            <td><input type="text" class="os-item-desc" placeholder="Descrição do item" oninput="osCalcLinha(this)"></td>
            <td><input type="number" class="os-item-qtd" value="1" step="0.01" style="text-align:right;" oninput="osCalcLinha(this)"></td>
            <td><input type="number" class="os-item-vu" value="0" step="0.01" style="text-align:right;" oninput="osCalcLinha(this)"></td>
            <td><input type="number" class="os-item-desc-item" value="0" step="0.01" style="text-align:right;" oninput="osCalcLinha(this)"></td>
            <td><input type="text" class="os-item-vt" readonly style="text-align:right;font-weight:600;"></td>
            <td><span class="os-item-del" onclick="this.parentElement.parentElement.remove();osCalcTotal();">&times;</span></td>
        `;
        document.getElementById('os-itens-body').appendChild(row);
        osCalcTotal();
    };

    window.osCalcLinha = function (row) {
        const tr = row.closest('tr');
        const qtd = parseFloat(tr.querySelector('.os-item-qtd').value) || 0;
        const vu = parseFloat(tr.querySelector('.os-item-vu').value) || 0;
        const desc = parseFloat(tr.querySelector('.os-item-desc-item').value) || 0;
        const vt = qtd * vu - desc;
        tr.querySelector('.os-item-vt').value = fmtMoeda(vt);
        osCalcTotal();
    };

    window.osCalcTotal = function () {
        let total = 0;
        document.querySelectorAll('#os-itens-body tr').forEach(tr => {
            const qtd = parseFloat(tr.querySelector('.os-item-qtd').value) || 0;
            const vu = parseFloat(tr.querySelector('.os-item-vu').value) || 0;
            const desc = parseFloat(tr.querySelector('.os-item-desc-item').value) || 0;
            total += qtd * vu - desc;
        });
        const descontoGlobal = parseFloat(document.getElementById('os-desconto')?.value) || 0;
        total -= descontoGlobal;
        if (total < 0) total = 0;
        const el = document.getElementById('os-valor-total');
        if (el) el.value = fmtMoeda(total);
    };

    function coletarItens() {
        const itens = [];
        document.querySelectorAll('#os-itens-body tr').forEach(tr => {
            const desc = tr.querySelector('.os-item-desc').value.trim();
            if (!desc) return;
            itens.push({
                descricao: desc,
                quantidade: parseFloat(tr.querySelector('.os-item-qtd').value) || 1,
                valor_unitario: parseFloat(tr.querySelector('.os-item-vu').value) || 0,
                desconto: parseFloat(tr.querySelector('.os-item-desc-item').value) || 0
            });
        });
        return itens;
    }

    window.osSalvarNova = async function (e) {
        e.preventDefault();
        try {
            await api('/api/os', {
                method: 'POST',
                body: JSON.stringify({
                    numero: document.getElementById('os-numero').value || null,
                    empresa_id: document.getElementById('os-empresa').value || null,
                    contato_id: document.getElementById('os-contato').value || null,
                    data: document.getElementById('os-data').value,
                    responsavel: document.getElementById('os-responsavel').value,
                    descricao: document.getElementById('os-descricao').value,
                    desconto: parseFloat(document.getElementById('os-desconto').value) || 0,
                    observacoes: document.getElementById('os-obs').value,
                    itens: coletarItens()
                })
            });
            fecharModal('modal-dynamic');
            navigate('ordens-servico');
        } catch (e) {
            alert(e.message);
        }
    };

    // ---- Editar ----
    window.osEditar = async function (id) {
        try {
            const os = await api(`/api/os/${id}`);
            const empOptions = empresasCache.map(e => `<option value="${e.id}" ${os.empresa_id == e.id ? 'selected' : ''}>${esc(e.razaosocial)}</option>`).join('');
            const contatoOptions = contatosCache.map(c => `<option value="${c.id}" ${os.contato_id == c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
            const dataFmt = os.data ? new Date(os.data).toISOString().split('T')[0] : '';

            showDynamicModal('Editar Ordem de Serviço', `
                <form onsubmit="osSalvarEdicao(event, ${id})">
                    <div class="crm-form-grid">
                        <div class="crm-form-group">
                            <label>Número</label>
                            <input type="text" id="os-numero" value="${esc(os.numero)}">
                        </div>
                        <div class="crm-form-group">
                            <label>Data</label>
                            <input type="date" id="os-data" value="${dataFmt}">
                        </div>
                    </div>
                    <div class="crm-form-grid">
                        <div class="crm-form-group">
                            <label>Empresa</label>
                            <select id="os-empresa"><option value="">Selecione...</option>${empOptions}</select>
                        </div>
                        <div class="crm-form-group">
                            <label>Cliente (CRM)</label>
                            <select id="os-contato"><option value="">Selecione...</option>${contatoOptions}</select>
                        </div>
                    </div>
                    <div class="crm-form-group">
                        <label>Responsável</label>
                        <input type="text" id="os-responsavel" value="${esc(os.responsavel)}">
                    </div>
                    <div class="crm-form-group">
                        <label>Descrição</label>
                        <textarea id="os-descricao" rows="2">${esc(os.descricao)}</textarea>
                    </div>
                    <div style="margin-top:16px;border-top:1px solid var(--border-light,#2a3142);padding-top:14px;">
                        <strong style="font-size:14px;">Itens / Serviços</strong>
                        <table class="os-itens-table">
                            <thead><tr><th>Descrição</th><th style="width:80px;">Qtd</th><th style="width:110px;">Valor Unit.</th><th style="width:90px;">Desc.</th><th style="width:110px;">Total</th><th style="width:30px;"></th></tr></thead>
                            <tbody id="os-itens-body"></tbody>
                        </table>
                        <button type="button" class="os-item-add" onclick="osAddItem()"><i data-lucide="plus"></i> Adicionar item</button>
                    </div>
                    <div class="crm-form-grid" style="margin-top:14px;">
                        <div class="crm-form-group">
                            <label>Desconto global</label>
                            <input type="number" id="os-desconto" step="0.01" value="${os.desconto || 0}" oninput="osCalcTotal()">
                        </div>
                        <div class="crm-form-group">
                            <label>Valor total calculado</label>
                            <input type="text" id="os-valor-total" readonly style="font-weight:700;color:#4ade80;">
                        </div>
                    </div>
                    <div class="crm-form-group">
                        <label>Observações</label>
                        <textarea id="os-obs" rows="2">${esc(os.observacoes)}</textarea>
                    </div>
                    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
                        <button type="button" class="btn-cancel" onclick="fecharModal('modal-dynamic')">Cancelar</button>
                        <button type="submit" class="btn-submit">Salvar</button>
                    </div>
                </form>
            `);

            // Preenche itens existentes
            if (os.itens && os.itens.length > 0) {
                os.itens.forEach(item => {
                    window.osAddItem();
                    const rows = document.querySelectorAll('#os-itens-body tr');
                    const tr = rows[rows.length - 1];
                    tr.querySelector('.os-item-desc').value = item.descricao || '';
                    tr.querySelector('.os-item-qtd').value = item.quantidade || 1;
                    tr.querySelector('.os-item-vu').value = item.valor_unitario || 0;
                    tr.querySelector('.os-item-desc-item').value = item.desconto || 0;
                    window.osCalcLinha(tr.querySelector('.os-item-qtd'));
                });
            } else {
                window.osAddItem();
            }
            window.osCalcTotal();
            lucide.createIcons();
        } catch (e) {
            alert(e.message);
        }
    };

    window.osSalvarEdicao = async function (e, id) {
        e.preventDefault();
        try {
            await api(`/api/os/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    numero: document.getElementById('os-numero').value || null,
                    empresa_id: document.getElementById('os-empresa').value || null,
                    contato_id: document.getElementById('os-contato').value || null,
                    data: document.getElementById('os-data').value,
                    responsavel: document.getElementById('os-responsavel').value,
                    descricao: document.getElementById('os-descricao').value,
                    desconto: parseFloat(document.getElementById('os-desconto').value) || 0,
                    observacoes: document.getElementById('os-obs').value,
                    itens: coletarItens()
                })
            });
            fecharModal('modal-dynamic');
            navigate('ordens-servico');
        } catch (e) {
            alert(e.message);
        }
    };

    // ---- Detalhes ----
    window.osDetalhes = async function (id) {
        try {
            const [os, historico] = await Promise.all([
                api(`/api/os/${id}`),
                api(`/api/os/${id}/historico`)
            ]);
            const si = statusInfo(os.status);
            const itensHtml = (os.itens || []).map(item => `
                <tr>
                    <td>${esc(item.descricao)}</td>
                    <td style="text-align:right;">${item.quantidade}</td>
                    <td style="text-align:right;">${fmtMoeda(item.valor_unitario)}</td>
                    <td style="text-align:right;">${fmtMoeda(item.desconto)}</td>
                    <td style="text-align:right;font-weight:600;">${fmtMoeda(item.valor_total)}</td>
                </tr>
            `).join('');

            const fiscalHtml = os.dados_fiscais ? `
                <div class="os-fiscal-section">
                    <div class="os-fiscal-title">
                        <i data-lucide="file-check"></i> Dados Fiscais Preparados
                        <span class="os-fiscal-badge os-fiscal-ok">Pronto para emissão</span>
                    </div>
                    <div class="os-details-grid">
                        <div class="os-details-item"><div class="os-details-label">Tipo de Documento</div><div class="os-details-value">${esc(os.dados_fiscais.tipo_documento)}</div></div>
                        <div class="os-details-item"><div class="os-details-label">Natureza da Operação</div><div class="os-details-value">${esc(os.dados_fiscais.natureza_operacao) || '—'}</div></div>
                        <div class="os-details-item"><div class="os-details-label">Código de Serviço</div><div class="os-details-value">${esc(os.dados_fiscais.codigo_servico) || '—'}</div></div>
                        <div class="os-details-item"><div class="os-details-label">Alíquota ISS</div><div class="os-details-value">${parseFloat(os.dados_fiscais.aliquota_iss || 0).toFixed(2)}%</div></div>
                        <div class="os-details-item"><div class="os-details-label">Base de Cálculo</div><div class="os-details-value">${fmtMoeda(os.dados_fiscais.base_calculo)}</div></div>
                        <div class="os-details-item"><div class="os-details-label">Valor ISS</div><div class="os-details-value">${fmtMoeda(os.dados_fiscais.valor_iss)}</div></div>
                        <div class="os-details-item"><div class="os-details-label">Retenção INSS</div><div class="os-details-value">${fmtMoeda(os.dados_fiscais.retencao_inss)}</div></div>
                        <div class="os-details-item"><div class="os-details-label">Retenção IRRF</div><div class="os-details-value">${fmtMoeda(os.dados_fiscais.retencao_irrf)}</div></div>
                        <div class="os-details-item"><div class="os-details-label">Retenção ISS</div><div class="os-details-value">${fmtMoeda(os.dados_fiscais.retencao_iss)}</div></div>
                        ${os.dados_fiscais.dados_complementares ? `<div class="os-details-item os-details-full"><div class="os-details-label">Dados Complementares</div><div class="os-details-value" style="white-space:pre-wrap;">${esc(os.dados_fiscais.dados_complementares)}</div></div>` : ''}
                    </div>
                </div>
            ` : `
                <div class="os-fiscal-section">
                    <div class="os-fiscal-title">
                        <i data-lucide="alert-circle"></i> Dados Fiscais
                        <span class="os-fiscal-badge os-fiscal-pendente">Não preparados</span>
                    </div>
                    <p style="color:var(--text-secondary,#a0a5b1);font-size:13px;">Clique em "Preparar emissão fiscal" para gerar os dados para NF-e/NFS-e.</p>
                </div>
            `;

            const timelineHtml = (historico || []).map(h => `
                <div class="os-timeline-item">
                    <div class="os-timeline-dot"></div>
                    <div class="os-timeline-content">
                        <div class="os-timeline-acao">${esc(h.acao)}</div>
                        ${h.detalhe ? `<div class="os-timeline-detalhe">${esc(h.detalhe)}</div>` : ''}
                        <div class="os-timeline-data">${new Date(h.data).toLocaleString('pt-BR')}</div>
                    </div>
                </div>
            `).join('');

            showDynamicModal(`OS ${os.numero || ''}`, `
                <div class="os-details-grid">
                    <div class="os-details-item"><div class="os-details-label">Número</div><div class="os-details-value">${esc(os.numero) || '—'}</div></div>
                    <div class="os-details-item"><div class="os-details-label">Status</div><div class="os-details-value"><span class="os-badge" style="background:${si.color}22;color:${si.color};">${si.label}</span></div></div>
                    <div class="os-details-item"><div class="os-details-label">Empresa</div><div class="os-details-value">${esc(os.empresa?.razaosocial) || '—'}</div></div>
                    <div class="os-details-item"><div class="os-details-label">Cliente</div><div class="os-details-value">${esc(os.contato?.nome) || '—'}</div></div>
                    <div class="os-details-item"><div class="os-details-label">Data</div><div class="os-details-value">${fmtData(os.data)}</div></div>
                    <div class="os-details-item"><div class="os-details-label">Responsável</div><div class="os-details-value">${esc(os.responsavel) || '—'}</div></div>
                    <div class="os-details-item os-details-full"><div class="os-details-label">Descrição</div><div class="os-details-value" style="white-space:pre-wrap;">${esc(os.descricao) || '—'}</div></div>
                </div>

                <div style="margin-top:16px;">
                    <strong style="font-size:14px;">Itens / Serviços</strong>
                    <table class="os-itens-table">
                        <thead><tr><th>Descrição</th><th style="text-align:right;">Qtd</th><th style="text-align:right;">Valor Unit.</th><th style="text-align:right;">Desc.</th><th style="text-align:right;">Total</th></tr></thead>
                        <tbody>${itensHtml}</tbody>
                    </table>
                    <div style="display:flex;justify-content:flex-end;gap:20px;margin-top:10px;font-size:14px;">
                        <span>Desconto global: <strong>${fmtMoeda(os.desconto)}</strong></span>
                        <span>Valor total: <strong style="color:#4ade80;">${fmtMoeda(os.valor_total)}</strong></span>
                    </div>
                </div>

                <div class="os-details-item os-details-full" style="margin-top:12px;">
                    <div class="os-details-label">Observações</div>
                    <div class="os-details-value" style="white-space:pre-wrap;">${esc(os.observacoes) || '—'}</div>
                </div>

                ${fiscalHtml}

                <div style="margin-top:16px;">
                    <strong style="font-size:14px;">Histórico</strong>
                    <div class="os-timeline">${timelineHtml}</div>
                </div>

                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap;">
                    <button type="button" class="os-btn-mini os-btn-fiscal" onclick="fecharModal('modal-dynamic');osPrepararFiscal(${id})"><i data-lucide="file-text"></i> Preparar emissão fiscal</button>
                    <button type="button" class="btn-cancel" onclick="fecharModal('modal-dynamic')">Fechar</button>
                </div>
            `);
            lucide.createIcons();
        } catch (e) {
            alert(e.message);
        }
    };

    // ---- Preparar emissão fiscal ----
    window.osPrepararFiscal = async function (id) {
        try {
            const os = await api(`/api/os/${id}`);
            const df = os.dados_fiscais || {};
            showDynamicModal('Preparar Emissão Fiscal', `
                <form onsubmit="osSalvarFiscal(event, ${id})">
                    <p style="color:var(--text-secondary,#a0a5b1);font-size:13px;margin-bottom:16px;">
                        Prepare os dados fiscais da OS para futura emissão de NF-e ou NFS-e.
                        <strong>Nenhuma emissão fiscal real será realizada nesta etapa.</strong>
                    </p>
                    <div class="crm-form-grid">
                        <div class="crm-form-group">
                            <label>Tipo de Documento</label>
                            <select id="os-fiscal-tipo">
                                <option value="NFS-e" ${df.tipo_documento === 'NFS-e' ? 'selected' : ''}>NFS-e (Nota Fiscal de Serviço Eletrônica)</option>
                                <option value="NF-e" ${df.tipo_documento === 'NF-e' ? 'selected' : ''}>NF-e (Nota Fiscal Eletrônica)</option>
                            </select>
                        </div>
                        <div class="crm-form-group">
                            <label>Natureza da Operação</label>
                            <input type="text" id="os-fiscal-natureza" value="${esc(df.natureza_operacao) || ''}" placeholder="Prestação de serviços">
                        </div>
                    </div>
                    <div class="crm-form-grid">
                        <div class="crm-form-group">
                            <label>Código de Serviço</label>
                            <input type="text" id="os-fiscal-codigo" value="${esc(df.codigo_servico) || ''}" placeholder="Ex: 0107">
                        </div>
                        <div class="crm-form-group">
                            <label>Alíquota ISS (%)</label>
                            <input type="number" id="os-fiscal-aliquota" step="0.01" value="${df.aliquota_iss || 0}" placeholder="Ex: 5">
                        </div>
                    </div>
                    <div class="crm-form-grid">
                        <div class="crm-form-group">
                            <label>Base de Cálculo</label>
                            <input type="number" id="os-fiscal-base" step="0.01" value="${df.base_calculo || os.valor_total || 0}">
                        </div>
                        <div class="crm-form-group">
                            <label>Valor ISS</label>
                            <input type="number" id="os-fiscal-valor-iss" step="0.01" value="${df.valor_iss || 0}">
                        </div>
                    </div>
                    <div class="crm-form-grid">
                        <div class="crm-form-group">
                            <label>Retenção INSS</label>
                            <input type="number" id="os-fiscal-inss" step="0.01" value="${df.retencao_inss || 0}">
                        </div>
                        <div class="crm-form-group">
                            <label>Retenção IRRF</label>
                            <input type="number" id="os-fiscal-irrf" step="0.01" value="${df.retencao_irrf || 0}">
                        </div>
                    </div>
                    <div class="crm-form-group">
                        <label>Retenção ISS</label>
                        <input type="number" id="os-fiscal-ret-iss" step="0.01" value="${df.retencao_iss || 0}">
                    </div>
                    <div class="crm-form-group">
                        <label>Dados Complementares</label>
                        <textarea id="os-fiscal-complementares" rows="3" placeholder="Informações adicionais para a nota fiscal...">${esc(df.dados_complementares) || ''}</textarea>
                    </div>
                    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
                        <button type="button" class="btn-cancel" onclick="fecharModal('modal-dynamic')">Cancelar</button>
                        <button type="submit" class="btn-submit" style="background:linear-gradient(135deg,#22c55e,#16a34a);">Preparar Dados</button>
                    </div>
                </form>
            `);
            lucide.createIcons();
        } catch (e) {
            alert(e.message);
        }
    };

    window.osSalvarFiscal = async function (e, id) {
        e.preventDefault();
        try {
            await api(`/api/os/${id}/preparar-fiscal`, {
                method: 'POST',
                body: JSON.stringify({
                    tipo_documento: document.getElementById('os-fiscal-tipo').value,
                    natureza_operacao: document.getElementById('os-fiscal-natureza').value,
                    codigo_servico: document.getElementById('os-fiscal-codigo').value,
                    aliquota_iss: parseFloat(document.getElementById('os-fiscal-aliquota').value) || 0,
                    base_calculo: parseFloat(document.getElementById('os-fiscal-base').value) || 0,
                    valor_iss: parseFloat(document.getElementById('os-fiscal-valor-iss').value) || 0,
                    retencao_inss: parseFloat(document.getElementById('os-fiscal-inss').value) || 0,
                    retencao_irrf: parseFloat(document.getElementById('os-fiscal-irrf').value) || 0,
                    retencao_iss: parseFloat(document.getElementById('os-fiscal-ret-iss').value) || 0,
                    dados_complementares: document.getElementById('os-fiscal-complementares').value
                })
            });
            fecharModal('modal-dynamic');
            navigate('ordens-servico');
        } catch (e) {
            alert(e.message);
        }
    };

    // ---- Excluir ----
    window.osExcluir = async function (id) {
        if (!confirm('Excluir esta ordem de serviço? Todos os itens, histórico e dados fiscais serão removidos.')) return;
        try {
            await api(`/api/os/${id}`, { method: 'DELETE' });
            navigate('ordens-servico');
        } catch (e) {
            alert(e.message);
        }
    };

})();
