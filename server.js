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
    connectionString: process.env.DATABASE_URL || 'postgresql://coontadoronnline_user:7rpGNrhb0DGachE29ibe9q5mNESBQnh4@dpg-daljnhm5vjqs73fl8ep0-a/coontadoronnline',
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_super_segura';

// ==========================================
// AUDIT LOG - Registro de atividades (LGPD)
// ==========================================
async function registrarAuditoria(usuarioId, usuarioTipo, acao, req) {
    try {
        await pool.query(
            'INSERT INTO audit_log (usuario_id, usuario_tipo, acao, ip, datacriacao) VALUES ($1, $2, $3, $4, NOW())',
            [usuarioId, usuarioTipo, acao, req.ip || 'unknown']
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
        await pool.query(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS primeiro_acesso BOOLEAN DEFAULT TRUE;`);
        await pool.query(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS inadimplente BOOLEAN DEFAULT FALSE;`);
        await pool.query(`ALTER TABLE guias ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pendente';`);

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

        console.log("✅ Tabelas e colunas verificadas/criadas com sucesso!");
    } catch (err) {
        console.error("❌ Erro ao criar tabelas:", err.message);
    }
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
        req.empresaId = decoded.id;
        req.empresaCnpj = decoded.cnpj;
        next();
    } catch (err) {
        return res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }
}

// ==========================================
// 1. ROTAS DE CONTADORES
// ==========================================
app.post('/api/contador/cadastro', async (req, res) => {
    try {
        let { nomeEscritorio, email, senha } = req.body;
        if (!nomeEscritorio || !email || !senha) return res.status(400).json({ erro: 'Preencha todos os campos.' });
        email = email.trim().toLowerCase();
        const usuarioExiste = await pool.query('SELECT * FROM contadores WHERE LOWER(email) = $1', [email]);
        if (usuarioExiste.rows.length > 0) return res.status(400).json({ erro: 'Este e-mail já está cadastrado.' });
        const senhaHash = await bcrypt.hash(senha, await bcrypt.genSalt(10));
        const resultado = await pool.query(
            'INSERT INTO contadores (nomeescritorio, email, senha, senhahash, datacriacao) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
            [nomeEscritorio, email, senhaHash, senhaHash]
        );
        await registrarAuditoria(resultado.rows[0].id, 'contador', 'Cadastro de escritório', req);
        res.status(201).json({ mensagem: 'Escritório cadastrado com sucesso!' });
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
        const senhaValida = await bcrypt.compare(senha, contador.senhahash || contador.senha);
        if (!senhaValida) return res.status(400).json({ erro: 'E-mail ou senha incorretos.' });
        const token = jwt.sign({ id: contador.id, email: contador.email }, JWT_SECRET, { expiresIn: '7d' });
        await registrarAuditoria(contador.id, 'contador', 'Login no painel', req);
        res.json({ mensagem: 'Login realizado!', token, nomeEscritorio: contador.nomeescritorio || 'Escritório', contadorId: contador.id });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro no servidor: ' + erro.message });
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
        const token = jwt.sign({ id: empresa.id, cnpj: empresa.cnpj }, JWT_SECRET, { expiresIn: '7d' });
        await registrarAuditoria(empresa.id, 'cliente', 'Login do cliente', req);
        res.json({ mensagem: 'Login realizado!', token, razaoSocial: empresa.razaosocial, primeiroAcesso: empresa.primeiro_acesso, empresaId: empresa.id });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro no servidor: ' + erro.message });
    }
});

app.post('/api/cliente/alterar-senha', async (req, res) => {
    try {
        let { cnpj, novaSenha } = req.body;
        if (!cnpj || !novaSenha) return res.status(400).json({ erro: 'CNPJ e nova senha são obrigatórios.' });
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        const senhaHash = await bcrypt.hash(novaSenha, await bcrypt.genSalt(10));
        await pool.query('UPDATE empresas SET senhahash = $1, senha = $1, primeiro_acesso = FALSE WHERE cnpj = $2', [senhaHash, cnpjLimpo]);
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
        if (contadorId) await registrarAuditoria(contadorId, 'contador', `Cadastrou empresa: ${razaoSocial}`, req);
        res.status(201).json({ mensagem: 'Empresa cadastrada com sucesso!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao cadastrar empresa: ' + erro.message });
    }
});

app.delete('/api/empresas/:id', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM empresas WHERE id = $1 AND (contador_id = $2 OR contadorid = $2)', [id, req.contadorId]);
        await registrarAuditoria(req.contadorId, 'contador', `Excluiu empresa ID: ${id}`, req);
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
        const { cnpj, tipoimposto, competencia, valor, vencimento, pix } = req.body;
        const cnpjLimpo = cnpj ? cnpj.replace(/\D/g, '') : '';
        await pool.query(
            `INSERT INTO guias (cnpj, tipoimposto, competencia, valor, vencimento, pix, arquivonome, arquivodados, arquivotipo, status, datacriacao) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendente', NOW())`,
            [cnpjLimpo, tipoimposto, competencia, valor || 0, vencimento || null, pix || '',
             req.file ? req.file.originalname : null, req.file ? req.file.buffer : null, req.file ? req.file.mimetype : null]
        );
        await registrarAuditoria(req.contadorId, 'contador', `Cadastrou guia ${tipoimposto} para CNPJ ${cnpjLimpo}`, req);
        res.status(201).json({ mensagem: 'Guia cadastrada com sucesso!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao salvar guia: ' + erro.message });
    }
});

app.get('/api/guias/:cnpj', async (req, res) => {
    try {
        const cnpjLimpo = req.params.cnpj.replace(/\D/g, '');
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
        const guias = await pool.query(
            `SELECT g.*, e.razaosocial 
             FROM guias g 
             JOIN empresas e ON g.cnpj = e.cnpj 
             WHERE e.contador_id = $1 OR e.contadorid = $1 
             ORDER BY g.datacriacao DESC`,
            [req.contadorId]
        );
        res.json(guias.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar guias: ' + erro.message });
    }
});

app.put('/api/guias/:id/status', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await pool.query('UPDATE guias SET status = $1 WHERE id = $2', [status, id]);
        res.json({ mensagem: 'Status atualizado.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao atualizar: ' + erro.message });
    }
});

app.delete('/api/guias/:id', verificarTokenContador, async (req, res) => {
    try {
        await pool.query('DELETE FROM guias WHERE id = $1', [req.params.id]);
        await registrarAuditoria(req.contadorId, 'contador', `Excluiu guia ID: ${req.params.id}`, req);
        res.json({ mensagem: 'Guia excluída.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.get('/api/guias/download/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await pool.query('SELECT arquivonome, arquivodados, arquivotipo FROM guias WHERE id = $1', [id]);
        if (resultado.rows.length === 0 || !resultado.rows[0].arquivodados) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
        const guia = resultado.rows[0];
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

        const [urgente, atencao, emDia] = await Promise.all([
            pool.query('SELECT COUNT(*) as total FROM pendencias WHERE contador_id = $1 AND prioridade = $2 AND status = $3', [cid, 'urgente', 'pendente']),
            pool.query('SELECT COUNT(*) as total FROM pendencias WHERE contador_id = $1 AND prioridade = $2 AND status = $3', [cid, 'atencao', 'pendente']),
            pool.query('SELECT COUNT(*) as total FROM empresas WHERE (contador_id = $1 OR contadorid = $1) AND (inadimplente = FALSE OR inadimplente IS NULL)', [cid])
        ]);

        res.json({
            clientes: parseInt(clientes.rows[0].total),
            inadimplentes: parseInt(inadimplentes.rows[0].total),
            documentosHoje: parseInt(docsHoje.rows[0].total),
            pendencias: parseInt(pendencias.rows[0].total),
            guiasVencer: parseInt(guiasVencer.rows[0].total),
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
        const tipo = req.query.tipo;
        let query = `SELECT d.*, e.razaosocial FROM documentos d LEFT JOIN empresas e ON d.empresa_id = e.id WHERE d.contador_id = $1`;
        const params = [req.contadorId];
        if (tipo) { query += ' AND d.tipo = $2'; params.push(tipo); }
        query += ' ORDER BY d.datacriacao DESC';
        const resultado = await pool.query(query, params);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/documentos', verificarTokenContador, upload.single('arquivo'), async (req, res) => {
    try {
        const { empresa_id, tipo, categoria, descricao } = req.body;
        await pool.query(
            `INSERT INTO documentos (empresa_id, contador_id, tipo, categoria, descricao, arquivonome, arquivodados, arquivotipo, status, enviado_por, datacriacao)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'contador', NOW())`,
            [empresa_id || null, req.contadorId, tipo || 'recebido', categoria || '', descricao || '',
             req.file ? req.file.originalname : null, req.file ? req.file.buffer : null, req.file ? req.file.mimetype : null,
             tipo === 'pendente' ? 'pendente' : 'recebido']
        );
        await registrarAuditoria(req.contadorId, 'contador', `Cadastrou documento: ${descricao || categoria}`, req);
        res.status(201).json({ mensagem: 'Documento salvo!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/documentos/cliente', verificarTokenCliente, upload.single('arquivo'), async (req, res) => {
    try {
        const { categoria, descricao } = req.body;
        const empresa = await pool.query('SELECT contador_id, contadorid FROM empresas WHERE id = $1', [req.empresaId]);
        const contadorId = empresa.rows[0]?.contador_id || empresa.rows[0]?.contadorid;
        await pool.query(
            `INSERT INTO documentos (empresa_id, contador_id, tipo, categoria, descricao, arquivonome, arquivodados, arquivotipo, status, enviado_por, datacriacao)
             VALUES ($1, $2, 'recebido', $3, $4, $5, $6, $7, 'recebido', 'cliente', NOW())`,
            [req.empresaId, contadorId, categoria || '', descricao || '',
             req.file ? req.file.originalname : null, req.file ? req.file.buffer : null, req.file ? req.file.mimetype : null]
        );
        await registrarAuditoria(req.empresaId, 'cliente', `Enviou documento: ${descricao || categoria}`, req);
        res.status(201).json({ mensagem: 'Documento enviado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.get('/api/documentos/cliente', verificarTokenCliente, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT id, categoria, descricao, arquivonome, status, enviado_por, datacriacao FROM documentos WHERE empresa_id = $1 ORDER BY datacriacao DESC',
            [req.empresaId]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.get('/api/documentos/download/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await pool.query('SELECT arquivonome, arquivodados, arquivotipo FROM documentos WHERE id = $1', [id]);
        if (resultado.rows.length === 0 || !resultado.rows[0].arquivodados) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
        const doc = resultado.rows[0];
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
        await pool.query('UPDATE documentos SET status = $1 WHERE id = $2 AND contador_id = $3', [status, id, req.contadorId]);
        res.json({ mensagem: 'Status atualizado.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.delete('/api/documentos/:id', verificarTokenContador, async (req, res) => {
    try {
        await pool.query('DELETE FROM documentos WHERE id = $1 AND contador_id = $2', [req.params.id, req.contadorId]);
        await registrarAuditoria(req.contadorId, 'contador', `Excluiu documento ID: ${req.params.id}`, req);
        res.json({ mensagem: 'Documento excluído.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.delete('/api/documentos/cliente/:id', verificarTokenCliente, async (req, res) => {
    try {
        await pool.query('DELETE FROM documentos WHERE id = $1 AND empresa_id = $2', [req.params.id, req.empresaId]);
        res.json({ mensagem: 'Documento excluído.' });
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
        await pool.query('UPDATE pendencias SET status = COALESCE($1, status), prioridade = COALESCE($2, prioridade) WHERE id = $3 AND contador_id = $4',
            [status, prioridade, id, req.contadorId]);
        res.json({ mensagem: 'Pendência atualizada!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.delete('/api/pendencias/:id', verificarTokenContador, async (req, res) => {
    try {
        await pool.query('DELETE FROM pendencias WHERE id = $1 AND contador_id = $2', [req.params.id, req.contadorId]);
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
// 7. CHECKLIST MENSAL
// ==========================================
app.get('/api/checklist/:empresaId', verificarTokenContador, async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM checklist_mensal WHERE empresa_id = $1 ORDER BY datacriacao DESC', [req.params.empresaId]);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.post('/api/checklist', verificarTokenContador, async (req, res) => {
    try {
        const { empresa_id, item, status, competencia } = req.body;
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
        await pool.query('UPDATE checklist_mensal SET status = $1 WHERE id = $2', [status, req.params.id]);
        res.json({ mensagem: 'Status atualizado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.get('/api/checklist/cliente/:empresaId', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM checklist_mensal WHERE empresa_id = $1 ORDER BY datacriacao DESC', [req.params.empresaId]);
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

app.get('/api/notas-fiscais/download/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await pool.query('SELECT arquivonome, arquivodados, arquivotipo FROM notas_fiscais WHERE id = $1', [id]);
        if (resultado.rows.length === 0 || !resultado.rows[0].arquivodados) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
        const nf = resultado.rows[0];
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
// 14c. CRM - Gestão de Contatos
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
        const { nome, email, telefone, whatsapp, empresa, cargo, tipo, status, observacao,
                origem, servico_interesse, responsavel, valor_proposta, proxima_tarefa } = req.body;
        if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório.' });
        const r = await pool.query(
            `INSERT INTO crm_contatos (contador_id, nome, email, telefone, whatsapp, empresa, cargo, tipo, status, observacao,
                origem, servico_interesse, responsavel, valor_proposta, proxima_tarefa, datacriacao)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW()) RETURNING id`,
            [req.contadorId, nome, email||'', telefone||'', whatsapp||'', empresa||'', cargo||'', tipo||'lead', status||'novo', observacao||'',
             origem||null, servico_interesse||null, responsavel||null, valor_proposta||0, proxima_tarefa||null]
        );
        res.status(201).json({ mensagem: 'Contato criado!', id: r.rows[0].id });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.put('/api/crm/contatos/:id', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, email, telefone, whatsapp, empresa, cargo, tipo, status, observacao,
                origem, servico_interesse, responsavel, valor_proposta, proxima_tarefa, motivo_perda, empresa_id } = req.body;
        await pool.query(
            `UPDATE crm_contatos SET
                nome=COALESCE($1,nome), email=COALESCE($2,email), telefone=COALESCE($3,telefone), whatsapp=COALESCE($4,whatsapp),
                empresa=COALESCE($5,empresa), cargo=COALESCE($6,cargo), tipo=COALESCE($7,tipo), status=COALESCE($8,status),
                observacao=COALESCE($9,observacao), origem=COALESCE($10,origem), servico_interesse=COALESCE($11,servico_interesse),
                responsavel=COALESCE($12,responsavel), valor_proposta=COALESCE($13,valor_proposta), proxima_tarefa=COALESCE($14,proxima_tarefa),
                motivo_perda=COALESCE($15,motivo_perda), empresa_id=COALESCE($16,empresa_id)
             WHERE id=$17 AND contador_id=$18`,
            [nome, email, telefone, whatsapp, empresa, cargo, tipo, status, observacao,
             origem, servico_interesse, responsavel, valor_proposta, proxima_tarefa, motivo_perda, empresa_id, id, req.contadorId]
        );
        res.json({ mensagem: 'Contato atualizado!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Mover contato de etapa (registra histórico, valida motivo de perda, atualiza datas)
app.put('/api/crm/contatos/:id/etapa', verificarTokenContador, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, motivo_perda, responsavel } = req.body;
        const atual = await pool.query('SELECT status, data_primeiro_contato, data_proposta FROM crm_contatos WHERE id=$1 AND contador_id=$2', [id, req.contadorId]);
        if (atual.rows.length === 0) return res.status(404).json({ erro: 'Contato não encontrado.' });
        const etapaAnterior = atual.rows[0].status;
        if (etapaAnterior === status) return res.json({ mensagem: 'Sem alteração.' });

        // Se movendo para perdido, exige motivo
        if (status === 'perdido' && !motivo_perda) {
            return res.status(400).json({ erro: 'Motivo da perda é obrigatório.' });
        }

        const updates = ['status=$1'];
        const params = [status];
        let pi = 2;
        if (status === 'perdido' && motivo_perda) { updates.push(`motivo_perda=$${pi}`); params.push(motivo_perda); pi++; }
        if (status === 'contatado' && !atual.rows[0].data_primeiro_contato) { updates.push(`data_primeiro_contato=NOW()`); }
        if (status === 'negociando' && !atual.rows[0].data_proposta) { updates.push(`data_proposta=NOW()`); }
        if (status === 'ganho') { updates.push(`data_fechamento=NOW()`); }
        updates.push(`data_ultimo_contato=NOW()`);
        params.push(id, req.contadorId);
        await pool.query(`UPDATE crm_contatos SET ${updates.join(',')} WHERE id=$${pi} AND contador_id=$${pi+1}`, params);

        // Registra histórico
        await pool.query(
            `INSERT INTO crm_historico_etapas (contato_id, contador_id, etapa_anterior, etapa_nova, responsavel, data_mudanca)
             VALUES ($1,$2,$3,$4,$5,NOW())`,
            [id, req.contadorId, etapaAnterior, status, responsavel || null]
        );
        res.json({ mensagem: 'Etapa atualizada!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

app.delete('/api/crm/contatos/:id', verificarTokenContador, async (req, res) => {
    try {
        await pool.query('DELETE FROM crm_contatos WHERE id = $1 AND contador_id = $2', [req.params.id, req.contadorId]);
        await pool.query('DELETE FROM crm_atividades WHERE contato_id = $1 AND contador_id = $2', [req.params.id, req.contadorId]);
        await pool.query('DELETE FROM crm_historico_etapas WHERE contato_id = $1 AND contador_id = $2', [req.params.id, req.contadorId]);
        await pool.query('DELETE FROM crm_tarefas WHERE contato_id = $1 AND contador_id = $2', [req.params.id, req.contadorId]);
        res.json({ mensagem: 'Contato excluído.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Dashboard do CRM - indicadores, conversão, análise por etapa, fontes, motivos
app.get('/api/crm/dashboard', verificarTokenContador, async (req, res) => {
    try {
        const cid = req.contadorId;
        const contatos = await pool.query('SELECT * FROM crm_contatos WHERE contador_id=$1', [cid]);
        const rows = contatos.rows;
        const total = rows.length;
        const leads = rows.filter(c => c.tipo === 'lead').length;
        const clientes = rows.filter(c => c.tipo === 'cliente').length;
        const ganhos = rows.filter(c => c.status === 'ganho').length;
        const perdidos = rows.filter(c => c.status === 'perdido').length;
        const emAndamento = rows.filter(c => ['novo','contatado','negociando'].includes(c.status)).length;
        const valorTotal = rows.filter(c => c.status !== 'perdido').reduce((s,c) => s + Number(c.valor_proposta||0), 0);
        const valorFechado = rows.filter(c => c.status === 'ganho').reduce((s,c) => s + Number(c.valor_proposta||0), 0);

        // Análise por etapa
        const etapas = ['novo','contatado','negociando','ganho','perdido'];
        const analiseEtapa = etapas.map(e => {
            const count = rows.filter(c => c.status === e).length;
            return { etapa: e, quantidade: count, percentual: total > 0 ? +(count/total*100).toFixed(1) : 0 };
        });

        // Taxas de conversão
        const totalLeads = rows.filter(c => c.tipo === 'lead' || c.tipo === 'prospect' || c.tipo === 'cliente').length;
        const totalProposta = rows.filter(c => ['negociando','ganho','perdido'].includes(c.status)).length;
        const totalFechado = ganhos;
        const convLeadCliente = totalLeads > 0 ? +(clientes/totalLeads*100).toFixed(1) : 0;
        const convLeadProposta = totalLeads > 0 ? +(totalProposta/totalLeads*100).toFixed(1) : 0;
        const convPropostaFechado = totalProposta > 0 ? +(totalFechado/totalProposta*100).toFixed(1) : 0;
        const convGeral = total > 0 ? +(ganhos/total*100).toFixed(1) : 0;

        // Tempo médio de conversão (em dias)
        function avgDays(arr) { if (!arr.length) return 0; const sum = arr.reduce((s,v)=>s+v,0); return +(sum/arr.length).toFixed(1); }
        const tCriacaoPrimeiroContato = avgDays(rows.filter(c=>c.datacriacao&&c.data_primeiro_contato).map(c=>(new Date(c.data_primeiro_contato)-new Date(c.datacriacao))/86400000));
        const tPrimeiroContatoProposta = avgDays(rows.filter(c=>c.data_primeiro_contato&&c.data_proposta).map(c=>(new Date(c.data_proposta)-new Date(c.data_primeiro_contato))/86400000));
        const tPropostaFechamento = avgDays(rows.filter(c=>c.data_proposta&&c.data_fechamento).map(c=>(new Date(c.data_fechamento)-new Date(c.data_proposta))/86400000));
        const tTotal = avgDays(rows.filter(c=>c.datacriacao&&c.data_fechamento).map(c=>(new Date(c.data_fechamento)-new Date(c.datacriacao))/86400000));

        // Fontes dos leads
        const fontesMap = {};
        rows.forEach(c => { const o = c.origem || 'nao_informado'; fontesMap[o] = (fontesMap[o]||0)+1; });
        const fontes = Object.entries(fontesMap).map(([origem,count])=>({origem,count}));

        // Motivos de perda
        const motivosMap = {};
        rows.filter(c=>c.status==='perdido').forEach(c => { const m = c.motivo_perda || 'nao_informado'; motivosMap[m]=(motivosMap[m]||0)+1; });
        const motivos = Object.entries(motivosMap).map(([motivo,count])=>({motivo,count}));

        // Negociações por status ao longo do tempo (últimos 90 dias agrupado por dia)
        const series = await pool.query(
            `SELECT DATE(datacriacao) as dia,
                COUNT(*) FILTER (WHERE status='ganho') as ganhos,
                COUNT(*) FILTER (WHERE status='perdido') as perdidos,
                COUNT(*) FILTER (WHERE status IN ('novo','contatado','negociando')) as andamento,
                COUNT(*) as total
             FROM crm_contatos WHERE contador_id=$1 AND datacriacao >= NOW() - INTERVAL '90 days'
             GROUP BY DATE(datacriacao) ORDER BY dia`, [cid]
        );

        // Tarefas
        const tarefasHoje = await pool.query("SELECT COUNT(*) as t FROM crm_tarefas WHERE contador_id=$1 AND status='pendente' AND prazo=CURRENT_DATE", [cid]);
        const tarefasAtrasadas = await pool.query("SELECT COUNT(*) as t FROM crm_tarefas WHERE contador_id=$1 AND status='pendente' AND prazo < CURRENT_DATE", [cid]);

        res.json({
            cards: { total, leads, clientes, ganhos, perdidos, emAndamento, valorTotal: +valorTotal.toFixed(2), valorFechado: +valorFechado.toFixed(2) },
            analiseEtapa,
            conversao: { convLeadCliente, convLeadProposta, convPropostaFechado, convGeral },
            tempoMedio: { tCriacaoPrimeiroContato, tPrimeiroContatoProposta, tPropostaFechamento, tTotal },
            fontes,
            motivos,
            series: series.rows,
            tarefas: { hoje: parseInt(tarefasHoje.rows[0].t), atrasadas: parseInt(tarefasAtrasadas.rows[0].t) }
        });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro: ' + erro.message });
    }
});

// Atividades do CRM
app.get('/api/crm/contatos/:id/atividades', verificarTokenContador, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM crm_atividades WHERE contato_id=$1 AND contador_id=$2 ORDER BY data DESC', [req.params.id, req.contadorId]);
        res.json(r.rows);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});
app.post('/api/crm/contatos/:id/atividades', verificarTokenContador, async (req, res) => {
    try {
        const { tipo, descricao, resultado, proxima_acao, responsavel } = req.body;
        const r = await pool.query(
            `INSERT INTO crm_atividades (contato_id, contador_id, tipo, descricao, resultado, proxima_acao, responsavel, data)
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING id`,
            [req.params.id, req.contadorId, tipo||'ligacao', descricao||'', resultado||'', proxima_acao||'', responsavel||'']
        );
        // Atualiza data do último contato
        await pool.query('UPDATE crm_contatos SET data_ultimo_contato=NOW() WHERE id=$1 AND contador_id=$2', [req.params.id, req.contadorId]);
        res.status(201).json({ mensagem: 'Atividade registrada!', id: r.rows[0].id });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Histórico de etapas
app.get('/api/crm/contatos/:id/historico', verificarTokenContador, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM crm_historico_etapas WHERE contato_id=$1 AND contador_id=$2 ORDER BY data_mudanca DESC', [req.params.id, req.contadorId]);
        res.json(r.rows);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Tarefas do CRM
app.get('/api/crm/tarefas', verificarTokenContador, async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT t.*, c.nome as contato_nome, c.empresa as contato_empresa
             FROM crm_tarefas t LEFT JOIN crm_contatos c ON t.contato_id=c.id
             WHERE t.contador_id=$1 ORDER BY
             CASE t.prioridade WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END, t.prazo ASC NULLS LAST`,
            [req.contadorId]
        );
        res.json(r.rows);
    } catch (e) { res.status(500).json({ erro: e.message }); }
});
app.post('/api/crm/tarefas', verificarTokenContador, async (req, res) => {
    try {
        const { contato_id, empresa_id, descricao, prazo, responsavel, prioridade } = req.body;
        const r = await pool.query(
            `INSERT INTO crm_tarefas (contato_id, contador_id, empresa_id, descricao, prazo, responsavel, prioridade, status, datacriacao)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'pendente',NOW()) RETURNING id`,
            [contato_id||null, req.contadorId, empresa_id||null, descricao, prazo||null, responsavel||'', prioridade||'media']
        );
        res.status(201).json({ mensagem: 'Tarefa criada!', id: r.rows[0].id });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});
app.put('/api/crm/tarefas/:id', verificarTokenContador, async (req, res) => {
    try {
        const { status, prioridade } = req.body;
        await pool.query('UPDATE crm_tarefas SET status=COALESCE($1,status), prioridade=COALESCE($2,prioridade) WHERE id=$3 AND contador_id=$4',
            [status, prioridade, req.params.id, req.contadorId]);
        res.json({ mensagem: 'Tarefa atualizada!' });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});
app.delete('/api/crm/tarefas/:id', verificarTokenContador, async (req, res) => {
    try {
        await pool.query('DELETE FROM crm_tarefas WHERE id=$1 AND contador_id=$2', [req.params.id, req.contadorId]);
        res.json({ mensagem: 'Tarefa excluída.' });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Converter lead em cliente (cria empresa vinculada, não duplica)
app.post('/api/crm/contatos/:id/converter', verificarTokenContador, async (req, res) => {
    try {
        const { cnpj, razao_social, email_empresa, senha } = req.body;
        const contato = await pool.query('SELECT * FROM crm_contatos WHERE id=$1 AND contador_id=$2', [req.params.id, req.contadorId]);
        if (contato.rows.length === 0) return res.status(404).json({ erro: 'Contato não encontrado.' });
        const c = contato.rows[0];
        if (c.empresa_id) return res.status(400).json({ erro: 'Contato já convertido em cliente.' });

        let empresaId = null;
        if (cnpj) {
            const cnpjLimpo = cnpj.replace(/\D/g,'');
            const existente = await pool.query('SELECT id FROM empresas WHERE cnpj=$1', [cnpjLimpo]);
            if (existente.rows.length > 0) {
                empresaId = existente.rows[0].id;
            } else {
                const senhaHash = senha ? await bcrypt.hash(senha, await bcrypt.genSalt(10)) : null;
                const novaEmpresa = await pool.query(
                    `INSERT INTO empresas (cnpj, razaosocial, emailempresa, senha, senhahash, contador_id, contadorid, primeiro_acesso, datacriacao)
                     VALUES ($1,$2,$3,$4,$5,$6,$6,TRUE,NOW()) RETURNING id`,
                    [cnpjLimpo, razao_social || c.empresa || c.nome, email_empresa || c.email || '', senhaHash, senhaHash, req.contadorId]
                );
                empresaId = novaEmpresa.rows[0].id;
            }
        }
        await pool.query('UPDATE crm_contatos SET tipo=$1, status=$2, empresa_id=$3, data_fechamento=NOW() WHERE id=$4 AND contador_id=$5',
            ['cliente', 'ganho', empresaId, req.params.id, req.contadorId]);
        await pool.query(
            `INSERT INTO crm_historico_etapas (contato_id, contador_id, etapa_anterior, etapa_nova, responsavel, data_mudanca)
             VALUES ($1,$2,$3,'ganho',$4,NOW())`,
            [req.params.id, req.contadorId, c.status, req.body.responsavel || null]
        );
        res.json({ mensagem: 'Lead convertido em cliente com sucesso!', empresaId });
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Exportar contatos em CSV
app.get('/api/crm/export', verificarTokenContador, async (req, res) => {
    try {
        const tipo = req.query.tipo;
        let rows = (await pool.query('SELECT * FROM crm_contatos WHERE contador_id=$1 ORDER BY datacriacao DESC', [req.contadorId])).rows;
        if (tipo === 'ganhos') rows = rows.filter(c => c.status === 'ganho');
        else if (tipo === 'perdidos') rows = rows.filter(c => c.status === 'perdido');
        else if (tipo === 'clientes') rows = rows.filter(c => c.tipo === 'cliente');
        else if (tipo === 'leads') rows = rows.filter(c => c.tipo === 'lead');
        const headers = ['id','nome','email','telefone','whatsapp','empresa','cargo','tipo','status','origem','servico_interesse','responsavel','valor_proposta','motivo_perda','datacriacao'];
        const csv = [headers.join(';')];
        rows.forEach(r => { csv.push(headers.map(h => `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(';')); });
        res.setHeader('Content-Type','text/csv; charset=utf-8');
        res.setHeader('Content-Disposition',`attachment; filename="crm_${tipo||'contatos'}.csv"`);
        res.send('\ufeff' + csv.join('\n'));
    } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ==========================================
// 15. AUDIT LOG
// ==========================================
app.get('/api/audit', verificarTokenContador, async (req, res) => {
    try {
        const resultado = await pool.query(
            'SELECT * FROM audit_log WHERE usuario_id = $1 AND usuario_tipo = $2 ORDER BY datacriacao DESC LIMIT 100',
            [req.contadorId, 'contador']
        );
        res.json(resultado.rows);
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
            pool.query('SELECT id, categoria, descricao, arquivonome, status, enviado_por, datacriacao FROM documentos WHERE empresa_id = $1 ORDER BY datacriacao DESC', [eid])
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
            'SELECT id, cnpj, tipoimposto, competencia, valor, vencimento, pix, arquivonome, status, datacriacao FROM guias WHERE cnpj = $1 ORDER BY datacriacao DESC',
            [req.empresaCnpj]
        );
        res.json(guias.rows);
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
