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
        const token = jwt.sign({ id: contador.id, email: contador.email, isAdmin: contador.is_admin || false }, JWT_SECRET, { expiresIn: '7d' });
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
        await registrarAuditoria(req.contadorId, 'contador', `Admin excluiu acesso ID: ${id}`, req);
        res.json({ mensagem: 'Acesso excluído.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao excluir: ' + erro.message });
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
