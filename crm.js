// =============================================================
// CRM — Funil de Vendas (recriado do zero)
// Simples, estável, funcional. Não altera outras áreas.
// =============================================================

(function () {
    'use strict';

    // ---- Etapas do funil ----
    const ETAPAS = [
        { status: 'novo',       label: 'Novo',       color: '#a78bfa', glow: 'rgba(167,139,250,0.25)' },
        { status: 'contatado',  label: 'Em Contato', color: '#60a5fa', glow: 'rgba(96,165,250,0.25)' },
        { status: 'negociando', label: 'Proposta',   color: '#fbbf24', glow: 'rgba(251,191,36,0.25)' },
        { status: 'ganho',      label: 'Fechado',   color: '#4ade80', glow: 'rgba(74,222,128,0.25)' },
        { status: 'perdido',    label: 'Perdido',    color: '#f87171', glow: 'rgba(248,113,113,0.25)' }
    ];

    const ORIGENS = ['Instagram', 'Facebook', 'WhatsApp', 'Google', 'Site', 'Indicação', 'Outros'];

    let crmContatos = [];
    let crmBusca = '';
    let kanbanDragId = null;

    // ---- Helpers ----
    function esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }
    function fmtData(d) {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('pt-BR') + ' ' + new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    function etapaLabel(status) {
        const e = ETAPAS.find(x => x.status === status);
        return e ? e.label : status;
    }

    // ---- Injeção de CSS ----
    const css = `
        <style id="crm-styles">
        /* CRM — Funil de Vendas */
        .crm-topo { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 24px; }
        .crm-card-stat {
            background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(111,66,193,0.06));
            border: 1px solid rgba(59,130,246,0.2);
            border-radius: 16px;
            padding: 20px 22px;
            position: relative;
            overflow: hidden;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .crm-card-stat::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 2px;
            background: linear-gradient(90deg, transparent, var(--accent-blue, #3b82f6), transparent);
            opacity: 0.6;
        }
        .crm-card-stat:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(59,130,246,0.15); }
        .crm-card-stat-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--text-secondary, #a0a5b1); margin-bottom: 8px; }
        .crm-card-stat-value { font-size: 32px; font-weight: 800; color: var(--text-primary, #fff); line-height: 1; }
        .crm-card-stat-icon { position: absolute; top: 16px; right: 18px; width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
        .crm-card-stat-icon i { width: 18px; height: 18px; }
        .crm-card-stat.total .crm-card-stat-icon { background: rgba(59,130,246,0.15); color: #60a5fa; }
        .crm-card-stat.leads .crm-card-stat-icon { background: rgba(167,139,250,0.15); color: #a78bfa; }
        .crm-card-stat.clientes .crm-card-stat-icon { background: rgba(74,222,128,0.15); color: #4ade80; }
        .crm-card-stat.fechados .crm-card-stat-icon { background: rgba(34,197,94,0.15); color: #22c55e; }
        .crm-card-stat.total { border-color: rgba(59,130,246,0.25); }
        .crm-card-stat.leads { border-color: rgba(167,139,250,0.25); }
        .crm-card-stat.clientes { border-color: rgba(74,222,128,0.25); }
        .crm-card-stat.fechados { border-color: rgba(34,197,94,0.25); }

        .crm-toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
        .crm-search {
            flex: 1; min-width: 200px;
            display: flex; align-items: center; gap: 10px;
            background: var(--bg-card, #1a1f2b);
            border: 1px solid var(--border-light, #2a3142);
            border-radius: 12px;
            padding: 10px 16px;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .crm-search:focus-within { border-color: var(--accent-blue, #3b82f6); box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
        .crm-search i { width: 18px; height: 18px; color: var(--text-muted, #6b7280); flex-shrink: 0; }
        .crm-search input {
            flex: 1; background: transparent; border: none; outline: none;
            color: var(--text-primary, #fff); font-size: 14px; font-family: inherit;
        }
        .crm-search input::placeholder { color: var(--text-muted, #6b7280); }
        .crm-btn-new {
            display: flex; align-items: center; gap: 8px;
            background: linear-gradient(135deg, #3b82f6, #6f42c1);
            color: #fff; border: none; border-radius: 12px;
            padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
            transition: transform 0.15s, box-shadow 0.2s; white-space: nowrap;
            font-family: inherit;
        }
        .crm-btn-new:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(59,130,246,0.3); }
        .crm-btn-new i { width: 16px; height: 16px; }

        .crm-kanban {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 12px;
            padding-bottom: 12px;
            min-height: 400px;
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
        }
        .crm-col {
            min-width: 0;
            background: rgba(26,31,43,0.6);
            border: 1px solid var(--border-light, #2a3142);
            border-radius: 16px;
            display: flex; flex-direction: column;
            transition: border-color 0.2s;
            box-sizing: border-box;
        }
        .crm-col-head {
            padding: 14px 16px;
            display: flex; align-items: center; justify-content: space-between;
            border-bottom: 1px solid var(--border-light, #2a3142);
        }
        .crm-col-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 8px; }
        .crm-col-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .crm-col-count {
            font-size: 12px; font-weight: 700;
            padding: 2px 10px; border-radius: 20px;
            background: rgba(255,255,255,0.06);
            color: var(--text-secondary, #a0a5b1);
        }
        .crm-col-cards {
            flex: 1; padding: 10px;
            display: flex; flex-direction: column; gap: 10px;
            overflow-y: auto; min-height: 80px;
            transition: background 0.15s, border-color 0.15s;
            border-radius: 0 0 16px 16px;
        }
        .crm-col-cards.drag-over {
            background: rgba(59,130,246,0.06);
            border: 2px dashed rgba(59,130,246,0.3);
            margin: -2px -2px 0 -2px;
            padding: 8px 8px 8px 8px;
        }
        .crm-col-empty { text-align: center; color: var(--text-muted, #6b7280); font-size: 12px; padding: 24px 8px; }

        .crm-contact-card {
            background: var(--bg-card, #1a1f2b);
            border: 1px solid var(--border-light, #2a3142);
            border-radius: 12px;
            padding: 14px;
            cursor: grab;
            transition: border-color 0.15s, box-shadow 0.2s, transform 0.15s;
            animation: crmFadeIn 0.25s ease;
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
        }
        .crm-contact-card:hover { border-color: var(--accent-blue, #3b82f6); box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
        .crm-contact-card.dragging { opacity: 0.35; cursor: grabbing; }
        .crm-contact-name { font-size: 14px; font-weight: 600; color: var(--text-primary, #fff); margin-bottom: 6px; word-break: break-word; overflow-wrap: anywhere; }
        .crm-contact-info { font-size: 12px; color: var(--text-secondary, #a0a5b1); margin-bottom: 3px; display: flex; align-items: center; gap: 6px; min-width: 0; word-break: break-word; overflow-wrap: anywhere; }
        .crm-contact-info i { width: 13px; height: 13px; opacity: 0.6; flex-shrink: 0; }
        .crm-contact-actions { display: flex; gap: 6px; margin-top: 10px; }
        .crm-btn-mini {
            font-size: 11px; font-weight: 600;
            padding: 5px 10px; border-radius: 8px;
            border: 1px solid transparent; cursor: pointer;
            transition: all 0.15s; font-family: inherit;
            display: flex; align-items: center; gap: 4px;
        }
        .crm-btn-mini i { width: 12px; height: 12px; }
        .crm-btn-edit { background: rgba(59,130,246,0.12); color: #60a5fa; border-color: rgba(59,130,246,0.2); }
        .crm-btn-edit:hover { background: rgba(59,130,246,0.2); }
        .crm-btn-del { background: rgba(220,38,38,0.1); color: #f87171; border-color: rgba(220,38,38,0.2); }
        .crm-btn-del:hover { background: rgba(220,38,38,0.2); }
        .crm-btn-info { background: rgba(111,66,193,0.12); color: #a78bfa; border-color: rgba(111,66,193,0.2); }
        .crm-btn-info:hover { background: rgba(111,66,193,0.2); }

        .crm-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .crm-form-group { margin-bottom: 14px; }
        .crm-form-group label { display: block; font-size: 12px; font-weight: 600; color: var(--text-secondary, #a0a5b1); margin-bottom: 6px; }
        .crm-form-group input, .crm-form-group select, .crm-form-group textarea {
            width: 100%; background: var(--bg-body, #0c0f16);
            border: 1px solid var(--border-light, #2a3142); border-radius: 10px;
            padding: 10px 12px; color: var(--text-primary, #fff); font-size: 14px;
            font-family: inherit; outline: none; transition: border-color 0.2s;
        }
        .crm-form-group input:focus, .crm-form-group select:focus, .crm-form-group textarea:focus {
            border-color: var(--accent-blue, #3b82f6);
        }
        .crm-form-group textarea { resize: vertical; min-height: 60px; }

        .crm-details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .crm-details-item { background: var(--bg-body, #0c0f16); border: 1px solid var(--border-light, #2a3142); border-radius: 10px; padding: 12px 14px; }
        .crm-details-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted, #6b7280); margin-bottom: 4px; }
        .crm-details-value { font-size: 14px; color: var(--text-primary, #fff); font-weight: 500; word-break: break-word; }
        .crm-details-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .crm-details-full { grid-column: 1 / -1; }

        @keyframes crmFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

        /* Tablet: rolagem horizontal apenas dentro do kanban */
        @media (max-width: 1024px) {
            .crm-kanban {
                display: flex;
                overflow-x: auto;
                gap: 12px;
            }
            .crm-col { flex: 0 0 260px; min-width: 260px; }
        }
        /* Celular: colunas compactas com rolagem dentro do kanban */
        @media (max-width: 640px) {
            .crm-topo { grid-template-columns: 1fr 1fr; }
            .crm-kanban {
                display: flex;
                overflow-x: auto;
                gap: 10px;
            }
            .crm-col { flex: 0 0 85%; min-width: 85%; }
            .crm-form-grid { grid-template-columns: 1fr; }
            .crm-details-grid { grid-template-columns: 1fr; }
        }
        </style>
    `;
    if (!document.getElementById('crm-styles')) {
        document.head.insertAdjacentHTML('beforeend', css);
    }

    // ---- Filtragem por busca ----
    function filtrarContatos() {
        if (!crmBusca) return crmContatos;
        const q = crmBusca.toLowerCase();
        return crmContatos.filter(c =>
            (c.nome || '').toLowerCase().includes(q) ||
            (c.telefone || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q) ||
            (c.empresa || '').toLowerCase().includes(q)
        );
    }

    // ---- Renderização da view ----
    views.crm = async function () {
        document.getElementById('content').innerHTML = `
            <h1 class="page-title">CRM — Funil de Vendas</h1>
            <p class="page-subtitle">Gerencie seus contatos e acompanhe o avanço</p>
            <div class="crm-topo" id="crm-topo"></div>
            <div class="crm-toolbar">
                <div class="crm-search">
                    <i data-lucide="search"></i>
                    <input type="text" id="crm-busca-input" placeholder="Pesquisar contato..." value="${esc(crmBusca)}">
                </div>
                <button class="crm-btn-new" onclick="crmNovoContato()"><i data-lucide="plus"></i> Novo Contato</button>
            </div>
            <div class="crm-kanban" id="crm-kanban"></div>
        `;

        const buscaInput = document.getElementById('crm-busca-input');
        buscaInput.addEventListener('input', function () {
            crmBusca = this.value;
            renderKanban();
        });

        try {
            crmContatos = await api('/api/crm/contatos');
            renderTopo();
            renderKanban();
        } catch (e) {
            document.getElementById('crm-kanban').innerHTML = '<div style="color:var(--text-muted);padding:40px;text-align:center;">Erro ao carregar contatos.</div>';
        }
        lucide.createIcons();
    };

    function renderTopo() {
        const total = crmContatos.length;
        const leads = crmContatos.filter(c => c.tipo === 'lead').length;
        const clientes = crmContatos.filter(c => c.tipo === 'cliente').length;
        const fechados = crmContatos.filter(c => c.status === 'ganho').length;
        document.getElementById('crm-topo').innerHTML = `
            <div class="crm-card-stat total">
                <div class="crm-card-stat-icon"><i data-lucide="users"></i></div>
                <div class="crm-card-stat-label">Total</div>
                <div class="crm-card-stat-value">${total}</div>
            </div>
            <div class="crm-card-stat leads">
                <div class="crm-card-stat-icon"><i data-lucide="user-plus"></i></div>
                <div class="crm-card-stat-label">Leads</div>
                <div class="crm-card-stat-value">${leads}</div>
            </div>
            <div class="crm-card-stat clientes">
                <div class="crm-card-stat-icon"><i data-lucide="user-check"></i></div>
                <div class="crm-card-stat-label">Clientes</div>
                <div class="crm-card-stat-value">${clientes}</div>
            </div>
            <div class="crm-card-stat fechados">
                <div class="crm-card-stat-icon"><i data-lucide="trophy"></i></div>
                <div class="crm-card-stat-label">Fechados</div>
                <div class="crm-card-stat-value">${fechados}</div>
            </div>
        `;
        lucide.createIcons();
    }

    function renderKanban() {
        const contatos = filtrarContatos();
        const board = document.getElementById('crm-kanban');
        board.innerHTML = ETAPAS.map(etapa => {
            const cards = contatos.filter(c => c.status === etapa.status);
            return `
                <div class="crm-col">
                    <div class="crm-col-head">
                        <span class="crm-col-title">
                            <span class="crm-col-dot" style="background:${etapa.color};box-shadow:0 0 8px ${etapa.glow};"></span>
                            ${etapa.label}
                        </span>
                        <span class="crm-col-count">${cards.length}</span>
                    </div>
                    <div class="crm-col-cards" data-status="${etapa.status}"
                        ondragover="crmDragOver(event)" ondrop="crmDrop(event,'${etapa.status}')" ondragleave="crmDragLeave(event)">
                        ${cards.length === 0
                    ? '<div class="crm-col-empty">Arraste aqui</div>'
                    : cards.map(c => `
                            <div class="crm-contact-card" draggable="true"
                                ondragstart="crmDragStart(event,${c.id})" ondragend="crmDragEnd(event)">
                                <div class="crm-contact-name">${esc(c.nome)}</div>
                                ${c.telefone ? `<div class="crm-contact-info"><i data-lucide="phone"></i> ${esc(c.telefone)}</div>` : ''}
                                ${c.email ? `<div class="crm-contact-info"><i data-lucide="mail"></i> ${esc(c.email)}</div>` : ''}
                                ${c.empresa ? `<div class="crm-contact-info"><i data-lucide="building-2"></i> ${esc(c.empresa)}</div>` : ''}
                                <div class="crm-contact-actions">
                                    <button class="crm-btn-mini crm-btn-edit" onclick="crmEditar(${c.id})"><i data-lucide="pencil"></i> Editar</button>
                                    <button class="crm-btn-mini crm-btn-del" onclick="crmExcluir(${c.id})"><i data-lucide="trash-2"></i> Excluir</button>
                                    <button class="crm-btn-mini crm-btn-info" onclick="crmDetalhes(${c.id})"><i data-lucide="info"></i> Detalhes</button>
                                </div>
                            </div>`).join('')}
                    </div>
                </div>`;
        }).join('');
        lucide.createIcons();
    }

    // ---- Drag and Drop ----
    window.crmDragStart = function (e, id) {
        kanbanDragId = id;
        e.target.classList.add('dragging');
    };
    window.crmDragEnd = function (e) {
        e.target.classList.remove('dragging');
    };
    window.crmDragOver = function (e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    };
    window.crmDragLeave = function (e) {
        e.currentTarget.classList.remove('drag-over');
    };
    window.crmDrop = async function (e, status) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        if (!kanbanDragId) return;
        const id = kanbanDragId;
        kanbanDragId = null;
        try {
            await api(`/api/crm/contatos/${id}/etapa`, { method: 'PUT', body: JSON.stringify({ status }) });
            const c = crmContatos.find(x => x.id === id);
            if (c) c.status = status;
            renderTopo();
            renderKanban();
        } catch (e) {
            alert(e.message);
        }
    };

    // ---- Novo Contato ----
    window.crmNovoContato = function () {
        showDynamicModal('Novo Contato', `
            <form onsubmit="crmSalvarNovo(event)">
                <div class="crm-form-group">
                    <label>Nome *</label>
                    <input type="text" id="crm-nome" required placeholder="Nome do contato">
                </div>
                <div class="crm-form-grid">
                    <div class="crm-form-group">
                        <label>Telefone</label>
                        <input type="text" id="crm-telefone" placeholder="(00) 00000-0000">
                    </div>
                    <div class="crm-form-group">
                        <label>E-mail</label>
                        <input type="email" id="crm-email" placeholder="email@exemplo.com">
                    </div>
                </div>
                <div class="crm-form-group">
                    <label>Empresa</label>
                    <input type="text" id="crm-empresa" placeholder="Empresa do contato">
                </div>
                <div class="crm-form-grid">
                    <div class="crm-form-group">
                        <label>Origem</label>
                        <select id="crm-origem">
                            <option value="">Selecione...</option>
                            ${ORIGENS.map(o => `<option value="${o}">${o}</option>`).join('')}
                        </select>
                    </div>
                    <div class="crm-form-group">
                        <label>Etapa</label>
                        <select id="crm-etapa">
                            ${ETAPAS.map(e => `<option value="${e.status}">${e.label}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="crm-form-group">
                    <label>Observações</label>
                    <textarea id="crm-obs" rows="3" placeholder="Anotações sobre o contato..."></textarea>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
                    <button type="button" class="btn-cancel" onclick="fecharModal('modal-dynamic')">Cancelar</button>
                    <button type="submit" class="btn-submit">Salvar</button>
                </div>
            </form>
        `);
    };

    window.crmSalvarNovo = async function (e) {
        e.preventDefault();
        try {
            await api('/api/crm/contatos', {
                method: 'POST',
                body: JSON.stringify({
                    nome: document.getElementById('crm-nome').value,
                    telefone: document.getElementById('crm-telefone').value,
                    email: document.getElementById('crm-email').value,
                    empresa: document.getElementById('crm-empresa').value,
                    origem: document.getElementById('crm-origem').value,
                    status: document.getElementById('crm-etapa').value,
                    observacao: document.getElementById('crm-obs').value
                })
            });
            fecharModal('modal-dynamic');
            navigate('crm');
        } catch (e) {
            alert(e.message);
        }
    };

    // ---- Editar ----
    window.crmEditar = async function (id) {
        const c = crmContatos.find(x => x.id === id);
        if (!c) return;
        showDynamicModal('Editar Contato', `
            <form onsubmit="crmSalvarEdicao(event, ${id})">
                <div class="crm-form-group">
                    <label>Nome *</label>
                    <input type="text" id="crm-nome" required value="${esc(c.nome)}">
                </div>
                <div class="crm-form-grid">
                    <div class="crm-form-group">
                        <label>Telefone</label>
                        <input type="text" id="crm-telefone" value="${esc(c.telefone)}">
                    </div>
                    <div class="crm-form-group">
                        <label>E-mail</label>
                        <input type="email" id="crm-email" value="${esc(c.email)}">
                    </div>
                </div>
                <div class="crm-form-group">
                    <label>Empresa</label>
                    <input type="text" id="crm-empresa" value="${esc(c.empresa)}">
                </div>
                <div class="crm-form-grid">
                    <div class="crm-form-group">
                        <label>Origem</label>
                        <select id="crm-origem">
                            <option value="">Selecione...</option>
                            ${ORIGENS.map(o => `<option value="${o}" ${c.origem === o ? 'selected' : ''}>${o}</option>`).join('')}
                        </select>
                    </div>
                    <div class="crm-form-group">
                        <label>Etapa</label>
                        <select id="crm-etapa">
                            ${ETAPAS.map(e => `<option value="${e.status}" ${c.status === e.status ? 'selected' : ''}>${e.label}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="crm-form-group">
                    <label>Observações</label>
                    <textarea id="crm-obs" rows="3">${esc(c.observacao)}</textarea>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
                    <button type="button" class="btn-cancel" onclick="fecharModal('modal-dynamic')">Cancelar</button>
                    <button type="submit" class="btn-submit">Salvar</button>
                </div>
            </form>
        `);
    };

    window.crmSalvarEdicao = async function (e, id) {
        e.preventDefault();
        try {
            await api(`/api/crm/contatos/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    nome: document.getElementById('crm-nome').value,
                    telefone: document.getElementById('crm-telefone').value,
                    email: document.getElementById('crm-email').value,
                    empresa: document.getElementById('crm-empresa').value,
                    origem: document.getElementById('crm-origem').value,
                    status: document.getElementById('crm-etapa').value,
                    observacao: document.getElementById('crm-obs').value
                })
            });
            fecharModal('modal-dynamic');
            navigate('crm');
        } catch (e) {
            alert(e.message);
        }
    };

    // ---- Detalhes ----
    window.crmDetalhes = function (id) {
        const c = crmContatos.find(x => x.id === id);
        if (!c) return;
        const etapa = ETAPAS.find(e => e.status === c.status);
        const etapaColor = etapa ? etapa.color : '#a0a5b1';
        showDynamicModal('Detalhes do Contato', `
            <div class="crm-details-grid">
                <div class="crm-details-item crm-details-full">
                    <div class="crm-details-label">Nome</div>
                    <div class="crm-details-value">${esc(c.nome)}</div>
                </div>
                <div class="crm-details-item">
                    <div class="crm-details-label">Telefone</div>
                    <div class="crm-details-value">${esc(c.telefone) || '—'}</div>
                </div>
                <div class="crm-details-item">
                    <div class="crm-details-label">E-mail</div>
                    <div class="crm-details-value">${esc(c.email) || '—'}</div>
                </div>
                <div class="crm-details-item">
                    <div class="crm-details-label">Empresa</div>
                    <div class="crm-details-value">${esc(c.empresa) || '—'}</div>
                </div>
                <div class="crm-details-item">
                    <div class="crm-details-label">Origem</div>
                    <div class="crm-details-value">${esc(c.origem) || '—'}</div>
                </div>
                <div class="crm-details-item">
                    <div class="crm-details-label">Etapa</div>
                    <div class="crm-details-value"><span class="crm-details-badge" style="background:${etapaColor}22;color:${etapaColor};">${etapaLabel(c.status)}</span></div>
                </div>
                <div class="crm-details-item">
                    <div class="crm-details-label">Data de Criação</div>
                    <div class="crm-details-value">${fmtData(c.datacriacao)}</div>
                </div>
                <div class="crm-details-item crm-details-full">
                    <div class="crm-details-label">Observações</div>
                    <div class="crm-details-value" style="white-space:pre-wrap;">${esc(c.observacao) || '—'}</div>
                </div>
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
                <button type="button" class="btn-cancel" onclick="fecharModal('modal-dynamic')">Fechar</button>
            </div>
        `);
    };

    // ---- Excluir ----
    window.crmExcluir = async function (id) {
        if (!confirm('Excluir este contato?')) return;
        try {
            await api(`/api/crm/contatos/${id}`, { method: 'DELETE' });
            crmContatos = crmContatos.filter(c => c.id !== id);
            renderTopo();
            renderKanban();
        } catch (e) {
            alert(e.message);
        }
    };

})();
