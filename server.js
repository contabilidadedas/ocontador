const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(cors());

// Serve os arquivos estáticos da pasta do projeto (HTML, CSS, JS do frontend)
app.use(express.static(__dirname));

// Configuração do Banco de Dados PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://parlatore_user:2lfi2xUAvbGHiRYIBT7FhuFKggkD6VyS@dpg-dav6ph8473hc73dsdm2g-a/parlatore',
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_super_segura';

// ==========================================
// AUDIT LOG - Registro de atividades (LGPD)
// ==========================================
async function registrarAuditoria(usuarioId, usuarioTipo, acao, req, extra) {
    try {
        const { entidade, entidade_id, empresa_id, versao, detalhe } = extra || {};
        await pool.query(
            `INSERT INTO audit_log (usuario_id, usuario_tipo, acao, ip, entidade, entidade_id, empresa_id, versao, detalhe, datacriacao)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [usuarioId, usuarioTipo, acao, req.ip || 'unknown',
             entidade || null, entidade_id || null, empresa_id || null, versao || null, detalhe || null]
        );
    } catch (e) {
        console.error('Erro ao registrar auditoria:', e.message);
    }
}

// Função para criar as tabelas e colunas automaticamente
async function criarTabelasAutomaticamente() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contadores (
                id SERIAL PRIMARY KEY,
                nomeescritorio VARCHAR(255),
                email VARCHAR(255) UNIQUE NOT NULL,
                senha VARCHAR(255),
                senhahash VARCHAR(255),
                is_admin BOOLEAN DEFAULT FALSE,
                ativo BOOLEAN DEFAULT TRUE,
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS empresas (
                id SERIAL PRIMARY KEY,
                cnpj VARCHAR(20) UNIQUE NOT NULL,
                razaosocial VARCHAR(255) NOT NULL,
                emailempresa VARCHAR(255),
                senha VARCHAR(255),
                senhahash VARCHAR(255),
                contador_id INTEGER,
                contadorid INTEGER,
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS guias (
                id SERIAL PRIMARY KEY,
                cnpj VARCHAR(20) NOT NULL,
                tipoimposto VARCHAR(50),
                competencia VARCHAR(20),
                valor NUMERIC(12, 2),
                vencimento DATE,
                pix TEXT,
                arquivonome VARCHAR(255),
                arquivodados BYTEA,
                arquivotipo VARCHAR(100),
                status VARCHAR(50) DEFAULT 'pendente',
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS documentos (
                id SERIAL PRIMARY KEY,
                empresa_id INTEGER,
                contador_id INTEGER,
                tipo VARCHAR(30) DEFAULT 'pendente',
                categoria VARCHAR(100),
                descricao VARCHAR(255),
                arquivonome VARCHAR(255),
                arquivodados BYTEA,
                arquivotipo VARCHAR(100),
                status VARCHAR(50) DEFAULT 'pendente',
                enviado_por VARCHAR(20) DEFAULT 'contador',
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS pendencias (
                id SERIAL PRIMARY KEY,
                empresa_id INTEGER,
                contador_id INTEGER,
                descricao VARCHAR(255) NOT NULL,
                prioridade VARCHAR(20) DEFAULT 'media',
                status VARCHAR(50) DEFAULT 'pendente',
                prazo DATE,
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS checklist_mensal (
                id SERIAL PRIMARY KEY,
                empresa_id INTEGER,
                item VARCHAR(255) NOT NULL,
                status VARCHAR(50) DEFAULT 'pendente',
                competencia VARCHAR(20),
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS avisos (
                id SERIAL PRIMARY KEY,
                contador_id INTEGER,
                empresa_id INTEGER,
                titulo VARCHAR(255),
                mensagem TEXT,
                tipo VARCHAR(50) DEFAULT 'info',
                lido BOOLEAN DEFAULT FALSE,
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS chat_mensagens (
                id SERIAL PRIMARY KEY,
                contador_id INTEGER,
                empresa_id INTEGER,
                remetente VARCHAR(20) NOT NULL,
                mensagem TEXT NOT NULL,
                lido BOOLEAN DEFAULT FALSE,
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER,
                usuario_tipo VARCHAR(20),
                acao VARCHAR(255),
                ip VARCHAR(50),
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS financeiro (
                id SERIAL PRIMARY KEY,
                contador_id INTEGER,
                empresa_id INTEGER,
                descricao VARCHAR(255),
                valor NUMERIC(12,2),
                status VARCHAR(50) DEFAULT 'pendente',
                vencimento DATE,
                competencia VARCHAR(20),
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS calendario_obrigacoes (
                id SERIAL PRIMARY KEY,
                contador_id INTEGER,
                empresa_id INTEGER,
                titulo VARCHAR(255) NOT NULL,
                descricao TEXT,
                tipo VARCHAR(50) DEFAULT 'obrigacao',
                dataevento DATE NOT NULL,
                status VARCHAR(50) DEFAULT 'pendente',
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS procuracoes (
                id SERIAL PRIMARY KEY,
                contador_id INTEGER,
                empresa_id INTEGER,
                tipo VARCHAR(100),
                status VARCHAR(50) DEFAULT 'ativo',
                validade DATE,
                observacao TEXT,
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS notas_fiscais (
                id SERIAL PRIMARY KEY,
                empresa_id INTEGER,
                contador_id INTEGER,
                numero VARCHAR(50),
                competencia VARCHAR(20),
                valor NUMERIC(12,2),
                status VARCHAR(50) DEFAULT 'recebida',
                arquivonome VARCHAR(255),
                arquivodados BYTEA,
                arquivotipo VARCHAR(100),
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS folha_pagamento (
                id SERIAL PRIMARY KEY,
                empresa_id INTEGER,
                contador_id INTEGER,
                competencia VARCHAR(20),
                funcionarios INTEGER DEFAULT 0,
                valor_total NUMERIC(12,2) DEFAULT 0,
                status VARCHAR(50) DEFAULT 'pendente',
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS crm_contatos (
                id SERIAL PRIMARY KEY,
                contador_id INTEGER NOT NULL,
                nome VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                telefone VARCHAR(50),
                empresa VARCHAR(255),
                cargo VARCHAR(100),
                tipo VARCHAR(30) DEFAULT 'lead',
                status VARCHAR(30) DEFAULT 'novo',
                observacao TEXT,
                datacriacao TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS crm_atividades (
                id SERIAL PRIMARY KEY,
                contato_id INTEGER NOT NULL,
                contador_id INTEGER NOT NULL,
                tipo VARCHAR(30) DEFAULT 'ligacao',
                descricao TEXT,
                resultado VARCHAR(255),
                proxima_acao VARCHAR(255),
                responsavel VARCHAR(255),
                data TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS crm_historico_etapas (
                id SERIAL PRIMARY KEY,
                contato_id INTEGER NOT NULL,
                contador_id INTEGER NOT NULL,
                etapa_anterior VARCHAR(30),
                etapa_nova VARCHAR(30),
                responsavel VARCHAR(255),
                data_mudanca TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS crm_tarefas (
                id SERIAL PRIMARY KEY,
                contato_id INTEGER,
                contador_id INTEGER NOT NULL,
                empresa_id INTEGER,
                descricao VARCHAR(255) NOT NULL,
                prazo DATE,
                responsavel VARCHAR(255),
                prioridade VARCHAR(20) DEFAULT 'media',
                status VARCHAR(50) DEFAULT 'pendente',
                datacriacao TIMESTAMP DEFAULT NOW()
            );
        `);

        // Garante colunas em tabelas antigas
        await pool.query(`ALTER TABLE contadores ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;`);
        await pool.query(`ALTER TABLE contadores ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;`);
        await pool.query(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS primeiro_acesso BOOLEAN DEFAULT TRUE;`);
        await pool.query(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS inadimplente BOOLEAN DEFAULT FALSE;`);
        await pool.query(`ALTER TABLE guias ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pendente';`);
        // Garante colunas extras na tabela de guias (Central de Guias)
        await pool.query(`ALTER TABLE guias ADD COLUMN IF NOT EXISTS empresa_id INTEGER;`);
        await pool.query(`ALTER TABLE guias ADD COLUMN IF NOT EXISTS descricao TEXT;`);
        await pool.query(`ALTER TABLE guias ADD COLUMN IF NOT EXISTS observacao TEXT;`);
        await pool.query(`ALTER TABLE guias ADD COLUMN IF NOT EXISTS versao INTEGER DEFAULT 1;`);

        // Tabela de histórico de guias
        await pool.query(`
            CREATE TABLE IF NOT EXISTS guia_historico (
                id SERIAL PRIMARY KEY,
                guia_id INTEGER NOT NULL,
                usuario_id INTEGER,
                usuario_tipo VARCHAR(20),
                acao VARCHAR(255),
                detalhe TEXT,
                data TIMESTAMP DEFAULT NOW()
            );
        `);

        // Garante colunas extras na tabela de documentos (Central de Documentos)
        await pool.query(`ALTER TABLE documentos ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(50);`);
        await pool.query(`ALTER TABLE documentos ADD COLUMN IF NOT EXISTS competencia VARCHAR(20);`);
        await pool.query(`ALTER TABLE documentos ADD COLUMN IF NOT EXISTS observacao TEXT;`);
        await pool.query(`ALTER TABLE documentos ADD COLUMN IF NOT EXISTS usuario_envio VARCHAR(255);`);

        // Tabela de histórico de documentos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS documento_historico (
                id SERIAL PRIMARY KEY,
                documento_id INTEGER NOT NULL,
                usuario_id INTEGER,
                usuario_tipo VARCHAR(20),
                acao VARCHAR(255),
                detalhe TEXT,
                data TIMESTAMP DEFAULT NOW()
            );
        `);

        // Tabela de configurações do sistema (valor mensal por contador, etc.)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS config_sistema (
                id SERIAL PRIMARY KEY,
                chave VARCHAR(100) UNIQUE NOT NULL,
                valor TEXT,
                datacriacao TIMESTAMP DEFAULT NOW()
            );
        `);
        // Valor padrão: R$ 99 por contador ativo por mês
        await pool.query(`INSERT INTO config_sistema (chave, valor) VALUES ('valor_mensal_contador', '99') ON CONFLICT (chave) DO NOTHING;`);

        // ==========================================
        // ETAPA 9 — ORDENS DE SERVIÇO E DOCUMENTOS FISCAIS
        // ==========================================
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ordens_servico (
                id SERIAL PRIMARY KEY,
                empresa_id INTEGER NOT NULL,
                contador_id INTEGER NOT NULL,
                numero VARCHAR(50),
                cliente_nome VARCHAR(255),
                cliente_cpf_cnpj VARCHAR(20),
                cliente_endereco VARCHAR(500),
                cliente_municipio VARCHAR(255),
                cliente_uf VARCHAR(2),
                servico_descricao TEXT,
                quantidade NUMERIC(12,2) DEFAULT 1,
                valor_unitario NUMERIC(12,2) DEFAULT 0,
                valor_total NUMERIC(12,2) DEFAULT 0,
                desconto NUMERIC(12,2) DEFAULT 0,
                observacoes TEXT,
                status VARCHAR(50) DEFAULT 'rascunho',
                datacriacao TIMESTAMP DEFAULT NOW(),
                data_atualizacao TIMESTAMP DEFAULT NOW()
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS documentos_fiscais (
                id SERIAL PRIMARY KEY,
                empresa_id INTEGER NOT NULL,
                contador_id INTEGER NOT NULL,
                ordem_servico_id INTEGER,
                tipo VARCHAR(10) NOT NULL,
                numero VARCHAR(50),
                serie VARCHAR(10),
                chave_acesso VARCHAR(44),
                protocolo VARCHAR(50),
                status VARCHAR(50) DEFAULT 'rascunho',
                valor NUMERIC(12,2) DEFAULT 0,
                xml TEXT,
                pdf_danfe BYTEA,
                pdf_nome VARCHAR(255),
                data_emissao TIMESTAMP,
                data_autorizacao TIMESTAMP,
                dados_fiscais JSONB,
                datacriacao TIMESTAMP DEFAULT NOW()
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS documento_fiscal_historico (
                id SERIAL PRIMARY KEY,
                documento_fiscal_id INTEGER NOT NULL,
                acao VARCHAR(255) NOT NULL,
                detalhe TEXT,
                usuario_id INTEGER,
                usuario_tipo VARCHAR(20),
                data TIMESTAMP DEFAULT NOW()
            );
        `);

        // ==========================================
        // SEGURANÇA E AUDITORIA — colunas extras
        // ==========================================
        // Colunas adicionais no audit_log para rastreabilidade completa
        await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entidade VARCHAR(50);`);
        await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entidade_id INTEGER;`);
        await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS empresa_id INTEGER;`);
        await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS versao INTEGER;`);
        await pool.query(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS detalhe TEXT;`);

        // Versionamento de documentos (igual ao que já existe em guias)
        await pool.query(`ALTER TABLE documentos ADD COLUMN IF NOT EXISTS versao INTEGER DEFAULT 1;`);
        await pool.query(`ALTER TABLE documentos ADD COLUMN IF NOT EXISTS versao_anterior_id INTEGER;`);

        // Garante colunas extras no CRM
        await pool.query(`ALTER TABLE crm_contatos ADD COLUMN IF NOT EXISTS origem VARCHAR(50);`);
        await pool.query(`ALTER TABLE crm_contatos ADD COLUMN IF NOT EXISTS servico_interesse VARCHAR(100);`);
        await pool.query(`ALTER TABLE crm_contatos ADD COLUMN IF NOT EXISTS responsavel VARCHAR(255);`);
        await pool.query(`ALTER TABLE crm_contatos ADD COLUMN IF NOT EXISTS valor_proposta NUMERIC(12,2) DEFAULT 0;`);
        await pool.query(`ALTER TABLE crm_contatos ADD COLUMN IF NOT EXISTS data_ultimo_contato TIMESTAMP;`);
        await pool.query(`ALTER TABLE crm_contatos ADD COLUMN IF NOT EXISTS proxima_tarefa TEXT;`);
        await pool.query(`ALTER TABLE crm_contatos ADD COLUMN IF NOT EXISTS motivo_perda VARCHAR(100);`);
        await pool.query(`ALTER TABLE crm_contatos ADD COLUMN IF NOT EXISTS empresa_id INTEGER;`);
        await pool.query(`ALTER TABLE crm_contatos ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(50);`);
        await pool.query(`ALTER TABLE crm_contatos ADD COLUMN IF NOT EXISTS data_primeiro_contato TIMESTAMP;`);
        await pool.query(`ALTER TABLE crm_contatos ADD COLUMN IF NOT EXISTS data_proposta TIMESTAMP;`);
        await pool.query(`ALTER TABLE crm_contatos ADD COLUMN IF NOT EXISTS data_fechamento TIMESTAMP;`);

        // ==========================================
        // ROW LEVEL SECURITY (RLS) — defense-in-depth
        // ==========================================
        // Habilita RLS nas tabelas sensíveis. As policies usam a session variable
        // app.contador_id: se não estiver setada (pool padrão da aplicação), permite tudo;
        // se estiver setada (conexão direta ao banco), filtra por contador_id.
        const rlsTables = ['documentos', 'guias', 'empresas', 'pendencias', 'financeiro',
            'calendario_obrigacoes', 'procuracoes', 'notas_fiscais', 'folha_pagamento',
            'checklist_mensal', 'avisos', 'chat_mensagens', 'crm_contatos', 'crm_atividades',
            'crm_tarefas', 'documento_historico', 'guia_historico', 'audit_log',
            'ordens_servico', 'documentos_fiscais', 'documento_fiscal_historico'];

        for (const tabela of rlsTables) {
            await pool.query(`ALTER TABLE ${tabela} ENABLE ROW LEVEL SECURITY;`);
            await pool.query(`ALTER TABLE ${tabela} FORCE ROW LEVEL SECURITY;`);
        }

        // Tabelas com coluna contador_id (maioria)
        const contadorIdTables = ['documentos', 'pendencias', 'financeiro', 'calendario_obrigacoes',
            'procuracoes', 'notas_fiscais', 'folha_pagamento', 'avisos', 'chat_mensagens',
            'crm_contatos', 'crm_atividades', 'crm_tarefas',
            'ordens_servico', 'documentos_fiscais'];
        for (const tabela of contadorIdTables) {
            await pool.query(`DROP POLICY IF EXISTS ${tabela}_rls_policy ON ${tabela};`);
            await pool.query(`
                CREATE POLICY ${tabela}_rls_policy ON ${tabela}
                USING (current_setting('app.contador_id', true) IS NULL
                       OR contador_id = current_setting('app.contador_id', true)::INTEGER)
            `);
        }

        // empresas: tem contador_id E contadorid
        await pool.query(`DROP POLICY IF EXISTS empresas_rls_policy ON empresas;`);
        await pool.query(`
            CREATE POLICY empresas_rls_policy ON empresas
            USING (current_setting('app.contador_id', true) IS NULL
                   OR contador_id = current_setting('app.contador_id', true)::INTEGER
                   OR contadorid = current_setting('app.contador_id', true)::INTEGER)
        `);

        // guias: não tem contador_id direto — usa subquery via empresas.cnpj
        await pool.query(`DROP POLICY IF EXISTS guias_rls_policy ON guias;`);
        await pool.query(`
            CREATE POLICY guias_rls_policy ON guias
            USING (current_setting('app.contador_id', true) IS NULL
                   OR EXISTS (
                       SELECT 1 FROM empresas e
                       WHERE e.cnpj = guias.cnpj
                       AND (e.contador_id = current_setting('app.contador_id', true)::INTEGER
                            OR e.contadorid = current_setting('app.contador_id', true)::INTEGER)
                   ))
        `);

        // checklist_mensal: usa empresa_id — subquery via empresas
        await pool.query(`DROP POLICY IF EXISTS checklist_mensal_rls_policy ON checklist_mensal;`);
        await pool.query(`
            CREATE POLICY checklist_mensal_rls_policy ON checklist_mensal
            USING (current_setting('app.contador_id', true) IS NULL
                   OR EXISTS (
                       SELECT 1 FROM empresas e
                       WHERE e.id = checklist_mensal.empresa_id
                       AND (e.contador_id = current_setting('app.contador_id', true)::INTEGER
                            OR e.contadorid = current_setting('app.contador_id', true)::INTEGER)
                   ))
        `);

        // documento_historico e guia_historico: usam usuario_id + usuario_tipo
        await pool.query(`DROP POLICY IF EXISTS documento_historico_rls_policy ON documento_historico;`);
        await pool.query(`
            CREATE POLICY documento_historico_rls_policy ON documento_historico
            USING (current_setting('app.contador_id', true) IS NULL
                   OR (usuario_tipo = 'contador' AND usuario_id = current_setting('app.contador_id', true)::INTEGER))
        `);
        await pool.query(`DROP POLICY IF EXISTS guia_historico_rls_policy ON guia_historico;`);
        await pool.query(`
            CREATE POLICY guia_historico_rls_policy ON guia_historico
            USING (current_setting('app.contador_id', true) IS NULL
                   OR (usuario_tipo = 'contador' AND usuario_id = current_setting('app.contador_id', true)::INTEGER))
        `);

        // documento_fiscal_historico: usa usuario_id + usuario_tipo
        await pool.query(`DROP POLICY IF EXISTS documento_fiscal_historico_rls_policy ON documento_fiscal_historico;`);
        await pool.query(`
            CREATE POLICY documento_fiscal_historico_rls_policy ON documento_fiscal_historico
            USING (current_setting('app.contador_id', true) IS NULL
                   OR (usuario_tipo = 'contador' AND usuario_id = current_setting('app.contador_id', true)::INTEGER))
        `);

        // audit_log: filtra por usuario_id + usuario_tipo
        await pool.query(`DROP POLICY IF EXISTS audit_log_rls_policy ON audit_log;`);
        await pool.query(`
            CREATE POLICY audit_log_rls_policy ON audit_log
            USING (current_setting('app.contador_id', true) IS NULL
                   OR (usuario_tipo = 'contador' AND usuario_id = current_setting('app.contador_id', true)::INTEGER)
                   OR (usuario_tipo = 'cliente' AND empresa_id = COALESCE(current_setting('app.empresa_id', true)::INTEGER, -1)))
        `);

        console.log("✅ Tabelas, colunas e RLS verificados/criados com sucesso!");
    } catch (err) {
        console.error("❌ Erro ao criar tabelas:", err.message);
    }
}

// ==========================================
// HELPER: Executa query com contexto RLS (session variable)
// ==========================================
async function queryWithRLS(queryText, params, userContext) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (userContext?.contadorId) {
            await client.query(`SET LOCAL app.contador_id = $1`, [String(userContext.contadorId)]);
        }
        if (userContext?.empresaId) {
            await client.query(`SET LOCAL app.empresa_id = $1`, [String(userContext.empresaId)]);
        }
        const result = await client.query(queryText, params);
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// Helper: registra uma ação no histórico de um documento
async function registrarHistoricoDocumento(documentoId, usuarioId, usuarioTipo, acao, detalhe) {
    try {
        await pool.query(
            'INSERT INTO documento_historico (documento_id, usuario_id, usuario_tipo, acao, detalhe, data) VALUES ($1, $2, $3, $4, $5, NOW())',
            [documentoId, usuarioId, usuarioTipo, acao, detalhe || null]
        );
    } catch (e) {
        console.error('Erro ao registrar histórico de documento:', e.message);
    }
}

// Helper: registra uma ação no histórico de uma guia
async function registrarHistoricoGuia(guiaId, usuarioId, usuarioTipo, acao, detalhe) {
    try {
        await pool.query(
            'INSERT INTO guia_historico (guia_id, usuario_id, usuario_tipo, acao, detalhe, data) VALUES ($1, $2, $3, $4, $5, NOW())',
            [guiaId, usuarioId, usuarioTipo, acao, detalhe || null]
        );
    } catch (e) {
        console.error('Erro ao registrar histórico de guia:', e.message);
    }
}

// Helper: verifica se uma guia pertence a uma empresa do contador
async function guiaPertenceContador(guiaId, contadorId) {
    const r = await pool.query(`
        SELECT g.* FROM guias g
        JOIN empresas e ON g.cnpj = e.cnpj
        WHERE g.id = $1 AND (e.contador_id = $2 OR e.contadorid = $2)
    `, [guiaId, contadorId]);
    return r.rows.length > 0 ? r.rows[0] : null;
}

// Configuração do Multer
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ==========================================
// MIDDLEWARES DE AUTENTICAÇÃO
// ==========================================
function verificarTokenContador(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ erro: 'Token não fornecido.' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.tipo !== 'contador') return res.status(403).json({ erro: 'Acesso restrito ao painel do contador.' });
        req.contadorId = decoded.id;
        next();
    } catch (err) {
        return res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }
}

function verificarTokenCliente(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ erro: 'Token não fornecido.' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.tipo !== 'cliente') return res.status(403).json({ erro: 'Acesso restrito ao portal do cliente.' });
        req.empresaId = decoded.id;
        req.empresaCnpj = decoded.cnpj;
        next();
    } catch (err) {
        return res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }
}

// Middleware para downloads (links <a href>): aceita token no header OU na query ?token=
function verificarTokenDownload(req, res, next) {
    const authHeader = req.headers['authorization'];
    let token = authHeader ? authHeader.split(' ')[1] : null;
    if (!token && req.query.token) token = req.query.token;
    if (!token) return res.status(401).json({ erro: 'Token não fornecido.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.tipo === 'contador') {
            req.contadorId = decoded.id;
            req.tokenTipo = 'contador';
        } else if (decoded.tipo === 'cliente') {
            req.empresaId = decoded.id;
            req.empresaCnpj = decoded.cnpj;
            req.tokenTipo = 'cliente';
        } else {
            return res.status(403).json({ erro: 'Tipo de token inválido.' });
        }
        next();
    } catch (err) {
        return res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }
}

// Helper: verifica se uma empresa pertence ao contador logado
async function empresaPertenceContador(empresaId, contadorId) {
    const r = await pool.query('SELECT 1 FROM empresas WHERE id = $1 AND (contador_id = $2 OR contadorid = $2)', [empresaId, contadorId]);
    return r.rows.length > 0;
}

// Helper: valida que empresa_id (do body) pertence ao contador; retorna true ou envia 403
async function validarEmpresaContador(res, empresaId, contadorId) {
    if (!empresaId) return true; // empresa_id opcional
    if (!(await empresaPertenceContador(empresaId, contadorId))) {
        res.status(403).json({ erro: 'Você não tem acesso a esta empresa.' });
        return false;
    }
    return true;
}

// ==========================================
// 1. ROTAS DE CONTADORES
// ==========================================
// Verifica se ainda não existe nenhum contador (primeiro cadastro = admin)
app.get('/api/contador/cadastro-disponivel', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT COUNT(*) as total FROM contadores');
        const disponivel = parseInt(resultado.rows[0].total) === 0;
        res.json({ disponivel });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro no servidor: ' + erro.message });
    }
});

app.post('/api/contador/cadastro', async (req, res) => {
    try {
        let { nomeEscritorio, email, senha } = req.body;
        if (!nomeEscritorio || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos.' });
        email = email.trim().toLowerCase();
        const usuarioExiste = await pool.query('SELECT * FROM contadores WHERE LOWER(email) = $1', [email]);
        if (usuarioExiste.rows.length > 0) return res.status(400).json({ erro: 'Este e-mail já está cadastrado.' });

        // Verifica se já existem contadores cadastrados
        const totalContadores = await pool.query('SELECT COUNT(*) as total FROM contadores');
        const ehPrimeiro = parseInt(totalContadores.rows[0].total) === 0;

        // Se não é o primeiro, exige token de admin
        if (!ehPrimeiro) {
            const authHeader = req.headers['authorization'];
            if (!authHeader) return res.status(403).json({ erro: 'Cadastro bloqueado. Solicite acesso ao administrador.' });
            try {
                const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
                const adminCheck = await pool.query('SELECT is_admin FROM contadores WHERE id = $1', [decoded.id]);
                if (!adminCheck.rows[0] || !adminCheck.rows[0].is_admin) {
                    return res.status(403).json({ erro: 'Apenas administradores podem criar novos acessos.' });
                }
            } catch (e) {
                return res.status(403).json({ erro: 'Cadastro bloqueado. Solicite acesso ao administrador.' });
            }
        }

        const senhaHash = await bcrypt.hash(senha, await bcrypt.genSalt(10));
        const resultado = await pool.query(
            'INSERT INTO contadores (nomeescritorio, email, senha, senhahash, is_admin, datacriacao) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id',
            [nomeEscritorio, email, senhaHash, senhaHash, ehPrimeiro]
        );
        await registrarAuditoria(resultado.rows[0].id, 'contador', ehPrimeiro ? 'Cadastro de escritório (Admin inicial)' : 'Admin criou novo acesso', req);
        res.status(201).json({ mensagem: ehPrimeiro ? 'Escritório cadastrado! Você é o administrador.' : 'Acesso criado com sucesso!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro no servidor: ' + erro.message });
    }
});

app.post('/api/contador/login', async (req, res) => {
    try {
        let { email, senha } = req.body;
        if (!email || !senha) return res.status(400).json({ erro: 'Preencha o e-mail e a senha.' });
        email = email.trim().toLowerCase();
        const resultado = await pool.query('SELECT * FROM contadores WHERE LOWER(email) = $1', [email]);
        if (resultado.rows.length === 0) return res.status(400).json({ erro: 'E-mail ou senha incorretos.' });
        const contador = resultado.rows[0];
        if (contador.ativo === false) return res.status(403).json({ erro: 'Conta desativada. Contate o administrador.' });
        const senhaValida = await bcrypt.compare(senha, contador.senhahash || contador.senha);
        if (!senhaValida) return res.status(400).json({ erro: 'E-mail ou senha incorretos.' });
        const token = jwt.sign({ id: contador.id, email: contador.email, isAdmin: contador.is_admin || false, tipo: 'contador' }, JWT_SECRET, { expiresIn: '7d' });
        await registrarAuditoria(contador.id, 'contador', 'Login no painel', req);
        res.json({ mensagem: 'Login realizado!', token, nomeEscritorio: contador.nomeescritorio || 'Escritório', contadorId: contador.id, isAdmin: contador.is_admin || false });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro no servidor: ' + erro.message });
    }
});

// Middleware: exige token de admin
function verificarAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ erro: 'Token não fornecido.' });
    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        if (decoded.tipo !== 'contador') return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
        req.contadorId = decoded.id;
        if (!decoded.isAdmin) return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
        next();
    } catch (err) {
        return res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }
}

// ==========================================
// 1b. ROTAS DE ADMINISTRAÇÃO (Gerenciar Acessos)
// ==========================================
// Dashboard de vendas do admin (total de contadores + ganho mensal)
app.get('/api/admin/vendas', verificarAdmin, async (req, res) => {
    try {
        const totalContadores = await pool.query('SELECT COUNT(*) as total FROM contadores');
        const contadoresAtivos = await pool.query('SELECT COUNT(*) as total FROM contadores WHERE ativo != FALSE');
        const configResult = await pool.query("SELECT valor FROM config_sistema WHERE chave = 'valor_mensal_contador'");
        const valorMensal = parseFloat(configResult.rows[0]?.valor || '99');
        const totalVendas = parseInt(totalContadores.rows[0].total);
        const ativos = parseInt(contadoresAtivos.rows[0].total);
        const ganhoMensal = ativos * valorMensal;
        res.json({ totalVendas, contadoresAtivos: ativos, valorMensal, ganhoMensal });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar vendas: ' + erro.message });
    }
});

// Atualizar valor mensal por contador
app.put('/api/admin/config', verificarAdmin, async (req, res) => {
    try {
        const { valorMensal } = req.body;
        if (valorMensal == null || isNaN(parseFloat(valorMensal))) return res.status(400).json({ erro: 'Valor mensal inválido.' });
        await pool.query("INSERT INTO config_sistema (chave, valor) VALUES ('valor_mensal_contador', $1) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor", [String(parseFloat(valorMensal))]);
        await registrarAuditoria(req.contadorId, 'contador', `Alterou valor mensal por contador para R$ ${parseFloat(valorMensal)}`, req);
        res.json({ mensagem: 'Valor atualizado com sucesso!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao atualizar config: ' + erro.message });
    }
});

app.get('/api/admin/contadores', verificarAdmin, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT id, nomeescritorio, email, is_admin, ativo, datacriacao FROM contadores ORDER BY datacriacao DESC'
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao listar acessos: ' + erro.message });
    }
});

app.post('/api/admin/contadores', verificarAdmin, async (req, res) => {
    try {
        let { nomeEscritorio, email, senha, isAdmin } = req.body;
        if (!nomeEscritorio || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos.' });
        email = email.trim().toLowerCase();
        const usuarioExiste = await pool.query('SELECT * FROM contadores WHERE LOWER(email) = $1', [email]);
        if (usuarioExiste.rows.length > 0) return res.status(400).json({ erro: 'Este e-mail já está cadastrado.' });
        const senhaHash = await bcrypt.hash(senha, await bcrypt.genSalt(10));
        const resultado = await pool.query(
            'INSERT INTO contadores (nomeescritorio, email, senha, senhahash, is_admin, ativo, datacriacao) VALUES ($1, $2, $3, $4, $5, TRUE, NOW()) RETURNING id',
            [nomeEscritorio, email, senhaHash, senhaHash, isAdmin || false]
        );
        await registrarAuditoria(req.contadorId, 'contador', `Admin criou acesso: ${nomeEscritorio} (${email})`, req);
        res.status(201).json({ mensagem: 'Acesso criado com sucesso!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao criar acesso: ' + erro.message });
    }
});

app.put('/api/admin/contadores/:id', verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { is_admin, ativo, senha } = req.body;
        if (senha) {
            const senhaHash = await bcrypt.hash(senha, await bcrypt.genSalt(10));
            await pool.query('UPDATE contadores SET senhahash = $1, senha = $1 WHERE id = $2', [senhaHash, id]);
        }
        if (typeof is_admin === 'boolean') {
            // Não permite que o único admin remova o próprio privilégio
            if (req.contadorId == id && !is_admin) {
                const totalAdmins = await pool.query('SELECT COUNT(*) as total FROM contadores WHERE is_admin = TRUE');
                if (parseInt(totalAdmins.rows[0].total) <= 1) {
                    return res.status(400).json({ erro: 'Não é possível remover o privilégio do único administrador.' });
                }
            }
            await pool.query('UPDATE contadores SET is_admin = $1 WHERE id = $2', [is_admin, id]);
        }
        if (typeof ativo === 'boolean') {
            await pool.query('UPDATE contadores SET ativo = $1 WHERE id = $2', [ativo, id]);
        }
        await registrarAuditoria(req.contadorId, 'contador', `Admin editou acesso ID: ${id}`, req);
        res.json({ mensagem: 'Acesso atualizado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao atualizar: ' + erro.message });
    }
});

app.delete('/api/admin/contadores/:id', verificarAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (req.contadorId == id) return res.status(400).json({ erro: 'Você não pode excluir sua própria conta.' });
        await pool.query('DELETE FROM contadores WHERE id = $1', [id]);
        await registrarAuditoria(req.contadorId, 'contador', `Admin excluiu acesso ID: ${id}`, req, { entidade: 'contador', entidade_id: parseInt(id) });
        res.json({ mensagem: 'Acesso excluído.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao excluir: ' + erro.message });
    }
});

// ==========================================
// 1c. CONSULTA DE AUDITORIA (Admin)
// ==========================================
app.get('/api/admin/auditoria', verificarAdmin, async (req, res) => {
    try {
        const { entidade, entidade_id, empresa_id, usuario_tipo, limite } = req.query;
        let query = `SELECT a.*, c.nomeescritorio as nome_contador, e.razaosocial as nome_empresa
                     FROM audit_log a
                     LEFT JOIN contadores c ON (a.usuario_tipo = 'contador' AND a.usuario_id = c.id)
                     LEFT JOIN empresas e ON a.empresa_id = e.id
                     WHERE 1=1`;
        const params = [];
        let idx = 1;
        if (entidade) { query += ` AND a.entidade = $${idx++}`; params.push(entidade); }
        if (entidade_id) { query += ` AND a.entidade_id = $${idx++}`; params.push(parseInt(entidade_id)); }
        if (empresa_id) { query += ` AND a.empresa_id = $${idx++}`; params.push(parseInt(empresa_id)); }
        if (usuario_tipo) { query += ` AND a.usuario_tipo = $${idx++}`; params.push(usuario_tipo); }
        query += ` ORDER BY a.datacriacao DESC LIMIT $${idx++}`;
        params.push(parseInt(limite) || 200);
        const resultado = await pool.query(query, params);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar auditoria: ' + erro.message });
    }
});

// Consulta de auditoria do próprio contador (não-admin vê só suas ações)
app.get('/api/auditoria', verificarTokenContador, async (req, res) => {
    try {
        const { entidade, entidade_id, limite } = req.query;
        let query = `SELECT a.*, e.razaosocial as nome_empresa
                     FROM audit_log a
                     LEFT JOIN empresas e ON a.empresa_id = e.id
                     WHERE a.usuario_id = $1 AND a.usuario_tipo = 'contador'`;
        const params = [req.contadorId];
        let idx = 2;
        if (entidade) { query += ` AND a.entidade = $${idx++}`; params.push(entidade); }
        if (entidade_id) { query += ` AND a.entidade_id = $${idx++}`; params.push(parseInt(entidade_id)); }
        query += ` ORDER BY a.datacriacao DESC LIMIT $${idx++}`;
        params.push(parseInt(limite) || 100);
        const resultado = await pool.query(query, params);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar auditoria: ' + erro.message });
    }
});

// ==========================================
// 2. ROTAS DE EMPRESAS (CLIENTES)
// ==========================================
app.post('/api/cliente/login', async (req, res) => {
    try {
        let { cnpj, senha } = req.body;
        if (!cnpj || !senha) return res.status(400).json({ erro: 'Preencha o CNPJ e a senha.' });
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        const resultado = await pool.query('SELECT * FROM empresas WHERE cnpj = $1', [cnpjLimpo]);
        if (resultado.rows.length === 0) return res.status(400).json({ erro: 'CNPJ ou senha incorretos.' });
        const empresa = resultado.rows[0];
        const senhaValida = await bcrypt.compare(senha, empresa.senhahash || empresa.senha);
        if (!senhaValida) return res.status(400).json({ erro: 'CNPJ ou senha incorretos.' });
        const token = jwt.sign({ id: empresa.id, cnpj: empresa.cnpj, tipo: 'cliente' }, JWT_SECRET, { expiresIn: '7d' });
        await registrarAuditoria(empresa.id, 'cliente', 'Login do cliente', req);
        res.json({ mensagem: 'Login realizado!', token, razaoSocial: empresa.razaosocial, primeiroAcesso: empresa.primeiro_acesso, empresaId: empresa.id });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro no servidor: ' + erro.message });
    }
});

app.post('/api/cliente/alterar-senha', verificarTokenCliente, async (req, res) => {
    try {
        const { novaSenha } = req.body;
        if (!novaSenha) return res.status(400).json({ erro: 'Nova senha é obrigatória.' });
        const senhaHash = await bcrypt.hash(novaSenha, await bcrypt.genSalt(10));
        await pool.query('UPDATE empresas SET senhahash = $1, senha = $1, primeiro_acesso = FALSE WHERE id = $2', [senhaHash, req.empresaId]);
        await registrarAuditoria(req.empresaId, 'cliente', 'Alterou sua senha', req);
        res.json({ mensagem: 'Senha alterada com sucesso!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao alterar senha: ' + erro.message });
    }
});

app.get('/api/empresas', verificarTokenContador, async (req, res) => {
    try {
        const empresas = await pool.query(
            `SELECT e.*, 
                (SELECT COUNT(*) FROM pendencias p WHERE p.empresa_id = e.id AND p.status = 'pendente') as total_pendencias,
                (SELECT COUNT(*) FROM guias g WHERE g.cnpj = e.cnpj AND g.vencimento >= CURRENT_DATE AND g.status = 'pendente') as guias_vencer
             FROM empresas e 
             WHERE e.contador_id = $1 OR e.contadorid = $1 
             ORDER BY e.datacriacao DESC`,
            [req.contadorId]
        );
        res.json(empresas.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar empresas: ' + erro.message });
    }
});

app.post('/api/cadastrar-empresa', async (req, res) => {
    try {
        let { cnpj, razaoSocial, emailEmpresa, senha } = req.body;
        if (!cnpj || !razaoSocial || !senha) return res.status(400).json({ erro: 'Preencha os campos obrigatórios.' });
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        const empresaExiste = await pool.query('SELECT * FROM empresas WHERE cnpj = $1', [cnpjLimpo]);
        if (empresaExiste.rows.length > 0) return res.status(400).json({ erro: 'Este CNPJ já está cadastrado.' });
        const senhaHash = await bcrypt.hash(senha, await bcrypt.genSalt(10));
        let contadorId = null;
        const authHeader = req.headers['authorization'];
        if (authHeader) {
            try { contadorId = jwt.verify(authHeader.split(' ')[1], JWT_SECRET).id; } catch (e) {}
        }
        await pool.query(
            `INSERT INTO empresas (cnpj, razaosocial, emailempresa, senha, senhahash, contador_id, contadorid, primeiro_acesso, datacriacao) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, NOW())`,
            [cnpjLimpo, razaoSocial, emailEmpresa || '', senhaHash, senhaHash, contadorId, contadorId]
        );
        if (contadorId) await registrarAuditoria(contadorId, 'contador', `Cadastrou empresa: ${razaoSocial}`, req,
            { entidade: 'empresa', detalhe: `CNPJ: ${cnpjLimpo}` });
        res.status(201).json({ mensagem: 'Empresa cadastrada com sucesso!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao cadastrar empresa: ' + erro.message });
    }
});

app.delete('/api/empresas/:id', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM empresas WHERE id = $1 AND (contador_id = $2 OR contadorid = $2)', [id, req.contadorId]);
        await registrarAuditoria(req.contadorId, 'contador', `Excluiu empresa ID: ${id}`, req,
            { entidade: 'empresa', entidade_id: parseInt(id) });
        res.json({ mensagem: 'Empresa excluída.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao excluir: ' + erro.message });
    }
});

app.put('/api/empresas/:id/inadimplente', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const { inadimplente } = req.body;
        await pool.query('UPDATE empresas SET inadimplente = $1 WHERE id = $2 AND (contador_id = $3 OR contadorid = $3)', [inadimplente, id, req.contadorId]);
        res.json({ mensagem: 'Status atualizado.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao atualizar: ' + erro.message });
    }
});

// ==========================================
// 3. ROTAS DE GUIAS E IMPOSTOS
// ==========================================
app.post('/api/guias', verificarTokenContador, upload.single('arquivo'), async (req, res) => {
    try {
        const { cnpj, tipoimposto, competencia, valor, vencimento, pix, empresa_id, descricao, observacao } = req.body;
        const cnpjLimpo = cnpj ? cnpj.replace(/\D/g, '') : '';
        const statusInicial = 'rascunho';
        const result = await pool.query(
            `INSERT INTO guias (cnpj, empresa_id, tipoimposto, competencia, valor, vencimento, pix, descricao, observacao, arquivonome, arquivodados, arquivotipo, status, versao, datacriacao) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, NOW()) RETURNING id`,
            [cnpjLimpo, empresa_id || null, tipoimposto, competencia, valor || 0, vencimento || null, pix || '',
             descricao || '', observacao || '',
             req.file ? req.file.originalname : null, req.file ? req.file.buffer : null, req.file ? req.file.mimetype : null,
             statusInicial]
        );
        const guiaId = result.rows[0].id;
        await registrarHistoricoGuia(guiaId, req.contadorId, 'contador', 'Criação', `Guia ${tipoimposto} criada como rascunho`);
        await registrarAuditoria(req.contadorId, 'contador', `Cadastrou guia ${tipoimposto} para CNPJ ${cnpjLimpo}`, req,
            { entidade: 'guia', entidade_id: guiaId, empresa_id: parseInt(empresa_id) || null, versao: 1 });
        res.status(201).json({ mensagem: 'Guia criada como rascunho com sucesso!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao salvar guia: ' + erro.message });
    }
});

app.get('/api/guias/:cnpj', verificarTokenDownload, async (req, res) => {
    try {
        const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
        // Contador só pode ver guias de suas empresas; cliente só pode ver as suas
        if (req.tokenTipo === 'contador') {
            const empresa = await pool.query('SELECT 1 FROM empresas WHERE cnpj = $1 AND (contador_id = $2 OR contadorid = $2)', [cnpjLimpo, req.contadorId]);
            if (empresa.rows.length === 0) return res.status(403).json({ erro: 'Você não tem acesso a esta empresa.' });
        } else if (req.tokenTipo === 'cliente' && cnpjLimpo !== req.empresaCnpj) {
            return res.status(403).json({ erro: 'Você não tem acesso a estas guias.' });
        }
        const guias = await pool.query(
            'SELECT id, cnpj, tipoimposto, competencia, valor, vencimento, pix, arquivonome, arquivotipo, status, datacriacao FROM guias WHERE cnpj = $1 ORDER BY datacriacao DESC',
            [cnpjLimpo]
        );
        res.json(guias.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar guias: ' + erro.message });
    }
});

app.get('/api/guias', verificarTokenContador, async (req, res) => {
    try {
        const { status, empresa_id, tipo } = req.query;
        let query = `SELECT g.*, e.razaosocial 
             FROM guias g 
             JOIN empresas e ON g.cnpj = e.cnpj 
             WHERE e.contador_id = $1 OR e.contadorid = $1`;
        const params = [req.contadorId];
        let idx = 2;
        if (status) { query += ` AND g.status = $${idx++}`; params.push(status); }
        if (empresa_id) { query += ` AND g.empresa_id = $${idx++}`; params.push(empresa_id); }
        if (tipo) { query += ` AND g.tipoimposto = $${idx++}`; params.push(tipo); }
        query += ' ORDER BY g.datacriacao DESC';
        const guias = await pool.query(query, params);
        res.json(guias.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar guias: ' + erro.message });
    }
});

app.put('/api/guias/:id/status', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const statusValidos = ['rascunho', 'publicada', 'visualizada', 'baixada', 'paga', 'vencida', 'cancelada', 'pendente', 'pago'];
        if (!statusValidos.includes(status)) return res.status(400).json({ erro: 'Status inválido.' });
        const guia = await guiaPertenceContador(id, req.contadorId);
        if (!guia) return res.status(404).json({ erro: 'Guia não encontrada ou acesso negado.' });
        const statusAnterior = guia.status;
        await pool.query('UPDATE guias SET status = $1 WHERE id = $2', [status, id]);
        await registrarHistoricoGuia(id, req.contadorId, 'contador', 'Status alterado', `De "${statusAnterior}" para "${status}"`);
        res.json({ mensagem: 'Status atualizado.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao atualizar: ' + erro.message });
    }
});

// Publicar guia (rascunho → publicada)
app.put('/api/guias/:id/publicar', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const guia = await guiaPertenceContador(id, req.contadorId);
        if (!guia) return res.status(404).json({ erro: 'Guia não encontrada ou acesso negado.' });
        if (guia.status !== 'rascunho' && guia.status !== 'pendente') return res.status(400).json({ erro: 'Apenas guias em rascunho podem ser publicadas.' });
        await pool.query('UPDATE guias SET status = $1 WHERE id = $2', ['publicada', id]);
        await registrarHistoricoGuia(id, req.contadorId, 'contador', 'Publicação', 'Guia publicada para o portal do cliente');
        await registrarAuditoria(req.contadorId, 'contador', `Publicou guia ${guia.tipoimposto} (ID: ${id})`, req,
            { entidade: 'guia', entidade_id: parseInt(id), versao: guia.versao || 1 });
        res.json({ mensagem: 'Guia publicada com sucesso!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao publicar: ' + erro.message });
    }
});

// Cancelar guia
app.put('/api/guias/:id/cancelar', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const guia = await guiaPertenceContador(id, req.contadorId);
        if (!guia) return res.status(404).json({ erro: 'Guia não encontrada ou acesso negado.' });
        if (guia.status === 'cancelada') return res.status(400).json({ erro: 'Guia já está cancelada.' });
        if (guia.status === 'paga') return res.status(400).json({ erro: 'Não é possível cancelar uma guia paga.' });
        const statusAnterior = guia.status;
        await pool.query('UPDATE guias SET status = $1 WHERE id = $2', ['cancelada', id]);
        await registrarHistoricoGuia(id, req.contadorId, 'contador', 'Cancelamento', `Guia cancelada (status anterior: ${statusAnterior})`);
        await registrarAuditoria(req.contadorId, 'contador', `Cancelou guia ${guia.tipoimposto} (ID: ${id})`, req,
            { entidade: 'guia', entidade_id: parseInt(id), versao: guia.versao || 1, detalhe: `Status anterior: ${statusAnterior}` });
        res.json({ mensagem: 'Guia cancelada.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao cancelar: ' + erro.message });
    }
});

// Editar guia (apenas se estiver em rascunho — versionamento)
app.put('/api/guias/:id', verificarTokenContador, upload.single('arquivo'), async (req, res) => {
    try {
        const { id } = req.params;
        const guia = await guiaPertenceContador(id, req.contadorId);
        if (!guia) return res.status(404).json({ erro: 'Guia não encontrada ou acesso negado.' });
        if (guia.status !== 'rascunho' && guia.status !== 'pendente') return res.status(400).json({ erro: 'Apenas guias em rascunho podem ser editadas.' });
        const { tipoimposto, competencia, valor, vencimento, pix, descricao, observacao } = req.body;
        const updates = [];
        const params = [];
        let idx = 1;
        if (tipoimposto !== undefined) { updates.push(`tipoimposto = $${idx++}`); params.push(tipoimposto); }
        if (competencia !== undefined) { updates.push(`competencia = $${idx++}`); params.push(competencia); }
        if (valor !== undefined) { updates.push(`valor = $${idx++}`); params.push(valor); }
        if (vencimento !== undefined) { updates.push(`vencimento = $${idx++}`); params.push(vencimento || null); }
        if (pix !== undefined) { updates.push(`pix = $${idx++}`); params.push(pix); }
        if (descricao !== undefined) { updates.push(`descricao = $${idx++}`); params.push(descricao); }
        if (observacao !== undefined) { updates.push(`observacao = $${idx++}`); params.push(observacao); }
        if (req.file) {
            updates.push(`arquivonome = $${idx++}`); params.push(req.file.originalname);
            updates.push(`arquivodados = $${idx++}`); params.push(req.file.buffer);
            updates.push(`arquivotipo = $${idx++}`); params.push(req.file.mimetype);
        }
        if (updates.length > 0) {
            updates.push(`versao = versao + 1`);
            params.push(id);
            await pool.query(`UPDATE guias SET ${updates.join(', ')} WHERE id = $${idx}`, params);
            await registrarHistoricoGuia(id, req.contadorId, 'contador', 'Alteração/Versionamento', `Guia editada (versão ${guia.versao + 1})`);
        }
        res.json({ mensagem: 'Guia atualizada com sucesso!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao editar: ' + erro.message });
    }
});

// Histórico de uma guia (contador)
app.get('/api/guias/:id/historico', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const guia = await guiaPertenceContador(id, req.contadorId);
        if (!guia) return res.status(404).json({ erro: 'Guia não encontrada ou acesso negado.' });
        const resultado = await pool.query(
            'SELECT * FROM guia_historico WHERE guia_id = $1 ORDER BY data DESC', [id]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.delete('/api/guias/:id', verificarTokenContador, async (req, res) => {
    try {
        const guia = await pool.query('SELECT g.cnpj FROM guias g WHERE g.id = $1', [req.params.id]);
        if (guia.rows.length === 0) return res.status(404).json({ erro: 'Guia não encontrada.' });
        const empresa = await pool.query('SELECT 1 FROM empresas WHERE cnpj = $1 AND (contador_id = $2 OR contadorid = $2)', [guia.rows[0].cnpj, req.contadorId]);
        if (empresa.rows.length === 0) return res.status(403).json({ erro: 'Você não tem acesso a esta guia.' });
        await pool.query('DELETE FROM guias WHERE id = $1', [req.params.id]);
        await registrarAuditoria(req.contadorId, 'contador', `Excluiu guia ID: ${req.params.id}`, req,
            { entidade: 'guia', entidade_id: parseInt(req.params.id) });
        res.json({ mensagem: 'Guia excluída.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.get('/api/guias/download/:id', verificarTokenDownload, async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await pool.query('SELECT cnpj, arquivonome, arquivodados, arquivotipo, status FROM guias WHERE id = $1', [id]);
        if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
        const guia = resultado.rows[0];
        // Verifica propriedade ANTES de revelar existência do arquivo
        if (req.tokenTipo === 'contador') {
            const empresa = await pool.query('SELECT 1 FROM empresas WHERE cnpj = $1 AND (contador_id = $2 OR contadorid = $2)', [guia.cnpj, req.contadorId]);
            if (empresa.rows.length === 0) return res.status(403).json({ erro: 'Acesso negado.' });
            if (!guia.arquivodados) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
            await registrarHistoricoGuia(id, req.contadorId, 'contador', 'Download', 'Contador baixou o arquivo da guia');
            await registrarAuditoria(req.contadorId, 'contador', 'Download de guia', req, { entidade: 'guia', entidade_id: parseInt(id) });
        } else if (req.tokenTipo === 'cliente' && guia.cnpj === req.empresaCnpj) {
            if (!guia.arquivodados) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
            // Atualiza status para 'baixada' se estava 'publicada' ou 'visualizada'
            if (guia.status === 'publicada' || guia.status === 'visualizada') {
                await pool.query('UPDATE guias SET status = $1 WHERE id = $2', ['baixada', id]);
            }
            await registrarHistoricoGuia(id, req.empresaId, 'cliente', 'Download', 'Cliente baixou o arquivo da guia');
            await registrarAuditoria(req.empresaId, 'cliente', 'Download de guia', req, { entidade: 'guia', entidade_id: parseInt(id) });
        } else {
            return res.status(403).json({ erro: 'Acesso negado.' });
        }
        res.setHeader('Content-Type', guia.arquivotipo || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${guia.arquivonome || 'guia.pdf'}"`);
        res.send(guia.arquivodados);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao baixar: ' + erro.message });
    }
});

// ==========================================
// 4. DASHBOARD - Estatísticas
// ==========================================
app.get('/api/dashboard/stats', verificarTokenContador, async (req, res) => {
    try {
        const cid = req.contadorId;
        const [clientes, inadimplentes, docsHoje, pendencias, guiasVencer] = await Promise.all([
            pool.query('SELECT COUNT(*) as total FROM empresas WHERE contador_id = $1 OR contadorid = $1', [cid]),
            pool.query('SELECT COUNT(*) as total FROM empresas WHERE (contador_id = $1 OR contadorid = $1) AND inadimplente = TRUE', [cid]),
            pool.query('SELECT COUNT(*) as total FROM documentos WHERE contador_id = $1 AND DATE(datacriacao) = CURRENT_DATE', [cid]),
            pool.query('SELECT COUNT(*) as total FROM pendencias WHERE contador_id = $1 AND status = \'pendente\'', [cid]),
            pool.query(`SELECT COUNT(*) as total FROM guias g 
                        JOIN empresas e ON g.cnpj = e.cnpj 
                        WHERE (e.contador_id = $1 OR e.contadorid = $1) AND g.vencimento >= CURRENT_DATE AND g.status = 'pendente'`, [cid])
        ]);

        const [urgente, atencao, emDia, ganhos] = await Promise.all([
            pool.query('SELECT COUNT(*) as total FROM pendencias WHERE contador_id = $1 AND prioridade = $2 AND status = $3', [cid, 'urgente', 'pendente']),
            pool.query('SELECT COUNT(*) as total FROM pendencias WHERE contador_id = $1 AND prioridade = $2 AND status = $3', [cid, 'atencao', 'pendente']),
            pool.query('SELECT COUNT(*) as total FROM empresas WHERE (contador_id = $1 OR contadorid = $1) AND (inadimplente = FALSE OR inadimplente IS NULL)', [cid]),
            pool.query(`SELECT
                COALESCE(SUM(CASE WHEN status = 'pago' THEN valor ELSE 0 END), 0) as recebido,
                COALESCE(SUM(CASE WHEN status != 'pago' THEN valor ELSE 0 END), 0) as pendente
             FROM financeiro WHERE contador_id = $1`, [cid])
        ]);

        res.json({
            clientes: parseInt(clientes.rows[0].total),
            inadimplentes: parseInt(inadimplentes.rows[0].total),
            documentosHoje: parseInt(docsHoje.rows[0].total),
            pendencias: parseInt(pendencias.rows[0].total),
            guiasVencer: parseInt(guiasVencer.rows[0].total),
            ganhosRecebidos: parseFloat(ganhos.rows[0].recebido || 0),
            ganhosAReceber: parseFloat(ganhos.rows[0].pendente || 0),
            status: {
                urgente: parseInt(urgente.rows[0].total),
                atencao: parseInt(atencao.rows[0].total),
                emDia: parseInt(emDia.rows[0].total)
            }
        });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar estatísticas: ' + erro.message });
    }
});

app.get('/api/dashboard/ganhos-mensais', verificarTokenContador, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT
                TO_CHAR(DATE_TRUNC('month', datacriacao), 'YYYY-MM') as mes,
                COALESCE(SUM(CASE WHEN status = 'pago' THEN valor ELSE 0 END), 0) as recebido,
                COALESCE(SUM(CASE WHEN status != 'pago' THEN valor ELSE 0 END), 0) as pendente
             FROM financeiro
             WHERE contador_id = $1
               AND datacriacao >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
             GROUP BY DATE_TRUNC('month', datacriacao)
             ORDER BY mes ASC`,
            [req.contadorId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.get('/api/dashboard/pendencias-recentes', verificarTokenContador, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT p.*, e.razaosocial 
             FROM pendencias p 
             LEFT JOIN empresas e ON p.empresa_id = e.id 
             WHERE p.contador_id = $1 
             ORDER BY p.datacriacao DESC LIMIT 10`,
            [req.contadorId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 5. DOCUMENTOS
// ==========================================
app.get('/api/documentos', verificarTokenContador, async (req, res) => {
    try {
        const { tipo, tipo_documento, empresa_id, status } = req.query;
        let query = `SELECT d.*, e.razaosocial FROM documentos d LEFT JOIN empresas e ON d.empresa_id = e.id WHERE d.contador_id = $1`;
        const params = [req.contadorId];
        let idx = 2;
        if (tipo) { query += ` AND d.tipo = $${idx++}`; params.push(tipo); }
        if (tipo_documento) { query += ` AND d.tipo_documento = $${idx++}`; params.push(tipo_documento); }
        if (empresa_id) { query += ` AND d.empresa_id = $${idx++}`; params.push(empresa_id); }
        if (status) { query += ` AND d.status = $${idx++}`; params.push(status); }
        query += ' ORDER BY d.datacriacao DESC';
        const resultado = await pool.query(query, params);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/documentos', verificarTokenContador, upload.single('arquivo'), async (req, res) => {
    try {
        const { empresa_id, tipo, categoria, descricao, tipo_documento, competencia, observacao } = req.body;
        const contador = await pool.query('SELECT nomeescritorio FROM contadores WHERE id = $1', [req.contadorId]);
        const usuarioEnvio = contador.rows[0]?.nomeescritorio || 'Contador';
        const statusInicial = tipo === 'pendente' ? 'pendente' : 'enviado';
        const result = await pool.query(
            `INSERT INTO documentos (empresa_id, contador_id, tipo, categoria, descricao, tipo_documento, competencia, observacao, usuario_envio, arquivonome, arquivodados, arquivotipo, status, enviado_por, datacriacao)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'contador', NOW()) RETURNING id`,
            [empresa_id || null, req.contadorId, tipo || 'recebido', categoria || '', descricao || '',
             tipo_documento || categoria || '', competencia || '', observacao || '', usuarioEnvio,
             req.file ? req.file.originalname : null, req.file ? req.file.buffer : null, req.file ? req.file.mimetype : null,
             statusInicial]
        );
        await registrarHistoricoDocumento(result.rows[0].id, req.contadorId, 'contador', 'Documento criado', `${tipo_documento || categoria || 'Documento'} enviado pelo contador`);
        await registrarAuditoria(req.contadorId, 'contador', `Cadastrou documento: ${descricao || categoria}`, req,
            { entidade: 'documento', entidade_id: result.rows[0].id, empresa_id: parseInt(empresa_id) || null, versao: 1 });
        res.status(201).json({ mensagem: 'Documento salvo!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/documentos/cliente', verificarTokenCliente, upload.single('arquivo'), async (req, res) => {
    try {
        const { categoria, descricao, tipo_documento, competencia } = req.body;
        const empresa = await pool.query('SELECT contador_id, contadorid, razaosocial FROM empresas WHERE id = $1', [req.empresaId]);
        const contadorId = empresa.rows[0]?.contador_id || empresa.rows[0]?.contadorid;
        const usuarioEnvio = empresa.rows[0]?.razaosocial || 'Cliente';
        const result = await pool.query(
            `INSERT INTO documentos (empresa_id, contador_id, tipo, categoria, descricao, tipo_documento, competencia, usuario_envio, arquivonome, arquivodados, arquivotipo, status, enviado_por, datacriacao)
             VALUES ($1, $2, 'recebido', $3, $4, $5, $6, $7, $8, $9, $10, 'enviado', 'cliente', NOW()) RETURNING id`,
            [req.empresaId, contadorId, categoria || '', descricao || '',
             tipo_documento || categoria || '', competencia || '', usuarioEnvio,
             req.file ? req.file.originalname : null, req.file ? req.file.buffer : null, req.file ? req.file.mimetype : null]
        );
        await registrarHistoricoDocumento(result.rows[0].id, req.empresaId, 'cliente', 'Documento enviado', `${tipo_documento || categoria || 'Documento'} enviado pelo cliente`);
        await registrarAuditoria(req.empresaId, 'cliente', `Enviou documento: ${descricao || categoria}`, req,
            { entidade: 'documento', entidade_id: result.rows[0].id, empresa_id: req.empresaId, versao: 1 });
        res.status(201).json({ mensagem: 'Documento enviado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.get('/api/documentos/cliente', verificarTokenCliente, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT id, categoria, descricao, tipo_documento, competencia, observacao, usuario_envio, arquivonome, status, enviado_por, datacriacao FROM documentos WHERE empresa_id = $1 ORDER BY datacriacao DESC',
            [req.empresaId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.get('/api/documentos/download/:id', verificarTokenDownload, async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await pool.query('SELECT empresa_id, contador_id, arquivonome, arquivodados, arquivotipo FROM documentos WHERE id = $1', [id]);
        if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
        const doc = resultado.rows[0];
        // Verifica propriedade ANTES de revelar existência do arquivo
        if (req.tokenTipo === 'contador' && doc.contador_id !== req.contadorId) {
            return res.status(403).json({ erro: 'Acesso negado.' });
        } else if (req.tokenTipo === 'cliente' && doc.empresa_id !== req.empresaId) {
            return res.status(403).json({ erro: 'Acesso negado.' });
        }
        if (!doc.arquivodados) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
        if (req.tokenTipo === 'contador') {
            await registrarAuditoria(req.contadorId, 'contador', 'Download de documento', req,
                { entidade: 'documento', entidade_id: parseInt(id), empresa_id: doc.empresa_id });
        } else {
            await registrarAuditoria(req.empresaId, 'cliente', 'Download de documento', req,
                { entidade: 'documento', entidade_id: parseInt(id), empresa_id: doc.empresa_id });
        }
        res.setHeader('Content-Type', doc.arquivotipo || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${doc.arquivonome}"`);
        res.send(doc.arquivodados);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.put('/api/documentos/:id/status', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const anterior = await pool.query('SELECT status FROM documentos WHERE id = $1 AND contador_id = $2', [id, req.contadorId]);
        if (anterior.rows.length === 0) return res.status(404).json({ erro: 'Documento não encontrado.' });
        await pool.query('UPDATE documentos SET status = $1 WHERE id = $2 AND contador_id = $3', [status, id, req.contadorId]);
        await registrarHistoricoDocumento(id, req.contadorId, 'contador', 'Status alterado', `De "${anterior.rows[0].status}" para "${status}"`);
        await registrarAuditoria(req.contadorId, 'contador', `Alterou status de documento para "${status}"`, req,
            { entidade: 'documento', entidade_id: parseInt(id), detalhe: `De "${anterior.rows[0].status}" para "${status}"` });
        res.json({ mensagem: 'Status atualizado.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Registrar observação em um documento
app.put('/api/documentos/:id/observacao', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const { observacao } = req.body;
        const doc = await pool.query('SELECT id FROM documentos WHERE id = $1 AND contador_id = $2', [id, req.contadorId]);
        if (doc.rows.length === 0) return res.status(404).json({ erro: 'Documento não encontrado.' });
        await pool.query('UPDATE documentos SET observacao = $1 WHERE id = $2 AND contador_id = $3', [observacao || '', id, req.contadorId]);
        await registrarHistoricoDocumento(id, req.contadorId, 'contador', 'Observação registrada', observacao || '(vazia)');
        res.json({ mensagem: 'Observação salva.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Histórico de um documento
app.get('/api/documentos/:id/historico', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await pool.query('SELECT id FROM documentos WHERE id = $1 AND contador_id = $2', [id, req.contadorId]);
        if (doc.rows.length === 0) return res.status(404).json({ erro: 'Documento não encontrado.' });
        const resultado = await pool.query(
            'SELECT * FROM documento_historico WHERE documento_id = $1 ORDER BY data DESC', [id]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.delete('/api/documentos/:id', verificarTokenContador, async (req, res) => {
    try {
        await pool.query('DELETE FROM documentos WHERE id = $1 AND contador_id = $2', [req.params.id, req.contadorId]);
        await registrarAuditoria(req.contadorId, 'contador', `Excluiu documento ID: ${req.params.id}`, req,
            { entidade: 'documento', entidade_id: parseInt(req.params.id) });
        res.json({ mensagem: 'Documento excluído.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.delete('/api/documentos/cliente/:id', verificarTokenCliente, async (req, res) => {
    try {
        // Cliente só pode excluir documentos que ele mesmo enviou
        const resultado = await pool.query(
            'DELETE FROM documentos WHERE id = $1 AND empresa_id = $2 AND enviado_por = $3 RETURNING id',
            [req.params.id, req.empresaId, 'cliente']
        );
        if (resultado.rows.length === 0) return res.status(403).json({ erro: 'Você só pode excluir documentos enviados por você.' });
        await registrarAuditoria(req.empresaId, 'cliente', 'Excluiu documento', req, { entidade: 'documento', entidade_id: parseInt(req.params.id) });
        res.json({ mensagem: 'Documento excluído.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 5b. VERSIONAMENTO DE DOCUMENTOS
// ==========================================
// Criar nova versão de um documento publicado (NÃO substitui silenciosamente)
// O documento original é cancelado e uma nova versão é criada com versao + 1
app.post('/api/documentos/:id/nova-versao', verificarTokenContador, upload.single('arquivo'), async (req, res) => {
    try {
        const { id } = req.params;
        // Busca o documento original e valida propriedade
        const docResult = await pool.query('SELECT * FROM documentos WHERE id = $1 AND contador_id = $2', [id, req.contadorId]);
        if (docResult.rows.length === 0) return res.status(404).json({ erro: 'Documento não encontrado ou acesso negado.' });
        const doc = docResult.rows[0];

        const { categoria, descricao, tipo_documento, competencia, observacao } = req.body;

        // Cancela a versão anterior (preserva o histórico)
        await pool.query('UPDATE documentos SET status = $1 WHERE id = $2', ['cancelada', id]);
        await registrarHistoricoDocumento(id, req.contadorId, 'contador', 'Versão cancelada', `Versão ${doc.versao} cancelada para criação de nova versão`);

        // Cria a nova versão
        const novaVersao = (doc.versao || 1) + 1;
        const result = await pool.query(
            `INSERT INTO documentos (empresa_id, contador_id, tipo, categoria, descricao, tipo_documento, competencia, observacao, usuario_envio, arquivonome, arquivodados, arquivotipo, status, enviado_por, versao, versao_anterior_id, datacriacao)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'enviado', 'contador', $13, $14, NOW()) RETURNING id`,
            [doc.empresa_id, req.contadorId, doc.tipo, categoria || doc.categoria, descricao || doc.descricao,
             tipo_documento || doc.tipo_documento, competencia || doc.competencia, observacao || doc.observacao, doc.usuario_envio,
             req.file ? req.file.originalname : doc.arquivonome, req.file ? req.file.buffer : doc.arquivodados, req.file ? req.file.mimetype : doc.arquivotipo,
             novaVersao, id]
        );
        const novoId = result.rows[0].id;
        await registrarHistoricoDocumento(novoId, req.contadorId, 'contador', 'Nova versão criada', `Versão ${novaVersao} criada (anterior: versão ${doc.versao}, ID ${id})`);
        await registrarAuditoria(req.contadorId, 'contador', `Nova versão de documento criada (v${novaVersao})`, req,
            { entidade: 'documento', entidade_id: novoId, empresa_id: doc.empresa_id, versao: novaVersao, detalhe: `Substituiu documento ID ${id} (v${doc.versao})` });

        res.status(201).json({ mensagem: `Nova versão (v${novaVersao}) criada com sucesso! A versão anterior foi cancelada.`, novoId, versao: novaVersao });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao criar nova versão: ' + erro.message });
    }
});

// Listar versões de um documento (todas as versões, incluindo canceladas)
app.get('/api/documentos/:id/versoes', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await pool.query('SELECT * FROM documentos WHERE id = $1 AND contador_id = $2', [id, req.contadorId]);
        if (doc.rows.length === 0) return res.status(404).json({ erro: 'Documento não encontrado.' });

        // Busca a versão original (percorrendo versao_anterior_id) e todas as versões derivadas
        const resultado = await pool.query(
            `WITH RECURSIVE ancestrais AS (
                SELECT * FROM documentos WHERE id = $1
                UNION ALL
                SELECT d.* FROM documentos d JOIN ancestrais a ON d.id = a.versao_anterior_id
            ), descendentes AS (
                SELECT * FROM ancestrais
                UNION ALL
                SELECT d.* FROM documentos d JOIN descendentes des ON d.versao_anterior_id = des.id
            )
            SELECT DISTINCT id, versao, status, categoria, descricao, tipo_documento, competencia, usuario_envio, enviado_por, datacriacao
            FROM descendentes WHERE contador_id = $2 ORDER BY versao ASC`,
            [id, req.contadorId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 6. PENDÊNCIAS
// ==========================================
app.get('/api/pendencias', verificarTokenContador, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT p.*, e.razaosocial FROM pendencias p LEFT JOIN empresas e ON p.empresa_id = e.id WHERE p.contador_id = $1 ORDER BY 
             CASE p.prioridade WHEN 'urgente' THEN 1 WHEN 'atencao' THEN 2 ELSE 3 END, p.datacriacao DESC`,
            [req.contadorId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/pendencias', verificarTokenContador, async (req, res) => {
    try {
        const { empresa_id, descricao, prioridade, prazo } = req.body;
        if (!(await validarEmpresaContador(res, empresa_id, req.contadorId))) return;
        await pool.query(
            'INSERT INTO pendencias (empresa_id, contador_id, descricao, prioridade, status, prazo, datacriacao) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
            [empresa_id || null, req.contadorId, descricao, prioridade || 'media', 'pendente', prazo || null]
        );
        res.status(201).json({ mensagem: 'Pendência criada!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.put('/api/pendencias/:id', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, prioridade } = req.body;
        const result = await pool.query('UPDATE pendencias SET status = COALESCE($1, status), prioridade = COALESCE($2, prioridade) WHERE id = $3 AND contador_id = $4 RETURNING empresa_id',
            [status, prioridade, id, req.contadorId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Pendência não encontrada ou acesso negado.' });
        await registrarAuditoria(req.contadorId, 'contador', `Atualizou pendência ID: ${id}`, req,
            { entidade: 'pendencia', entidade_id: parseInt(id), empresa_id: result.rows[0].empresa_id || null });
        res.json({ mensagem: 'Pendência atualizada!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.delete('/api/pendencias/:id', verificarTokenContador, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM pendencias WHERE id = $1 AND contador_id = $2 RETURNING empresa_id', [req.params.id, req.contadorId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Pendência não encontrada ou acesso negado.' });
        await registrarAuditoria(req.contadorId, 'contador', `Removeu pendência ID: ${req.params.id}`, req,
            { entidade: 'pendencia', entidade_id: parseInt(req.params.id), empresa_id: result.rows[0].empresa_id || null });
        res.json({ mensagem: 'Pendência removida.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Pendências do cliente
app.get('/api/pendencias/cliente', verificarTokenCliente, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT p.*, e.razaosocial FROM pendencias p LEFT JOIN empresas e ON p.empresa_id = e.id WHERE p.empresa_id = $1 ORDER BY p.datacriacao DESC`,
            [req.empresaId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 6b. CENTRAL DE PENDÊNCIAS E NOTIFICAÇÕES (CONTADOR)
// ==========================================
app.get('/api/central-pendencias', verificarTokenContador, async (req, res) => {
    try {
        const cid = req.contadorId;
        const [docsSolicitados, docsAguardando, guiasPublicar, guiasVencer, msgsNaoLidas, tarefasPendentes, pendencias, checklistPendente] = await Promise.all([
            // Documentos solicitados ao cliente (tipo=pendente, criados pelo contador)
            pool.query(`SELECT d.id, d.empresa_id, d.categoria, d.descricao, d.tipo_documento, d.competencia, d.status, d.datacriacao, e.razaosocial
                        FROM documentos d LEFT JOIN empresas e ON d.empresa_id = e.id
                        WHERE d.contador_id = $1 AND d.tipo = 'pendente' AND d.status = 'pendente'
                        ORDER BY d.datacriacao DESC`, [cid]),
            // Documentos recebidos aguardando análise (enviados pelo cliente)
            pool.query(`SELECT d.id, d.empresa_id, d.categoria, d.descricao, d.tipo_documento, d.competencia, d.status, d.datacriacao, e.razaosocial
                        FROM documentos d LEFT JOIN empresas e ON d.empresa_id = e.id
                        WHERE d.contador_id = $1 AND d.enviado_por = 'cliente' AND d.status IN ('enviado', 'Em análise')
                        ORDER BY d.datacriacao DESC`, [cid]),
            // Guias aguardando publicação (rascunho)
            pool.query(`SELECT g.id, g.empresa_id, g.tipoimposto, g.competencia, g.valor, g.vencimento, g.status, e.razaosocial
                        FROM guias g JOIN empresas e ON g.cnpj = e.cnpj
                        WHERE (e.contador_id = $1 OR e.contadorid = $1) AND g.status = 'rascunho'
                        ORDER BY g.datacriacao DESC`, [cid]),
            // Guias próximas do vencimento (7 dias)
            pool.query(`SELECT g.id, g.empresa_id, g.tipoimposto, g.competencia, g.valor, g.vencimento, g.status, e.razaosocial
                        FROM guias g JOIN empresas e ON g.cnpj = e.cnpj
                        WHERE (e.contador_id = $1 OR e.contadorid = $1)
                          AND g.vencimento >= CURRENT_DATE AND g.vencimento <= CURRENT_DATE + INTERVAL '7 days'
                          AND g.status NOT IN ('paga', 'pago', 'cancelada')
                        ORDER BY g.vencimento ASC`, [cid]),
            // Mensagens não lidas (dos clientes)
            pool.query(`SELECT cm.id, cm.empresa_id, cm.mensagem, cm.datacriacao, e.razaosocial
                        FROM chat_mensagens cm LEFT JOIN empresas e ON cm.empresa_id = e.id
                        WHERE cm.contador_id = $1 AND cm.remetente = 'cliente' AND cm.lido = false
                        ORDER BY cm.datacriacao DESC`, [cid]),
            // Tarefas pendentes (CRM)
            pool.query(`SELECT t.id, t.empresa_id, t.descricao, t.prazo, t.prioridade, e.razaosocial
                        FROM crm_tarefas t LEFT JOIN empresas e ON t.empresa_id = e.id
                        WHERE t.contador_id = $1 AND t.status = 'pendente'
                        ORDER BY t.prioridade DESC, t.datacriacao DESC`, [cid]),
            // Pendências gerais
            pool.query(`SELECT p.id, p.empresa_id, p.descricao, p.prioridade, p.prazo, e.razaosocial
                        FROM pendencias p LEFT JOIN empresas e ON p.empresa_id = e.id
                        WHERE p.contador_id = $1 AND p.status = 'pendente'
                        ORDER BY CASE p.prioridade WHEN 'urgente' THEN 1 WHEN 'atencao' THEN 2 ELSE 3 END, p.datacriacao DESC`, [cid]),
            // Checklist pendente (todas as empresas)
            pool.query(`SELECT c.id, c.empresa_id, c.item, c.competencia, e.razaosocial
                        FROM checklist_mensal c JOIN empresas e ON c.empresa_id = e.id
                        WHERE (e.contador_id = $1 OR e.contadorid = $1) AND c.status = 'pendente'
                        ORDER BY c.datacriacao DESC`, [cid])
        ]);

        res.json({
            documentosSolicitados: docsSolicitados.rows,
            documentosAguardando: docsAguardando.rows,
            guiasAguardandoPublicacao: guiasPublicar.rows,
            guiasProximasVencimento: guiasVencer.rows,
            mensagensNaoLidas: msgsNaoLidas.rows,
            tarefasPendentes: tarefasPendentes.rows,
            pendencias: pendencias.rows,
            checklistPendente: checklistPendente.rows,
            totais: {
                documentosSolicitados: docsSolicitados.rows.length,
                documentosAguardando: docsAguardando.rows.length,
                guiasAguardandoPublicacao: guiasPublicar.rows.length,
                guiasProximasVencimento: guiasVencer.rows.length,
                mensagensNaoLidas: msgsNaoLidas.rows.length,
                tarefasPendentes: tarefasPendentes.rows.length,
                pendencias: pendencias.rows.length,
                checklistPendente: checklistPendente.rows.length
            }
        });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar central de pendências: ' + erro.message });
    }
});

// ==========================================
// 6c. CENTRAL DE PENDÊNCIAS E NOTIFICAÇÕES (CLIENTE)
// ==========================================
app.get('/api/cliente/central-pendencias', verificarTokenCliente, async (req, res) => {
    try {
        const eid = req.empresaId;
        const cnpj = req.empresaCnpj;
        const [docsSolicitados, guiasDisponiveis, guiasVencer, msgsNaoLidas, pendencias, checklistPendente] = await Promise.all([
            // Documentos solicitados/faltantes (contador pediu, cliente ainda não enviou)
            pool.query(`SELECT id, categoria, descricao, tipo_documento, competencia, observacao, status, datacriacao
                        FROM documentos WHERE empresa_id = $1 AND tipo = 'pendente' AND status = 'pendente'
                        ORDER BY datacriacao DESC`, [eid]),
            // Guias disponíveis (publicadas/visualizadas)
            pool.query(`SELECT id, tipoimposto, competencia, valor, vencimento, status, descricao, observacao
                        FROM guias WHERE cnpj = $1 AND status IN ('publicada', 'visualizada')
                        ORDER BY vencimento DESC`, [cnpj]),
            // Guias próximas do vencimento (7 dias)
            pool.query(`SELECT id, tipoimposto, competencia, valor, vencimento, status
                        FROM guias WHERE cnpj = $1 AND vencimento >= CURRENT_DATE
                          AND vencimento <= CURRENT_DATE + INTERVAL '7 days'
                          AND status NOT IN ('paga', 'pago', 'cancelada')
                        ORDER BY vencimento ASC`, [cnpj]),
            // Mensagens não lidas (do contador)
            pool.query(`SELECT id, mensagem, remetente, datacriacao
                        FROM chat_mensagens WHERE empresa_id = $1 AND remetente = 'contador' AND lido = false
                        ORDER BY datacriacao DESC`, [eid]),
            // Solicitações do contador (pendências)
            pool.query(`SELECT id, descricao, prioridade, prazo
                        FROM pendencias WHERE empresa_id = $1 AND status = 'pendente'
                        ORDER BY CASE prioridade WHEN 'urgente' THEN 1 WHEN 'atencao' THEN 2 ELSE 3 END, datacriacao DESC`, [eid]),
            // Checklist pendente
            pool.query(`SELECT id, item, competencia, status
                        FROM checklist_mensal WHERE empresa_id = $1 AND status = 'pendente'
                        ORDER BY datacriacao DESC`, [eid])
        ]);

        res.json({
            documentosSolicitados: docsSolicitados.rows,
            guiasDisponiveis: guiasDisponiveis.rows,
            guiasProximasVencimento: guiasVencer.rows,
            mensagensNaoLidas: msgsNaoLidas.rows,
            solicitacoesContador: pendencias.rows,
            tarefasPendentes: checklistPendente.rows,
            totais: {
                documentosSolicitados: docsSolicitados.rows.length,
                guiasDisponiveis: guiasDisponiveis.rows.length,
                guiasProximasVencimento: guiasVencer.rows.length,
                mensagensNaoLidas: msgsNaoLidas.rows.length,
                solicitacoesContador: pendencias.rows.length,
                tarefasPendentes: checklistPendente.rows.length
            }
        });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar central de pendências: ' + erro.message });
    }
});

// ==========================================
// 7. CHECKLIST MENSAL
// ==========================================
app.get('/api/checklist/:empresaId', verificarTokenContador, async (req, res) => {
    try {
        if (!await empresaPertenceContador(req.params.empresaId, req.contadorId)) {
            return res.status(403).json({ erro: 'Você não tem acesso a esta empresa.' });
        }
        const resultado = await pool.query('SELECT * FROM checklist_mensal WHERE empresa_id = $1 ORDER BY datacriacao DESC', [req.params.empresaId]);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/checklist', verificarTokenContador, async (req, res) => {
    try {
        const { empresa_id, item, status, competencia } = req.body;
        if (!(await validarEmpresaContador(res, empresa_id, req.contadorId))) return;
        await pool.query(
            'INSERT INTO checklist_mensal (empresa_id, item, status, competencia, datacriacao) VALUES ($1, $2, $3, $4, NOW())',
            [empresa_id, item, status || 'pendente', competencia || '']
        );
        res.status(201).json({ mensagem: 'Item adicionado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.put('/api/checklist/:id', verificarTokenContador, async (req, res) => {
    try {
        const { status } = req.body;
        const item = await pool.query('SELECT empresa_id FROM checklist_mensal WHERE id = $1', [req.params.id]);
        if (item.rows.length === 0) return res.status(404).json({ erro: 'Item não encontrado.' });
        if (!await empresaPertenceContador(item.rows[0].empresa_id, req.contadorId)) {
            return res.status(403).json({ erro: 'Você não tem acesso a este item.' });
        }
        await pool.query('UPDATE checklist_mensal SET status = $1 WHERE id = $2', [status, req.params.id]);
        res.json({ mensagem: 'Status atualizado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.get('/api/checklist/cliente/:empresaId', verificarTokenCliente, async (req, res) => {
    try {
        // Cliente só pode ver seu próprio checklist (usa ID do token, ignora parâmetro da URL)
        if (parseInt(req.params.empresaId) !== req.empresaId) {
            return res.status(403).json({ erro: 'Acesso negado.' });
        }
        const resultado = await pool.query('SELECT * FROM checklist_mensal WHERE empresa_id = $1 ORDER BY datacriacao DESC', [req.empresaId]);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 8. AVISOS / NOTIFICAÇÕES
// ==========================================
app.get('/api/avisos', verificarTokenContador, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT a.*, e.razaosocial FROM avisos a LEFT JOIN empresas e ON a.empresa_id = e.id WHERE a.contador_id = $1 ORDER BY a.datacriacao DESC`,
            [req.contadorId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/avisos', verificarTokenContador, async (req, res) => {
    try {
        const { titulo, mensagem, tipo, empresa_id } = req.body;
        if (!(await validarEmpresaContador(res, empresa_id, req.contadorId))) return;
        await pool.query(
            'INSERT INTO avisos (contador_id, empresa_id, titulo, mensagem, tipo, lido, datacriacao) VALUES ($1, $2, $3, $4, $5, FALSE, NOW())',
            [req.contadorId, empresa_id || null, titulo, mensagem, tipo || 'info']
        );
        res.status(201).json({ mensagem: 'Aviso criado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.put('/api/avisos/:id/lido', verificarTokenContador, async (req, res) => {
    try {
        await pool.query('UPDATE avisos SET lido = TRUE WHERE id = $1 AND contador_id = $2', [req.params.id, req.contadorId]);
        res.json({ mensagem: 'Aviso marcado como lido.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 9. CHAT
// ==========================================
// Rotas /api/chat/cliente DEVEM vir antes de /api/chat/:empresaId
// para o Express não capturar "cliente" como parâmetro
app.get('/api/chat/cliente', verificarTokenCliente, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT * FROM chat_mensagens WHERE empresa_id = $1 ORDER BY datacriacao ASC', [req.empresaId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/chat/cliente', verificarTokenCliente, async (req, res) => {
    try {
        const { mensagem } = req.body;
        const empresa = await pool.query('SELECT contador_id, contadorid FROM empresas WHERE id = $1', [req.empresaId]);
        const contadorId = empresa.rows[0]?.contador_id || empresa.rows[0]?.contadorid;
        await pool.query(
            'INSERT INTO chat_mensagens (contador_id, empresa_id, remetente, mensagem, lido, datacriacao) VALUES ($1, $2, $3, $4, FALSE, NOW())',
            [contadorId, req.empresaId, 'cliente', mensagem]
        );
        res.status(201).json({ mensagem: 'Mensagem enviada!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.get('/api/chat/:empresaId', verificarTokenContador, async (req, res) => {
    try {
        if (!await empresaPertenceContador(req.params.empresaId, req.contadorId)) {
            return res.status(403).json({ erro: 'Você não tem acesso a esta empresa.' });
        }
        const resultado = await pool.query(
            'SELECT * FROM chat_mensagens WHERE empresa_id = $1 ORDER BY datacriacao ASC', [req.params.empresaId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/chat', verificarTokenContador, async (req, res) => {
    try {
        const { empresa_id, mensagem } = req.body;
        if (!empresa_id) return res.status(400).json({ erro: 'empresa_id é obrigatório.' });
        if (!await empresaPertenceContador(empresa_id, req.contadorId)) {
            return res.status(403).json({ erro: 'Você não tem acesso a esta empresa.' });
        }
        await pool.query(
            'INSERT INTO chat_mensagens (contador_id, empresa_id, remetente, mensagem, lido, datacriacao) VALUES ($1, $2, $3, $4, FALSE, NOW())',
            [req.contadorId, empresa_id, 'contador', mensagem]
        );
        res.status(201).json({ mensagem: 'Mensagem enviada!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 10. FINANCEIRO / HONORÁRIOS
// ==========================================
app.get('/api/financeiro', verificarTokenContador, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT f.*, e.razaosocial FROM financeiro f LEFT JOIN empresas e ON f.empresa_id = e.id WHERE f.contador_id = $1 ORDER BY f.datacriacao DESC`,
            [req.contadorId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/financeiro', verificarTokenContador, async (req, res) => {
    try {
        const { empresa_id, descricao, valor, vencimento, competencia, status } = req.body;
        if (!(await validarEmpresaContador(res, empresa_id, req.contadorId))) return;
        await pool.query(
            'INSERT INTO financeiro (contador_id, empresa_id, descricao, valor, status, vencimento, competencia, datacriacao) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
            [req.contadorId, empresa_id || null, descricao, valor || 0, status || 'pendente', vencimento || null, competencia || '']
        );
        res.status(201).json({ mensagem: 'Lançamento criado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.put('/api/financeiro/:id/status', verificarTokenContador, async (req, res) => {
    try {
        await pool.query('UPDATE financeiro SET status = $1 WHERE id = $2 AND contador_id = $3', [req.body.status, req.params.id, req.contadorId]);
        res.json({ mensagem: 'Status atualizado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 11. CALENDÁRIO DE OBRIGAÇÕES
// ==========================================
app.get('/api/calendario', verificarTokenContador, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT c.*, e.razaosocial FROM calendario_obrigacoes c LEFT JOIN empresas e ON c.empresa_id = e.id WHERE c.contador_id = $1 ORDER BY c.dataevento ASC`,
            [req.contadorId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/calendario', verificarTokenContador, async (req, res) => {
    try {
        const { empresa_id, titulo, descricao, tipo, dataevento, status } = req.body;
        if (!(await validarEmpresaContador(res, empresa_id, req.contadorId))) return;
        await pool.query(
            'INSERT INTO calendario_obrigacoes (contador_id, empresa_id, titulo, descricao, tipo, dataevento, status, datacriacao) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
            [req.contadorId, empresa_id || null, titulo, descricao || '', tipo || 'obrigacao', dataevento, status || 'pendente']
        );
        res.status(201).json({ mensagem: 'Evento criado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.put('/api/calendario/:id/status', verificarTokenContador, async (req, res) => {
    try {
        await pool.query('UPDATE calendario_obrigacoes SET status = $1 WHERE id = $2 AND contador_id = $3', [req.body.status, req.params.id, req.contadorId]);
        res.json({ mensagem: 'Status atualizado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 12. PROCURAÇÕES E CERTIFICADOS
// ==========================================
app.get('/api/procuracoes', verificarTokenContador, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT p.*, e.razaosocial FROM procuracoes p LEFT JOIN empresas e ON p.empresa_id = e.id WHERE p.contador_id = $1 ORDER BY p.datacriacao DESC`,
            [req.contadorId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/procuracoes', verificarTokenContador, async (req, res) => {
    try {
        const { empresa_id, tipo, validade, observacao, status } = req.body;
        if (!(await validarEmpresaContador(res, empresa_id, req.contadorId))) return;
        await pool.query(
            'INSERT INTO procuracoes (contador_id, empresa_id, tipo, status, validade, observacao, datacriacao) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
            [req.contadorId, empresa_id || null, tipo || '', status || 'ativo', validade || null, observacao || '']
        );
        res.status(201).json({ mensagem: 'Procuração registrada!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 13. NOTAS FISCAIS
// ==========================================
app.get('/api/notas-fiscais', verificarTokenContador, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT n.*, e.razaosocial FROM notas_fiscais n LEFT JOIN empresas e ON n.empresa_id = e.id WHERE n.contador_id = $1 ORDER BY n.datacriacao DESC`,
            [req.contadorId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/notas-fiscais', verificarTokenContador, upload.single('arquivo'), async (req, res) => {
    try {
        const { empresa_id, numero, competencia, valor, status } = req.body;
        if (!(await validarEmpresaContador(res, empresa_id, req.contadorId))) return;
        await pool.query(
            `INSERT INTO notas_fiscais (empresa_id, contador_id, numero, competencia, valor, status, arquivonome, arquivodados, arquivotipo, datacriacao)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [empresa_id || null, req.contadorId, numero || '', competencia || '', valor || 0, status || 'recebida',
             req.file ? req.file.originalname : null, req.file ? req.file.buffer : null, req.file ? req.file.mimetype : null]
        );
        res.status(201).json({ mensagem: 'Nota fiscal registrada!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.get('/api/notas-fiscais/download/:id', verificarTokenDownload, async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await pool.query('SELECT empresa_id, contador_id, arquivonome, arquivodados, arquivotipo FROM notas_fiscais WHERE id = $1', [id]);
        if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
        const nf = resultado.rows[0];
        // Verifica propriedade ANTES de revelar existência do arquivo
        if (req.tokenTipo === 'contador' && nf.contador_id !== req.contadorId) {
            return res.status(403).json({ erro: 'Acesso negado.' });
        } else if (req.tokenTipo === 'cliente' && nf.empresa_id !== req.empresaId) {
            return res.status(403).json({ erro: 'Acesso negado.' });
        }
        if (!nf.arquivodados) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
        await registrarAuditoria(
            req.tokenTipo === 'contador' ? req.contadorId : req.empresaId,
            req.tokenTipo, 'Download de nota fiscal', req,
            { entidade: 'nota_fiscal', entidade_id: parseInt(id), empresa_id: nf.empresa_id }
        );
        res.setHeader('Content-Type', nf.arquivotipo || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${nf.arquivonome || 'nota.pdf'}"`);
        res.send(nf.arquivodados);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 14. FOLHA DE PAGAMENTO
// ==========================================
app.get('/api/folha-pagamento', verificarTokenContador, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT f.*, e.razaosocial FROM folha_pagamento f LEFT JOIN empresas e ON f.empresa_id = e.id WHERE f.contador_id = $1 ORDER BY f.datacriacao DESC`,
            [req.contadorId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/folha-pagamento', verificarTokenContador, async (req, res) => {
    try {
        const { empresa_id, competencia, funcionarios, valor_total, status } = req.body;
        if (!(await validarEmpresaContador(res, empresa_id, req.contadorId))) return;
        await pool.query(
            'INSERT INTO folha_pagamento (empresa_id, contador_id, competencia, funcionarios, valor_total, status, datacriacao) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
            [empresa_id || null, req.contadorId, competencia || '', funcionarios || 0, valor_total || 0, status || 'pendente']
        );
        res.status(201).json({ mensagem: 'Folha registrada!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.put('/api/folha-pagamento/:id/status', verificarTokenContador, async (req, res) => {
    try {
        await pool.query('UPDATE folha_pagamento SET status = $1 WHERE id = $2 AND contador_id = $3', [req.body.status, req.params.id, req.contadorId]);
        res.json({ mensagem: 'Status atualizado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 14b. NOTAS FISCAIS - Excluir
// ==========================================
app.delete('/api/notas-fiscais/:id', verificarTokenContador, async (req, res) => {
    try {
        await pool.query('DELETE FROM notas_fiscais WHERE id = $1 AND contador_id = $2', [req.params.id, req.contadorId]);
        await registrarAuditoria(req.contadorId, 'contador', `Excluiu nota fiscal ID: ${req.params.id}`, req);
        res.json({ mensagem: 'Nota fiscal excluída.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 14c. CRM - Gestão de Contatos (simplificado)
// ==========================================
app.get('/api/crm/contatos', verificarTokenContador, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT * FROM crm_contatos WHERE contador_id = $1 ORDER BY datacriacao DESC', [req.contadorId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/crm/contatos', verificarTokenContador, async (req, res) => {
    try {
        const { nome, email, telefone, empresa, origem, status, observacao } = req.body;
        if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório.' });
        const r = await pool.query(
            `INSERT INTO crm_contatos (contador_id, nome, email, telefone, empresa, origem, status, observacao, tipo, datacriacao)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'lead',NOW()) RETURNING id`,
            [req.contadorId, nome, email||'', telefone||'', empresa||'', origem||null, status||'novo', observacao||'']
        );
        res.status(201).json({ mensagem: 'Contato criado!', id: r.rows[0].id });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.put('/api/crm/contatos/:id', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, email, telefone, empresa, origem, status, observacao } = req.body;
        await pool.query(
            `UPDATE crm_contatos SET
                nome=COALESCE($1,nome), email=COALESCE($2,email), telefone=COALESCE($3,telefone),
                empresa=COALESCE($4,empresa), origem=COALESCE($5,origem), status=COALESCE($6,status),
                observacao=COALESCE($7,observacao)
             WHERE id=$8 AND contador_id=$9`,
            [nome, email, telefone, empresa, origem, status, observacao, id, req.contadorId]
        );
        res.json({ mensagem: 'Contato atualizado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.put('/api/crm/contatos/:id/etapa', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const atual = await pool.query('SELECT status FROM crm_contatos WHERE id=$1 AND contador_id=$2', [id, req.contadorId]);
        if (atual.rows.length === 0) return res.status(404).json({ erro: 'Contato não encontrado.' });
        if (atual.rows[0].status === status) return res.json({ mensagem: 'Sem alteração.' });
        await pool.query('UPDATE crm_contatos SET status=$1 WHERE id=$2 AND contador_id=$3', [status, id, req.contadorId]);
        res.json({ mensagem: 'Etapa atualizada!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.delete('/api/crm/contatos/:id', verificarTokenContador, async (req, res) => {
    try {
        await pool.query('DELETE FROM crm_contatos WHERE id = $1 AND contador_id = $2', [req.params.id, req.contadorId]);
        res.json({ mensagem: 'Contato excluído.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 16. DASHBOARD DO CLIENTE
// ==========================================
app.get('/api/cliente/dashboard', verificarTokenCliente, async (req, res) => {
    try {
        const eid = req.empresaId;
        const [pendencias, checklist, guias, avisos, documentos] = await Promise.all([
            pool.query('SELECT * FROM pendencias WHERE empresa_id = $1 AND status = $2', [eid, 'pendente']),
            pool.query('SELECT * FROM checklist_mensal WHERE empresa_id = $1 ORDER BY datacriacao DESC', [eid]),
            pool.query('SELECT id, cnpj, tipoimposto, competencia, valor, vencimento, pix, arquivonome, status, datacriacao FROM guias WHERE cnpj = $1 ORDER BY datacriacao DESC', [req.empresaCnpj]),
            pool.query('SELECT * FROM avisos WHERE empresa_id = $1 ORDER BY datacriacao DESC LIMIT 5', [eid]),
            pool.query('SELECT id, categoria, descricao, tipo_documento, competencia, observacao, usuario_envio, arquivonome, status, enviado_por, datacriacao FROM documentos WHERE empresa_id = $1 ORDER BY datacriacao DESC', [eid])
        ]);
        res.json({
            pendencias: pendencias.rows,
            checklist: checklist.rows,
            guias: guias.rows,
            avisos: avisos.rows,
            documentos: documentos.rows
        });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 17. CLIENTE - GUIAS (com token)
// ==========================================
app.get('/api/cliente/guias', verificarTokenCliente, async (req, res) => {
    try {
        const guias = await pool.query(
            `SELECT id, cnpj, tipoimposto, competencia, valor, vencimento, pix, descricao, observacao, arquivonome, status, versao, datacriacao 
             FROM guias WHERE cnpj = $1 AND status NOT IN ('rascunho', 'cancelada') ORDER BY datacriacao DESC`,
            [req.empresaCnpj]
        );
        // Registra visualização para guias com status 'publicada' (passa para 'visualizada')
        for (const g of guias.rows) {
            if (g.status === 'publicada') {
                await pool.query('UPDATE guias SET status = $1 WHERE id = $2', ['visualizada', g.id]);
                await registrarHistoricoGuia(g.id, req.empresaId, 'cliente', 'Visualização', 'Cliente visualizou a guia');
            }
        }
        res.json(guias.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Cliente - histórico de uma guia (apenas ações permitidas: visualização, download)
app.get('/api/cliente/guias/:id/historico', verificarTokenCliente, async (req, res) => {
    try {
        const { id } = req.params;
        const guia = await pool.query('SELECT cnpj FROM guias WHERE id = $1', [id]);
        if (guia.rows.length === 0) return res.status(404).json({ erro: 'Guia não encontrada.' });
        if (guia.rows[0].cnpj !== req.empresaCnpj) return res.status(403).json({ erro: 'Acesso negado.' });
        // Cliente só vê histórico de visualização e download (não vê criação, publicação, cancelamento, alteração)
        const resultado = await pool.query(
            `SELECT * FROM guia_historico WHERE guia_id = $1 AND acao IN ('Visualização', 'Download') ORDER BY data DESC`, [id]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 18. ORDENS DE SERVIÇO (ETAPA 9)
// ==========================================

// Helper: registra histórico de documento fiscal
async function registrarHistoricoFiscal(docFiscalId, usuarioId, usuarioTipo, acao, detalhe) {
    try {
        await pool.query(
            'INSERT INTO documento_fiscal_historico (documento_fiscal_id, acao, detalhe, usuario_id, usuario_tipo, data) VALUES ($1, $2, $3, $4, $5, NOW())',
            [docFiscalId, acao, detalhe || null, usuarioId, usuarioTipo]
        );
    } catch (e) {
        console.error('Erro ao registrar histórico fiscal:', e.message);
    }
}

// Helper: verifica se uma OS pertence ao contador
async function osPertenceContador(osId, contadorId) {
    const r = await pool.query('SELECT * FROM ordens_servico WHERE id = $1 AND contador_id = $2', [osId, contadorId]);
    return r.rows.length > 0 ? r.rows[0] : null;
}

// Helper: verifica se um documento fiscal pertence ao contador
async function docFiscalPertenceContador(docId, contadorId) {
    const r = await pool.query('SELECT * FROM documentos_fiscais WHERE id = $1 AND contador_id = $2', [docId, contadorId]);
    return r.rows.length > 0 ? r.rows[0] : null;
}

// Listar Ordens de Serviço
app.get('/api/ordens-servico', verificarTokenContador, async (req, res) => {
    try {
        const { status, empresa_id } = req.query;
        let query = `SELECT os.*, e.razaosocial as empresa_nome, e.cnpj as empresa_cnpj
                     FROM ordens_servico os
                     JOIN empresas e ON os.empresa_id = e.id
                     WHERE os.contador_id = $1`;
        const params = [req.contadorId];
        let idx = 2;
        if (status) { query += ` AND os.status = $${idx++}`; params.push(status); }
        if (empresa_id) { query += ` AND os.empresa_id = $${idx++}`; params.push(empresa_id); }
        query += ' ORDER BY os.datacriacao DESC';
        const resultado = await pool.query(query, params);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar ordens de serviço: ' + erro.message });
    }
});

// Obter uma OS específica
app.get('/api/ordens-servico/:id', verificarTokenContador, async (req, res) => {
    try {
        const os = await osPertenceContador(req.params.id, req.contadorId);
        if (!os) return res.status(404).json({ erro: 'Ordem de serviço não encontrada ou acesso negado.' });
        const empresa = await pool.query('SELECT razaosocial, cnpj, emailempresa FROM empresas WHERE id = $1', [os.empresa_id]);
        res.json({ ...os, empresa_nome: empresa.rows[0]?.razaosocial, empresa_cnpj: empresa.rows[0]?.cnpj });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Criar Ordem de Serviço
app.post('/api/ordens-servico', verificarTokenContador, async (req, res) => {
    try {
        const { empresa_id, cliente_nome, cliente_cpf_cnpj, cliente_endereco, cliente_municipio,
                cliente_uf, servico_descricao, quantidade, valor_unitario, valor_total,
                desconto, observacoes } = req.body;
        if (!empresa_id) return res.status(400).json({ erro: 'Empresa é obrigatória.' });
        if (!(await validarEmpresaContador(res, empresa_id, req.contadorId))) return;

        const qtd = parseFloat(quantidade) || 1;
        const vu = parseFloat(valor_unitario) || 0;
        const desc = parseFloat(desconto) || 0;
        const vt = parseFloat(valor_total) || (qtd * vu - desc);

        const result = await pool.query(
            `INSERT INTO ordens_servico (empresa_id, contador_id, cliente_nome, cliente_cpf_cnpj,
                cliente_endereco, cliente_municipio, cliente_uf, servico_descricao,
                quantidade, valor_unitario, valor_total, desconto, observacoes, status, datacriacao, data_atualizacao)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'rascunho', NOW(), NOW()) RETURNING id`,
            [empresa_id, req.contadorId, cliente_nome || '', cliente_cpf_cnpj || '',
             cliente_endereco || '', cliente_municipio || '', cliente_uf || '',
             servico_descricao || '', qtd, vu, vt, desc, observacoes || '']
        );
        await registrarAuditoria(req.contadorId, 'contador', `Criou ordem de serviço ID: ${result.rows[0].id}`, req,
            { entidade: 'ordem_servico', entidade_id: result.rows[0].id, empresa_id: parseInt(empresa_id) });
        res.status(201).json({ mensagem: 'Ordem de serviço criada!', id: result.rows[0].id });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao criar ordem de serviço: ' + erro.message });
    }
});

// Atualizar Ordem de Serviço
app.put('/api/ordens-servico/:id', verificarTokenContador, async (req, res) => {
    try {
        const os = await osPertenceContador(req.params.id, req.contadorId);
        if (!os) return res.status(404).json({ erro: 'Ordem de serviço não encontrada ou acesso negado.' });
        const { cliente_nome, cliente_cpf_cnpj, cliente_endereco, cliente_municipio,
                cliente_uf, servico_descricao, quantidade, valor_unitario, valor_total,
                desconto, observacoes, status } = req.body;
        const updates = [];
        const params = [];
        let idx = 1;
        if (cliente_nome !== undefined) { updates.push(`cliente_nome = $${idx++}`); params.push(cliente_nome); }
        if (cliente_cpf_cnpj !== undefined) { updates.push(`cliente_cpf_cnpj = $${idx++}`); params.push(cliente_cpf_cnpj); }
        if (cliente_endereco !== undefined) { updates.push(`cliente_endereco = $${idx++}`); params.push(cliente_endereco); }
        if (cliente_municipio !== undefined) { updates.push(`cliente_municipio = $${idx++}`); params.push(cliente_municipio); }
        if (cliente_uf !== undefined) { updates.push(`cliente_uf = $${idx++}`); params.push(cliente_uf); }
        if (servico_descricao !== undefined) { updates.push(`servico_descricao = $${idx++}`); params.push(servico_descricao); }
        if (quantidade !== undefined) { updates.push(`quantidade = $${idx++}`); params.push(quantidade); }
        if (valor_unitario !== undefined) { updates.push(`valor_unitario = $${idx++}`); params.push(valor_unitario); }
        if (valor_total !== undefined) { updates.push(`valor_total = $${idx++}`); params.push(valor_total); }
        if (desconto !== undefined) { updates.push(`desconto = $${idx++}`); params.push(desconto); }
        if (observacoes !== undefined) { updates.push(`observacoes = $${idx++}`); params.push(observacoes); }
        if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }
        if (updates.length > 0) {
            updates.push(`data_atualizacao = NOW()`);
            params.push(req.params.id);
            await pool.query(`UPDATE ordens_servico SET ${updates.join(', ')} WHERE id = $${idx}`, params);
        }
        res.json({ mensagem: 'Ordem de serviço atualizada!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao atualizar: ' + erro.message });
    }
});

// Alterar status da OS
app.put('/api/ordens-servico/:id/status', verificarTokenContador, async (req, res) => {
    try {
        const os = await osPertenceContador(req.params.id, req.contadorId);
        if (!os) return res.status(404).json({ erro: 'Ordem de serviço não encontrada ou acesso negado.' });
        const { status } = req.body;
        const statusValidos = ['rascunho', 'aberta', 'em_andamento', 'concluida', 'cancelada'];
        if (!statusValidos.includes(status)) return res.status(400).json({ erro: 'Status inválido.' });
        await pool.query('UPDATE ordens_servico SET status = $1, data_atualizacao = NOW() WHERE id = $2', [status, req.params.id]);
        res.json({ mensagem: 'Status atualizado.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Excluir OS
app.delete('/api/ordens-servico/:id', verificarTokenContador, async (req, res) => {
    try {
        const os = await osPertenceContador(req.params.id, req.contadorId);
        if (!os) return res.status(404).json({ erro: 'Ordem de serviço não encontrada ou acesso negado.' });
        await pool.query('DELETE FROM ordens_servico WHERE id = $1', [req.params.id]);
        await registrarAuditoria(req.contadorId, 'contador', `Excluiu ordem de serviço ID: ${req.params.id}`, req,
            { entidade: 'ordem_servico', entidade_id: parseInt(req.params.id) });
        res.json({ mensagem: 'Ordem de serviço excluída.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// ==========================================
// 19. DOCUMENTOS FISCAIS (NF-e / NFS-e) — ETAPA 9
// ==========================================

// Listar documentos fiscais
app.get('/api/documentos-fiscais', verificarTokenContador, async (req, res) => {
    try {
        const { status, tipo, empresa_id } = req.query;
        let query = `SELECT df.*, e.razaosocial as empresa_nome, e.cnpj as empresa_cnpj,
                        os.numero as os_numero
                     FROM documentos_fiscais df
                     JOIN empresas e ON df.empresa_id = e.id
                     LEFT JOIN ordens_servico os ON df.ordem_servico_id = os.id
                     WHERE df.contador_id = $1`;
        const params = [req.contadorId];
        let idx = 2;
        if (status) { query += ` AND df.status = $${idx++}`; params.push(status); }
        if (tipo) { query += ` AND df.tipo = $${idx++}`; params.push(tipo); }
        if (empresa_id) { query += ` AND df.empresa_id = $${idx++}`; params.push(empresa_id); }
        query += ' ORDER BY df.datacriacao DESC';
        const resultado = await pool.query(query, params);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar documentos fiscais: ' + erro.message });
    }
});

// Obter um documento fiscal específico
app.get('/api/documentos-fiscais/:id', verificarTokenContador, async (req, res) => {
    try {
        const doc = await docFiscalPertenceContador(req.params.id, req.contadorId);
        if (!doc) return res.status(404).json({ erro: 'Documento fiscal não encontrado ou acesso negado.' });
        const empresa = await pool.query('SELECT razaosocial, cnpj, emailempresa FROM empresas WHERE id = $1', [doc.empresa_id]);
        let osData = null;
        if (doc.ordem_servico_id) {
            const os = await pool.query('SELECT * FROM ordens_servico WHERE id = $1', [doc.ordem_servico_id]);
            osData = os.rows[0] || null;
        }
        res.json({ ...doc, empresa_nome: empresa.rows[0]?.razaosocial, empresa_cnpj: empresa.rows[0]?.cnpj, ordem_servico: osData });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Preparar documento fiscal a partir de uma OS
app.post('/api/documentos-fiscais/preparar', verificarTokenContador, async (req, res) => {
    try {
        const { ordem_servico_id, tipo } = req.body;
        if (!ordem_servico_id) return res.status(400).json({ erro: 'Ordem de serviço é obrigatória.' });
        if (!tipo || !['NF-e', 'NFS-e'].includes(tipo)) return res.status(400).json({ erro: 'Tipo deve ser NF-e ou NFS-e.' });

        const os = await osPertenceContador(ordem_servico_id, req.contadorId);
        if (!os) return res.status(404).json({ erro: 'Ordem de serviço não encontrada ou acesso negado.' });

        // Verifica se já existe documento fiscal para esta OS
        const existente = await pool.query('SELECT id FROM documentos_fiscais WHERE ordem_servico_id = $1 AND status NOT IN ($2, $3)',
            [ordem_servico_id, 'cancelada', 'rejeitada']);
        if (existente.rows.length > 0) {
            return res.status(400).json({ erro: 'Já existe um documento fiscal ativo para esta OS.' });
        }

        // Monta dados fiscais a partir da OS
        const dadosFiscais = {
            emitente: { nome: '', cnpj: '', inscricao_municipal: '', inscricao_estadual: '', endereco: '', municipio: '', uf: '' },
            destinatario: {
                nome: os.cliente_nome || '',
                cpf_cnpj: os.cliente_cpf_cnpj || '',
                endereco: os.cliente_endereco || '',
                municipio: os.cliente_municipio || '',
                uf: os.cliente_uf || ''
            },
            servico: {
                descricao: os.servico_descricao || '',
                quantidade: parseFloat(os.quantidade) || 1,
                valor_unitario: parseFloat(os.valor_unitario) || 0,
                valor_total: parseFloat(os.valor_total) || 0,
                desconto: parseFloat(os.desconto) || 0
            },
            observacoes: os.observacoes || ''
        };

        const result = await pool.query(
            `INSERT INTO documentos_fiscais (empresa_id, contador_id, ordem_servico_id, tipo, status, valor, dados_fiscais, datacriacao)
             VALUES ($1, $2, $3, $4, 'aguardando_conferencia', $5, $6, NOW()) RETURNING id`,
            [os.empresa_id, req.contadorId, ordem_servico_id, tipo, parseFloat(os.valor_total) || 0, JSON.stringify(dadosFiscais)]
        );
        const docId = result.rows[0].id;
        await registrarHistoricoFiscal(docId, req.contadorId, 'contador', 'Preparação', `Documento ${tipo} criado a partir da OS #${os.numero || os.id}`);
        await registrarAuditoria(req.contadorId, 'contador', `Preparou documento fiscal ${tipo} a partir da OS ID: ${ordem_servico_id}`, req,
            { entidade: 'documento_fiscal', entidade_id: docId, empresa_id: os.empresa_id });
        res.status(201).json({ mensagem: 'Documento fiscal preparado!', id: docId });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao preparar documento fiscal: ' + erro.message });
    }
});

// Atualizar dados fiscais (conferência)
app.put('/api/documentos-fiscais/:id', verificarTokenContador, async (req, res) => {
    try {
        const doc = await docFiscalPertenceContador(req.params.id, req.contadorId);
        if (!doc) return res.status(404).json({ erro: 'Documento fiscal não encontrado ou acesso negado.' });
        if (['autorizada', 'cancelada'].includes(doc.status)) {
            return res.status(400).json({ erro: 'Documento autorizado ou cancelado não pode ser editado.' });
        }
        const { dados_fiscais, valor, tipo } = req.body;
        const updates = [];
        const params = [];
        let idx = 1;
        if (dados_fiscais !== undefined) { updates.push(`dados_fiscais = $${idx++}`); params.push(JSON.stringify(dados_fiscais)); }
        if (valor !== undefined) { updates.push(`valor = $${idx++}`); params.push(valor); }
        if (tipo !== undefined) { updates.push(`tipo = $${idx++}`); params.push(tipo); }
        if (updates.length > 0) {
            params.push(req.params.id);
            await pool.query(`UPDATE documentos_fiscais SET ${updates.join(', ')} WHERE id = $${idx}`, params);
            await registrarHistoricoFiscal(req.params.id, req.contadorId, 'contador', 'Conferência', 'Dados fiscais conferidos/atualizados');
        }
        res.json({ mensagem: 'Documento fiscal atualizado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao atualizar: ' + erro.message });
    }
});

// Alterar status do documento fiscal
app.put('/api/documentos-fiscais/:id/status', verificarTokenContador, async (req, res) => {
    try {
        const doc = await docFiscalPertenceContador(req.params.id, req.contadorId);
        if (!doc) return res.status(404).json({ erro: 'Documento fiscal não encontrado ou acesso negado.' });
        const { status } = req.body;
        const statusValidos = ['rascunho', 'aguardando_conferencia', 'pronta_para_emissao', 'em_processamento', 'autorizada', 'rejeitada', 'cancelada'];
        if (!statusValidos.includes(status)) return res.status(400).json({ erro: 'Status inválido.' });
        const statusAnterior = doc.status;
        await pool.query('UPDATE documentos_fiscais SET status = $1 WHERE id = $2', [status, req.params.id]);
        await registrarHistoricoFiscal(req.params.id, req.contadorId, 'contador', 'Status alterado', `De "${statusAnterior}" para "${status}"`);
        await registrarAuditoria(req.contadorId, 'contador', `Alterou status do documento fiscal ID: ${req.params.id} para "${status}"`, req,
            { entidade: 'documento_fiscal', entidade_id: parseInt(req.params.id) });
        res.json({ mensagem: 'Status atualizado.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Marcar como pronta para emissão
app.put('/api/documentos-fiscais/:id/pronta-emissao', verificarTokenContador, async (req, res) => {
    try {
        const doc = await docFiscalPertenceContador(req.params.id, req.contadorId);
        if (!doc) return res.status(404).json({ erro: 'Documento fiscal não encontrado ou acesso negado.' });
        if (!['aguardando_conferencia', 'rascunho', 'rejeitada'].includes(doc.status)) {
            return res.status(400).json({ erro: 'Apenas documentos em conferência ou rejeitados podem ser marcados como prontos.' });
        }
        await pool.query('UPDATE documentos_fiscais SET status = $1 WHERE id = $2', ['pronta_para_emissao', req.params.id]);
        await registrarHistoricoFiscal(req.params.id, req.contadorId, 'contador', 'Pronta para emissão', 'Documento conferido e marcado como pronto para emissão');
        res.json({ mensagem: 'Documento marcado como pronto para emissão!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Cancelar documento fiscal
app.put('/api/documentos-fiscais/:id/cancelar', verificarTokenContador, async (req, res) => {
    try {
        const doc = await docFiscalPertenceContador(req.params.id, req.contadorId);
        if (!doc) return res.status(404).json({ erro: 'Documento fiscal não encontrado ou acesso negado.' });
        if (doc.status === 'cancelada') return res.status(400).json({ erro: 'Documento já está cancelado.' });
        const statusAnterior = doc.status;
        await pool.query('UPDATE documentos_fiscais SET status = $1 WHERE id = $2', ['cancelada', req.params.id]);
        await registrarHistoricoFiscal(req.params.id, req.contadorId, 'contador', 'Cancelamento', `Documento cancelado (status anterior: ${statusAnterior})`);
        res.json({ mensagem: 'Documento cancelado.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Histórico do documento fiscal
app.get('/api/documentos-fiscais/:id/historico', verificarTokenContador, async (req, res) => {
    try {
        const doc = await docFiscalPertenceContador(req.params.id, req.contadorId);
        if (!doc) return res.status(404).json({ erro: 'Documento fiscal não encontrado ou acesso negado.' });
        const resultado = await pool.query(
            'SELECT * FROM documento_fiscal_historico WHERE documento_fiscal_id = $1 ORDER BY data DESC', [req.params.id]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Excluir documento fiscal
app.delete('/api/documentos-fiscais/:id', verificarTokenContador, async (req, res) => {
    try {
        const doc = await docFiscalPertenceContador(req.params.id, req.contadorId);
        if (!doc) return res.status(404).json({ erro: 'Documento fiscal não encontrado ou acesso negado.' });
        if (['autorizada', 'em_processamento'].includes(doc.status)) {
            return res.status(400).json({ erro: 'Não é possível excluir um documento autorizado ou em processamento.' });
        }
        await pool.query('DELETE FROM documento_fiscal_historico WHERE documento_fiscal_id = $1', [req.params.id]);
        await pool.query('DELETE FROM documentos_fiscais WHERE id = $1', [req.params.id]);
        await registrarAuditoria(req.contadorId, 'contador', `Excluiu documento fiscal ID: ${req.params.id}`, req,
            { entidade: 'documento_fiscal', entidade_id: parseInt(req.params.id) });
        res.json({ mensagem: 'Documento fiscal excluído.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Inicialização
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    await criarTabelasAutomaticamente();
});
