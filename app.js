/* RH Grupo Nogueira Lins — Requisição e Acompanhamento de Vagas
   App PWA em JavaScript puro. Toda permissão é garantida no banco (RLS);
   aqui a interface apenas esconde o que o usuário não pode fazer. */
(() => {
  'use strict';

  const C = window.RH_CONFIG || {};
  const root = document.getElementById('root');
  const S = { me: null, unidades: [], departamentos: [], cargos: [], beneficios: [], config: {}, naoLidas: 0, ultimaAtividade: Date.now() };
  let sb = null;

  // ------------------------------------------------------------------ utilidades
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dt = (d) => (d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d) : null);
  const fmtData = (d) => (d ? dt(d).toLocaleDateString('pt-BR') : '—');
  const fmtDH = (d) => (d ? dt(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const money = (n) => (n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const diasEntre = (a, b = new Date()) => Math.max(0, Math.floor((dt(b) - dt(a)) / 86400000));
  const hoje = () => new Date().toISOString().slice(0, 10);
  const iniciais = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const simNao = (b) => (b === true ? 'Sim' : b === false ? 'Não' : '—');
  const txt = (s) => (s === null || s === undefined || s === '' ? '—' : esc(s));
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const on = (el, sel, ev, fn) => $$(sel, el).forEach((n) => n.addEventListener(ev, fn));
  const uni = (id) => S.unidades.find((u) => u.id === id);
  const uniNome = (id) => uni(id)?.nome || '—';
  const depNome = (id) => S.departamentos.find((d) => d.id === id)?.nome || '—';
  const isMaster = () => S.me?.perfil === 'master';
  const temUnidade = (id) => isMaster() || S.me.todas_unidades || (S.me.unidades || []).includes(id);
  const minhasUnidades = () => S.unidades.filter((u) => u.ativo && (isMaster() || S.me.todas_unidades || (S.me.unidades || []).includes(u.id)));

  function toast(msg, erro = false) {
    $$('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast' + (erro ? ' err' : '');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), erro ? 5000 : 2800);
  }

  function erroAmigavel(e) {
    const m = (e && (e.message || e.error_description || e.erro)) || String(e || '');
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão. Verifique a internet e tente novamente.';
    if (/JWT|session|token/i.test(m)) return 'Sua sessão expirou. Entre novamente.';
    if (/row-level security|permission|permiss/i.test(m)) return 'Você não tem permissão para esta ação.';
    return m.length < 160 ? m : 'Não foi possível concluir. Tente novamente.';
  }

  function modal(html, { wide = false } = {}) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" ${wide ? 'style="max-width:720px"' : ''}>${html}</div>`;
    document.body.appendChild(back);
    const fechar = () => { back.remove(); document.removeEventListener('keydown', esc_); };
    const esc_ = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', esc_);
    back.addEventListener('click', (e) => { if (e.target === back) fechar(); });
    on(back, '[data-fechar]', 'click', fechar);
    const primeiro = $('input, select, textarea', back);
    if (primeiro) setTimeout(() => primeiro.focus(), 50);
    return { el: back, fechar };
  }

  function confirmar(titulo, texto, botao = 'Confirmar', perigo = false) {
    return new Promise((ok) => {
      const m = modal(`<h2>${esc(titulo)}</h2><p class="muted">${esc(texto)}</p>
        <div class="actions"><button class="btn" data-fechar>Voltar</button>
        <button class="btn ${perigo ? 'danger' : 'primary'}" data-ok>${esc(botao)}</button></div>`);
      $('[data-ok]', m.el).addEventListener('click', () => { m.fechar(); ok(true); });
      on(m.el, '[data-fechar]', 'click', () => ok(false));
    });
  }

  function travar(btn, texto = 'Aguarde…') {
    if (!btn) return () => {};
    const antes = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = texto;
    return () => { btn.disabled = false; btn.innerHTML = antes; };
  }

  // ------------------------------------------------------------------ ícones
  const svg = (p) => `<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg></span>`;
  const I = {
    home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
    list: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    bell: svg('<path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 004 0"/>'),
    more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6"/>'),
    building: svg('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>'),
    folder: svg('<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'),
    shield: svg('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>'),
    out: svg('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
    back: svg('<path d="M15 6l-6 6 6 6"/>'),
    down: svg('<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>'),
    print: svg('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'),
    copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'),
    clip: svg('<path d="M21 11l-8.5 8.5a5 5 0 01-7-7L14 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 7"/>'),
    doc: svg('<path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    swap: svg('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
    check: svg('<path d="M5 12l5 5L20 7"/>'),
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  };

  // ------------------------------------------------------------------ status
  const ST = {
    rascunho: { l: 'Rascunho', c: '' },
    aguardando_aprovacao: { l: 'Aguardando aprovação', c: 'warn' },
    aprovada: { l: 'Aprovada', c: 'info' },
    devolvida: { l: 'Devolvida para ajuste', c: 'warn' },
    reprovada: { l: 'Reprovada', c: 'bad' },
    em_divulgacao: { l: 'Em divulgação', c: 'violet' },
    triagem: { l: 'Triagem', c: 'violet' },
    entrevistas: { l: 'Entrevistas', c: 'violet' },
    proposta_enviada: { l: 'Proposta enviada', c: 'violet' },
    admissao: { l: 'Admissão em andamento', c: 'info' },
    concluida: { l: 'Concluída', c: 'ok' },
    suspensa: { l: 'Suspensa', c: '' },
    cancelada: { l: 'Cancelada', c: 'bad' },
  };
  const FINAIS = ['concluida', 'cancelada', 'reprovada'];
  const ETAPAS_RH = ['em_divulgacao', 'triagem', 'entrevistas', 'proposta_enviada', 'admissao', 'concluida', 'suspensa'];
  const PEDE_MOTIVO = ['devolvida', 'reprovada', 'suspensa', 'cancelada'];
  const URG = { normal: { l: 'Normal', c: 'plain' }, alta: { l: 'Alta', c: 'warn' }, critica: { l: 'Crítica', c: 'bad' } };
  const MOTIVOS = { aumento_quadro: 'Aumento de quadro', substituicao: 'Substituição', afastamento: 'Cobertura de afastamento', nova_unidade: 'Nova unidade / expansão' };
  const PERFIS = { master: 'Master', rh: 'RH', aprovador: 'Aprovador', gestor: 'Gestor', visualizador: 'Visualizador' };
  const chipStatus = (s) => `<span class="chip ${ST[s]?.c || ''}">${esc(ST[s]?.l || s)}</span>`;
  const aberta = (v) => !FINAIS.includes(v.status) && v.status !== 'rascunho';
  const atrasada = (v) => aberta(v) && v.status !== 'suspensa' && v.prazo_sla && v.prazo_sla < hoje();
  // Aprovação: diretor definido na concessionária; sem diretor, quem tem "aprovar" na unidade
  const podeAprovarUni = (uid) => {
    if (isMaster()) return true;
    const u = uni(uid);
    return u?.aprovador_id ? u.aprovador_id === S.me.id : !!S.me.pode_aprovar && temUnidade(uid);
  };
  const podeConduzir = (v) => isMaster() || (!!S.me.pode_alterar_status && temUnidade(v.unidade_id));

  // Checklist de documentos da admissão (REV.03)
  const ITENS_ADM = [
    ['foto', 'Foto'], ['rg_cpf', 'RG / CPF'], ['cnh', 'CNH'], ['comprovante_endereco', 'Comprovante de endereço'],
    ['ctps', 'CTPS'], ['pis', 'PIS'], ['conta_bancaria', 'Conta BB / Bradesco'], ['escolaridade', 'Escolaridade'],
    ['certidao_nascimento', 'Certidão de nascimento'], ['rg_conjuge', 'RG do cônjuge', true], ['rg_filhos', 'RG dos filhos', true], ['aso', 'ASO'],
  ];
  const ITEM_ADM_L = Object.fromEntries(ITENS_ADM.map(([k, l]) => [k, l]));

  // Outras solicitações (REV.03)
  const ST_SOL = {
    aguardando_aprovacao: { l: 'Aguardando aprovação', c: 'warn' },
    devolvida: { l: 'Devolvida para ajuste', c: 'warn' },
    reprovada: { l: 'Reprovada', c: 'bad' },
    pendente_rh: { l: 'Com o RH', c: 'info' },
    em_andamento: { l: 'Em andamento', c: 'violet' },
    concluida: { l: 'Concluída', c: 'ok' },
    cancelada: { l: 'Cancelada', c: 'bad' },
  };
  const FINAIS_SOL = ['concluida', 'cancelada', 'reprovada'];
  const TIPOS_SOL = { alteracao_cargo: 'Alteração de cargo e/ou salário', geral: 'Solicitação geral' };
  const chipSol = (s) => `<span class="chip ${ST_SOL[s]?.c || ''}">${esc(ST_SOL[s]?.l || s)}</span>`;
  const tituloSol = (s) => (s.tipo === 'geral' ? s.titulo || 'Solicitação' : `Alteração de cargo/salário · ${s.colaborador_nome || ''}`);

  function transicoes(v) {
    const me = S.me, m = isMaster(), out = [];
    if (FINAIS.includes(v.status)) return out;
    const u = temUnidade(v.unidade_id);
    if (['rascunho', 'devolvida'].includes(v.status) && (v.solicitante_id === me.id || m)) out.push('aguardando_aprovacao');
    if (v.status === 'aguardando_aprovacao' && podeAprovarUni(v.unidade_id)) out.push('aprovada', 'devolvida', 'reprovada');
    if ((v.status === 'aprovada' || ETAPAS_RH.includes(v.status)) && (m || (me.pode_alterar_status && u))) ETAPAS_RH.forEach((s) => s !== v.status && out.push(s));
    if (m || (me.pode_alterar_status && u) || (v.solicitante_id === me.id && ['rascunho', 'aguardando_aprovacao', 'devolvida'].includes(v.status))) out.push('cancelada');
    return out;
  }

  // ------------------------------------------------------------------ início
  function iniciar() {
    if (!/^https:\/\/.+\.supabase\.co/.test(C.SUPABASE_URL || '')) {
      root.innerHTML = `<div class="login-wrap"><div class="card login"><h2>Configuração pendente</h2>
        <p class="muted">Informe a URL e a chave pública do Supabase no arquivo config.js.</p></div></div>`;
      return;
    }
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'rh-gnl-auth', detectSessionInUrl: false },
    });
    sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { S.me = null; telaLogin(); } });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, () => { S.ultimaAtividade = Date.now(); }, { passive: true }));
    setInterval(verificarInatividade, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me) { verificarInatividade(); contarAvisos(); } });
    window.addEventListener('hashchange', rotear);
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.instalar = e; });
    carregarSessao();
  }

  async function verificarInatividade() {
    if (!S.me) return;
    const lim = (C.INATIVIDADE_MIN || 60) * 60000;
    if (Date.now() - S.ultimaAtividade > lim) {
      await sb.auth.signOut();
      telaLogin('Sessão encerrada por inatividade. Entre novamente.');
    }
  }

  async function carregarSessao(msg) {
    const { data } = await sb.auth.getUser().catch(() => ({ data: {} }));
    if (!data?.user) return telaLogin(msg);
    const { data: me, error } = await sb.from('perfis').select('*').eq('id', data.user.id).maybeSingle();
    if (error || !me || !me.ativo) {
      await sb.auth.signOut();
      return telaLogin(error ? erroAmigavel(error) : 'Seu acesso não está ativo. Fale com o administrador do sistema.');
    }
    S.me = me;
    S.ultimaAtividade = Date.now();
    sb.rpc('registrar_acesso').then(() => {});
    if (me.deve_trocar_senha) return telaTrocarSenha(true);
    await carregarCadastros();
    montarApp();
  }

  async function carregarCadastros() {
    const [u, d, c, b, cf] = await Promise.all([
      sb.from('unidades').select('*').order('nome'),
      sb.from('departamentos').select('*').order('nome'),
      sb.from('cargos').select('*').order('nome'),
      sb.from('beneficios').select('*').order('nome'),
      sb.from('configuracoes').select('*'),
    ]);
    S.unidades = u.data || []; S.departamentos = d.data || []; S.cargos = c.data || []; S.beneficios = b.data || [];
    S.config = Object.fromEntries((cf.data || []).map((x) => [x.chave, x.valor]));
  }

  // ------------------------------------------------------------------ login
  function telaLogin(msg) {
    root.innerHTML = `
      <div class="login-wrap"><form class="login" id="f-login" novalidate>
        <div class="logo"><img src="icons/icon-192.png" alt=""><div><h1>RH Grupo Nogueira Lins</h1>
        <small>Requisição e acompanhamento de vagas</small></div></div>
        <div class="card form-grid">
          ${msg ? `<div class="chip warn plain" style="white-space:normal">${esc(msg)}</div>` : ''}
          <label class="f"><span>E-mail</span><input class="input" type="email" name="email" autocomplete="username" inputmode="email" required></label>
          <label class="f"><span>Senha</span><input class="input" type="password" name="senha" autocomplete="current-password" required></label>
          <button class="btn primary block" type="submit">Entrar</button>
          <small class="muted" style="text-align:center">Esqueceu a senha? Fale com o administrador do sistema.</small>
        </div>
      </form></div>`;
    const f = $('#f-login');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = f.email.value.trim(), senha = f.senha.value;
      if (!email || !senha) return toast('Informe e-mail e senha.', true);
      const solta = travar($('button[type=submit]', f), 'Entrando…');
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) {
        solta();
        const m = /rate|too many/i.test(error.message) ? 'Muitas tentativas. Aguarde alguns minutos.'
          : /banned|disabled/i.test(error.message) ? 'Seu acesso está desativado.' : 'E-mail ou senha incorretos.';
        return toast(m, true);
      }
      if (!location.hash || location.hash === '#/') location.hash = '#/inicio';
      carregarSessao();
    });
  }

  function validarSenha(s) {
    if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Use letras e números na senha.';
    return null;
  }

  function telaTrocarSenha(obrigatoria) {
    const html = `
      <form id="f-senha" class="form-grid" novalidate>
        ${obrigatoria ? '<p class="muted" style="margin:0">Por segurança, crie uma senha pessoal para continuar.</p>' : ''}
        <label class="f"><span>Nova senha</span><input class="input" type="password" name="s1" autocomplete="new-password" required></label>
        <label class="f"><span>Repita a nova senha</span><input class="input" type="password" name="s2" autocomplete="new-password" required>
        <div class="hint">Mínimo de 8 caracteres, com letras e números.</div></label>
        <div class="actions" style="justify-content:flex-end">
          ${obrigatoria ? '<button type="button" class="btn ghost" data-sair>Sair</button>' : '<button type="button" class="btn" data-fechar>Cancelar</button>'}
          <button class="btn primary" type="submit">Salvar senha</button></div>
      </form>`;
    let m = null;
    if (obrigatoria) {
      root.innerHTML = `<div class="login-wrap"><div class="login"><div class="logo"><img src="icons/icon-192.png" alt="">
        <h1>Crie sua senha</h1></div><div class="card">${html}</div></div></div>`;
      on(root, '[data-sair]', 'click', () => sb.auth.signOut());
    } else {
      m = modal(`<h2>Trocar senha</h2>${html}`);
    }
    const f = $('#f-senha');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const s1 = f.s1.value, s2 = f.s2.value;
      const inval = validarSenha(s1);
      if (inval) return toast(inval, true);
      if (s1 !== s2) return toast('As senhas não conferem.', true);
      const solta = travar($('button[type=submit]', f), 'Salvando…');
      const { error } = await sb.auth.updateUser({ password: s1 });
      if (error) { solta(); return toast(/same|different/i.test(error.message) ? 'A nova senha deve ser diferente da atual.' : erroAmigavel(error), true); }
      await sb.rpc('senha_trocada');
      toast('Senha atualizada.');
      if (m) m.fechar(); else carregarSessao();
    });
  }

  // ------------------------------------------------------------------ estrutura
  function itensMenu() {
    const me = S.me, it = [{ h: 'inicio', l: 'Início', i: I.home }, { h: 'vagas', l: 'Vagas', i: I.list }];
    if (me.pode_criar || isMaster()) it.push({ h: 'nova', l: 'Nova vaga', i: I.plus, cta: true });
    it.push({ h: 'solicitacoes', l: 'Outras solicitações', i: I.swap, soLado: true }); // no celular fica em "Mais"
    it.push({ h: 'avisos', l: 'Avisos', i: I.bell, avisos: true });
    return it;
  }
  function itensAdmin() {
    const it = [];
    if (isMaster()) it.push({ h: 'admin/usuarios', l: 'Usuários', i: I.users }, { h: 'admin/unidades', l: 'Concessionárias', i: I.building }, { h: 'admin/documentos', l: 'Documentos', i: I.doc });
    if (isMaster() || S.me.gerenciar_cadastros) it.push({ h: 'admin/cadastros', l: 'Cadastros', i: I.folder });
    if (isMaster()) it.push({ h: 'admin/config', l: 'Configurações', i: I.gear }, { h: 'auditoria', l: 'Auditoria', i: I.shield });
    return it;
  }

  function montarApp() {
    const menu = itensMenu(), adm = itensAdmin();
    const lado = [...menu, ...adm, { h: 'conta', l: 'Minha conta', i: I.user }];
    const baixo = [...menu.filter((x) => !x.soLado), { h: 'mais', l: 'Mais', i: I.more }];
    root.innerHTML = `
      <div class="app">
        <nav class="sidebar" aria-label="Menu">
          <div class="brand"><img src="icons/icon-192.png" alt=""><b>RH Grupo<br>Nogueira Lins</b></div>
          ${lado.map((x) => `<a href="#/${x.h}" data-nav="${x.h}">${x.i}<span>${esc(x.l)}</span>${x.avisos ? '<span class="chip bad plain hidden" data-badge style="margin-left:auto"></span>' : ''}</a>`).join('')}
          <div class="grow"></div>
          <a href="#" data-sair>${I.out}<span>Sair</span></a>
        </nav>
        <div class="main">
          <header class="topbar">
            <div class="brand"><img src="icons/icon-192.png" alt=""><b>RH Grupo Nogueira Lins</b></div>
            <button class="icon-btn" data-go="avisos" aria-label="Avisos">${I.bell}<span class="badge-dot hidden" data-badge></span></button>
            <button class="icon-btn" data-go="conta" aria-label="Minha conta"><span class="avatar" style="width:32px;height:32px;font-size:12px">${esc(iniciais(S.me.nome))}</span></button>
          </header>
          <main id="view"></main>
        </div>
        <nav class="bottomnav" style="grid-template-columns:repeat(${baixo.length},1fr)" aria-label="Navegação">
          ${baixo.map((x) => `<a href="#/${x.h}" data-nav="${x.h}" class="${x.cta ? 'cta' : ''}">${x.i}<span>${x.cta ? 'Nova' : esc(x.l)}</span></a>`).join('')}
        </nav>
      </div>`;
    on(root, '[data-sair]', 'click', (e) => { e.preventDefault(); sair(); });
    on(root, '[data-go]', 'click', (e) => { location.hash = '#/' + e.currentTarget.dataset.go; });
    if (!location.hash || location.hash === '#/') location.hash = '#/inicio';
    else rotear();
    contarAvisos();
    clearInterval(S.timerAvisos);
    S.timerAvisos = setInterval(contarAvisos, 60000);
    setTimeout(retencaoAutomatica, 4000);
  }

  async function sair() {
    if (!(await confirmar('Sair', 'Deseja encerrar sua sessão neste aparelho?', 'Sair'))) return;
    await sb.auth.signOut();
  }

  async function contarAvisos() {
    if (!S.me) return;
    const { count } = await sb.from('notificacoes').select('id', { count: 'exact', head: true }).eq('lida', false);
    S.naoLidas = count || 0;
    $$('[data-badge]').forEach((b) => { b.textContent = S.naoLidas > 99 ? '99+' : S.naoLidas; b.classList.toggle('hidden', !S.naoLidas); });
  }

  function view() { return $('#view'); }

  function rotear() {
    if (!S.me || !view()) return;
    const raw = (location.hash || '#/inicio').slice(2);
    const [caminho, qs] = raw.split('?');
    const params = new URLSearchParams(qs || '');
    const p = caminho.split('/');
    $$('.modal-back').forEach((m) => m.remove()); // janelas abertas não sobrevivem à troca de tela
    $$('[data-nav]').forEach((a) => {
      const n = a.dataset.nav;
      const ehSol = ['solicitacoes', 'solicitacao', 'nova-solicitacao', 'editar-solicitacao'].includes(p[0]);
      a.classList.toggle('on', caminho === n || (n === 'vagas' && p[0] === 'vaga') || (n === 'solicitacoes' && ehSol)
        || (n === 'mais' && (ehSol || ['conta', 'admin', 'auditoria', 'mais'].includes(p[0]))));
    });
    window.scrollTo(0, 0);
    const r = {
      inicio: () => telaPainel(),
      vagas: () => telaLista(params),
      vaga: () => telaVaga(p[1]),
      nova: () => telaForm(null, params.get('dup')),
      editar: () => telaForm(p[1]),
      solicitacoes: () => telaListaSol(params),
      solicitacao: () => telaSol(p[1]),
      'nova-solicitacao': () => telaFormSol(null, params.get('tipo')),
      'editar-solicitacao': () => telaFormSol(p[1]),
      avisos: () => telaAvisos(),
      mais: () => telaMais(),
      conta: () => telaConta(),
      admin: () => (p[1] === 'usuarios' ? telaUsuarios() : p[1] === 'unidades' ? telaUnidades() : p[1] === 'documentos' ? telaDocumentos(params)
        : p[1] === 'config' ? telaConfig() : telaCadastros(params)),
      auditoria: () => telaAuditoria(params),
    }[p[0]];
    (r || telaPainel)();
  }

  const carregando = () => { view().innerHTML = `<div class="page"><div class="skeleton" style="height:28px;width:40%;margin-bottom:16px"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`; };
  const semAcesso = () => { view().innerHTML = `<div class="page"><div class="empty"><b>Acesso restrito</b>Você não tem permissão para esta área.</div></div>`; };

  // ------------------------------------------------------------------ dados de vagas
  const CAMPOS_LISTA = 'id,numero,status,cargo_nome,unidade_id,departamento_id,urgencia,confidencial,solicitante_id,solicitante_nome,quantidade,criado_em,enviado_em,aprovado_em,prazo_sla,concluido_em,atualizado_em,contratado_nome';
  async function buscarVagas() {
    const { data, error } = await sb.from('vagas').select(CAMPOS_LISTA).order('atualizado_em', { ascending: false }).limit(2000);
    if (error) { toast(erroAmigavel(error), true); return []; }
    return data || [];
  }

  function itemVaga(v) {
    const atr = atrasada(v);
    const ref = v.status === 'rascunho' ? v.criado_em : v.enviado_em || v.criado_em;
    return `<a class="vaga-item" href="#/vaga/${esc(v.id)}">
      <div class="top"><div><div class="num">${esc(v.numero)}${v.confidencial ? ' · 🔒 Confidencial' : ''}</div>
        <h3 style="margin-top:2px">${esc(v.cargo_nome)}${v.quantidade > 1 ? ` <small>(${v.quantidade})</small>` : ''}</h3></div>
        ${chipStatus(v.status)}</div>
      <div class="meta"><span>${esc(uniNome(v.unidade_id))}</span><span>${esc(depNome(v.departamento_id))}</span>
        <span>Solicitante: ${esc(v.solicitante_nome || '—')}</span>
        ${aberta(v) ? `<span>${diasEntre(ref)} dia(s) em aberto</span>` : ''}
        ${atr ? '<span class="overdue">Prazo vencido</span>' : ''}
        ${v.urgencia !== 'normal' ? `<span class="chip ${URG[v.urgencia].c}">${URG[v.urgencia].l}</span>` : ''}</div>
    </a>`;
  }

  // ------------------------------------------------------------------ painel
  async function telaPainel() {
    carregando();
    const [vs, ru, sols] = await Promise.all([buscarVagas(), isMaster() ? sb.rpc('uso_documentos') : Promise.resolve({}), buscarSols()]);
    const usoPct = ru && ru.data ? (Number(ru.data.total) / LIMITE_TOTAL) * 100 : 0;
    const me = S.me;
    const abertas = vs.filter(aberta);
    const aguard = vs.filter((v) => v.status === 'aguardando_aprovacao');
    const atrasadas = vs.filter(atrasada);
    const mesIni = hoje().slice(0, 7);
    const concluidasMes = vs.filter((v) => v.status === 'concluida' && (v.concluido_em || '').slice(0, 7) === mesIni);
    const concl = vs.filter((v) => v.status === 'concluida' && v.aprovado_em && v.concluido_em);
    const media = concl.length ? Math.round(concl.reduce((s, v) => s + diasEntre(v.aprovado_em, v.concluido_em), 0) / concl.length) : null;

    const paraMim = [];
    aguard.filter((v) => podeAprovarUni(v.unidade_id)).forEach((v) => paraMim.push(v));
    vs.filter((v) => v.solicitante_id === me.id && ['rascunho', 'devolvida'].includes(v.status)).forEach((v) => paraMim.push(v));
    const solMim = sols.filter((s) => (s.status === 'aguardando_aprovacao' && podeAprovarUni(s.unidade_id))
      || (['pendente_rh', 'em_andamento'].includes(s.status) && podeConduzir(s))
      || (s.status === 'devolvida' && s.solicitante_id === me.id));

    const porUni = {}; abertas.forEach((v) => { porUni[v.unidade_id] = (porUni[v.unidade_id] || 0) + 1; });
    const porSt = {}; abertas.forEach((v) => { porSt[v.status] = (porSt[v.status] || 0) + 1; });
    const barras = (obj, rot) => {
      const arr = Object.entries(obj).sort((a, b) => b[1] - a[1]);
      const max = Math.max(1, ...arr.map((x) => x[1]));
      return arr.length ? `<div class="bars">${arr.map(([k, n]) => `<div class="bar-row"><span class="lbl" title="${esc(rot(k))}">${esc(rot(k))}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(n / max) * 100}%"></div></div><span class="v">${n}</span></div>`).join('')}</div>`
        : '<p class="muted" style="margin:0">Nenhuma vaga em aberto.</p>';
    };
    const hora = new Date().getHours();
    const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

    view().innerHTML = `<div class="page">
      <div class="page-head"><div><h1>${saud}, ${esc(me.nome.split(' ')[0])}</h1><small>${esc(PERFIS[me.perfil])} · ${me.todas_unidades || isMaster() ? 'Todas as unidades' : esc(minhasUnidades().map((u) => u.nome).join(', ') || 'Sem unidade')}</small></div>
        ${me.pode_criar || isMaster() ? `<a class="btn primary" href="#/nova">${I.plus} Nova vaga</a>` : ''}</div>
      <div class="grid kpi">
        <a class="card kpi-card" href="#/vagas?f=abertas"><div class="l">Vagas em aberto</div><div class="n">${abertas.length}</div></a>
        <a class="card kpi-card" href="#/vagas?f=aguardando_aprovacao"><div class="l">Aguardando aprovação</div><div class="n">${aguard.length}</div></a>
        <a class="card kpi-card ${atrasadas.length ? 'alert' : ''}" href="#/vagas?f=atrasadas"><div class="l">Prazo vencido</div><div class="n">${atrasadas.length}</div></a>
        <a class="card kpi-card" href="#/vagas?f=concluida"><div class="l">Concluídas no mês</div><div class="n">${concluidasMes.length}</div></a>
      </div>
      ${usoPct >= 80 ? `<a class="card" href="#/admin/documentos" style="display:block;margin-top:12px;color:inherit;border-color:var(--warn)">
        <b>Armazenamento de documentos em ${Math.round(usoPct)}%</b><br><small class="muted">O plano gratuito tem 1 GB. Revise a retenção ou considere o plano pago.</small></a>` : ''}
      ${paraMim.length ? `<div class="card" style="margin-top:12px"><div class="section-title"><h2>Precisa da sua ação</h2><span class="chip warn">${paraMim.length}</span></div>
        ${paraMim.slice(0, 6).map(itemVaga).join('')}</div>` : ''}
      ${solMim.length ? `<div class="card" style="margin-top:12px"><div class="section-title"><h2>Outras solicitações pendentes</h2><a href="#/solicitacoes">Ver todas</a></div>
        ${solMim.slice(0, 6).map(itemSol).join('')}</div>` : ''}
      <div class="grid two" style="margin-top:12px">
        <div class="card"><h2 style="margin-bottom:12px">Em aberto por unidade</h2>${barras(porUni, uniNome)}</div>
        <div class="card"><h2 style="margin-bottom:12px">Em aberto por etapa</h2>${barras(porSt, (k) => ST[k]?.l || k)}</div>
      </div>
      <div class="card" style="margin-top:12px"><div class="section-title"><h2>Atualizadas recentemente</h2><a href="#/vagas">Ver todas</a></div>
        ${vs.length ? vs.slice(0, 5).map(itemVaga).join('') : '<div class="empty"><b>Nenhuma vaga ainda</b>As vagas abertas aparecerão aqui.</div>'}
        ${media !== null ? `<p class="muted" style="margin:12px 0 0">Tempo médio de fechamento (aprovação → contratação): <b>${media} dias</b></p>` : ''}
      </div></div>`;
  }

  // ------------------------------------------------------------------ lista
  async function telaLista(params) {
    carregando();
    const vs = await buscarVagas();
    const f = { q: '', u: '', f: params.get('f') || 'abertas', urg: '' };
    const unis = S.unidades.filter((u) => vs.some((v) => v.unidade_id === u.id));
    view().innerHTML = `<div class="page">
      <div class="page-head"><h1>Vagas</h1><div class="actions">
        ${S.me.pode_exportar || isMaster() ? `<button class="btn sm" data-csv>${I.down} Exportar</button>` : ''}
        ${S.me.pode_criar || isMaster() ? `<a class="btn sm primary" href="#/nova">${I.plus} Nova</a>` : ''}</div></div>
      <div class="filters">
        <input class="input" type="search" placeholder="Buscar nº, cargo ou solicitante" data-k="q" aria-label="Buscar">
        <select class="input" data-k="f" aria-label="Situação">
          <option value="abertas">Em aberto</option><option value="atrasadas">Prazo vencido</option><option value="todas">Todas</option>
          <optgroup label="Status">${Object.entries(ST).map(([k, s]) => `<option value="${k}">${esc(s.l)}</option>`).join('')}</optgroup>
        </select>
        <select class="input" data-k="u" aria-label="Unidade"><option value="">Todas as unidades</option>${unis.map((u) => `<option value="${u.id}">${esc(u.nome)}</option>`).join('')}</select>
        <select class="input" data-k="urg" aria-label="Urgência"><option value="">Qualquer urgência</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option></select>
      </div>
      <div id="lista"></div></div>`;
    $('[data-k=f]').value = f.f;
    const filtrar = () => {
      const q = f.q.toLowerCase();
      return vs.filter((v) =>
        (f.f === 'todas' || (f.f === 'abertas' && aberta(v)) || (f.f === 'atrasadas' && atrasada(v)) || v.status === f.f) &&
        (!f.u || v.unidade_id === f.u) && (!f.urg || v.urgencia === f.urg) &&
        (!q || [v.numero, v.cargo_nome, v.solicitante_nome, v.contratado_nome].join(' ').toLowerCase().includes(q)));
    };
    const pintar = () => {
      const r = filtrar();
      $('#lista').innerHTML = r.length ? `<small class="muted">${r.length} vaga(s)</small><div style="margin-top:8px">${r.map(itemVaga).join('')}</div>`
        : '<div class="empty"><b>Nenhuma vaga encontrada</b>Ajuste os filtros para ver outras vagas.</div>';
    };
    $$('[data-k]').forEach((el) => el.addEventListener('input', () => { f[el.dataset.k] = el.value; pintar(); }));
    on(view(), '[data-csv]', 'click', () => exportarCSV(filtrar()));
    pintar();
  }

  function exportarCSV(vs) {
    const cel = (x) => {
      let s = String(x ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita fórmulas maliciosas no Excel
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const cab = ['Número', 'Cargo', 'Qtd.', 'Unidade', 'Departamento', 'Status', 'Urgência', 'Solicitante', 'Criada em', 'Enviada em', 'Aprovada em', 'Prazo SLA', 'Concluída em', 'Contratado(s)', 'Prazo vencido'];
    const linhas = vs.map((v) => [v.numero, v.cargo_nome, v.quantidade, uniNome(v.unidade_id), depNome(v.departamento_id), ST[v.status]?.l, URG[v.urgencia]?.l,
      v.solicitante_nome, fmtData(v.criado_em), fmtData(v.enviado_em), fmtData(v.aprovado_em), fmtData(v.prazo_sla), fmtData(v.concluido_em), v.contratado_nome || '', atrasada(v) ? 'Sim' : 'Não']);
    const csv = '﻿' + [cab, ...linhas].map((l) => l.map(cel).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `vagas-${hoje()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Planilha exportada.');
  }

  // ------------------------------------------------------------------ documentos
  const CATS = {
    curriculo: { l: 'Currículo', c: 'info' },
    parecer_psicologico: { l: 'Parecer psicológico', c: 'bad', sens: true },
    admissao: { l: 'Admissão', c: 'ok' },
    descricao_cargo: { l: 'Descrição do cargo', c: 'violet' },
    outro: { l: 'Outro', c: '' },
  };
  const COM_CANDIDATO = ['curriculo', 'parecer_psicologico', 'admissao'];
  const TIPOS_OK = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const EXT_TIPO = { pdf: TIPOS_OK[0], jpg: TIPOS_OK[1], jpeg: TIPOS_OK[1], png: TIPOS_OK[2], webp: TIPOS_OK[3], doc: TIPOS_OK[4], docx: TIPOS_OK[5] };
  const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,' + TIPOS_OK.join(',');
  const LIMITE_ARQ = 5 * 1024 * 1024;
  const LIMITE_TOTAL = 1024 * 1024 * 1024; // 1 GB do plano gratuito
  const veSensiveis = () => isMaster() || !!S.me.ver_sensiveis;
  const podeAnexar = (v) => isMaster() || v.solicitante_id === S.me.id || ((S.me.pode_alterar_status || S.me.pode_aprovar) && temUnidade(v.unidade_id));
  const catsPermitidas = () => Object.keys(CATS).filter((k) => !CATS[k].sens || veSensiveis());
  const fmtTam = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.ceil((b || 0) / 1024)) + ' KB');
  const tipoArq = (f) => (TIPOS_OK.includes(f.type) ? f.type : EXT_TIPO[(f.name.split('.').pop() || '').toLowerCase()] || '');
  const mesesRetencao = () => Math.max(1, parseInt(S.config.retencao_meses, 10) || 6);

  // Valida e reduz fotos grandes (economiza espaço)
  async function prepararArquivo(f) {
    const tipo = tipoArq(f);
    if (!tipo) throw new Error(`"${f.name}": formato não aceito. Use PDF, Word ou imagem.`);
    if (tipo.startsWith('image/') && f.size > 700 * 1024 && window.createImageBitmap) {
      try {
        const bmp = await createImageBitmap(f);
        const fator = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(bmp.width * fator); cv.height = Math.round(bmp.height * fator);
        cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
        const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.78));
        if (blob && blob.size < f.size) return { arquivo: blob, nome: f.name.replace(/\.[^.]+$/, '') + '.jpg', tipo: 'image/jpeg' };
      } catch (_) { /* mantém o original */ }
    }
    return { arquivo: f, nome: f.name, tipo };
  }

  // Registra o documento e envia o arquivo (o banco só aceita arquivo registrado)
  async function enviarAnexos(vagaId, itens) {
    let ok = 0; const falhas = [];
    for (const it of itens) {
      try {
        const p = await prepararArquivo(it.file);
        if (p.arquivo.size > LIMITE_ARQ) throw new Error(`"${it.file.name}" tem ${fmtTam(p.arquivo.size)}; o limite é 5 MB.`);
        const ext = (p.nome.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
        const caminho = `${vagaId}/${crypto.randomUUID()}.${ext}`;
        const reg = {
          vaga_id: vagaId, caminho, nome: p.nome.slice(0, 150), tamanho: p.arquivo.size, categoria: it.categoria,
          candidato: (it.candidato || '').trim().slice(0, 120) || null, contratado: !!it.contratado,
        };
        if (it.admissao_id) { reg.admissao_id = it.admissao_id; reg.item_admissao = it.item_admissao || null; }
        const { data: row, error } = await sb.from('vaga_anexos').insert(reg).select('id').single();
        if (error) throw error;
        const { error: eUp } = await sb.storage.from('anexos').upload(caminho, p.arquivo, { contentType: p.tipo, upsert: false });
        if (eUp) { await sb.from('vaga_anexos').delete().eq('id', row.id); throw eUp; }
        ok++;
      } catch (e) { falhas.push(erroAmigavel(e)); }
    }
    if (falhas.length) toast(`${ok ? ok + ' enviado(s). ' : ''}Não enviado: ${falhas[0]}`, true);
    else if (ok) toast(ok === 1 ? 'Documento anexado.' : `${ok} documentos anexados.`);
    return ok;
  }

  // Bloco reutilizável: tipo de documento + candidato + escolha de arquivos
  function painelArquivos(padrao, { candidato = '', titulo = '' } = {}) {
    const id = 'pa' + Math.random().toString(36).slice(2, 9);
    let arquivos = [];
    const cats = catsPermitidas();
    const html = `<div class="file-panel" id="${id}">
      ${titulo ? `<div class="fp-title">${esc(titulo)}</div>` : ''}
      <div class="form-grid cols-2">
        <label class="f"><span>Tipo de documento</span><select class="input" data-fp-cat>${cats.map((k) => `<option value="${k}" ${k === padrao ? 'selected' : ''}>${esc(CATS[k].l)}${CATS[k].sens ? ' (restrito ao RH)' : ''}</option>`).join('')}</select></label>
        <label class="f" data-fp-candwrap><span>Nome do candidato</span><input class="input" data-fp-cand maxlength="120" value="${esc(candidato)}" placeholder="Ajuda a localizar e a aplicar a retenção"></label>
      </div>
      <label class="btn block fp-pick">${I.clip} Escolher arquivos<input type="file" multiple accept="${ACCEPT}" class="hidden" data-fp-file></label>
      <div data-fp-list></div>
      <div class="hint">PDF, Word ou imagem, até 5 MB cada. Fotos grandes são reduzidas automaticamente.</div></div>`;
    const ligar = (root) => {
      const el = $('#' + id, root);
      if (!el) return;
      const cat = $('[data-fp-cat]', el), wrap = $('[data-fp-candwrap]', el), lista = $('[data-fp-list]', el), inp = $('[data-fp-file]', el);
      const ajusta = () => wrap.classList.toggle('hidden', !COM_CANDIDATO.includes(cat.value));
      const pinta = () => {
        lista.innerHTML = arquivos.map((f, i) => `<div class="fp-item">${I.doc}<span class="fp-name">${esc(f.name)}</span><small>${fmtTam(f.size)}</small>
          <button type="button" class="btn sm ghost" data-rm="${i}" aria-label="Remover arquivo">✕</button></div>`).join('');
        on(lista, '[data-rm]', 'click', (e) => { arquivos.splice(+e.currentTarget.dataset.rm, 1); pinta(); });
      };
      cat.addEventListener('change', ajusta); ajusta();
      inp.addEventListener('change', () => { arquivos = arquivos.concat(Array.from(inp.files || [])); inp.value = ''; pinta(); });
      pinta();
    };
    const definirCategoria = (root, k) => { const el = $('#' + id, root); if (el && cats.includes(k)) { const s = $('[data-fp-cat]', el); s.value = k; s.dispatchEvent(new Event('change')); } };
    const itens = (root, extra = {}) => {
      const el = $('#' + id, root);
      if (!el) return [];
      const categoria = $('[data-fp-cat]', el).value;
      const cand = COM_CANDIDATO.includes(categoria) ? $('[data-fp-cand]', el).value : '';
      return arquivos.map((file) => ({ file, categoria, candidato: cand, ...extra }));
    };
    return { html, ligar, itens, definirCategoria, limpar: () => { arquivos = []; }, quantidade: () => arquivos.length };
  }

  function modalAnexar(v, padrao, depois) {
    const pa = painelArquivos(padrao || 'curriculo');
    const m = modal(`<h2>Anexar documentos</h2><p class="muted" style="margin-top:0">${esc(v.numero)} · ${esc(v.cargo_nome)}</p>
      <form id="f-anx" class="form-grid">${pa.html}
      <div class="actions"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary" type="submit">Enviar</button></div></form>`);
    pa.ligar(m.el);
    $('#f-anx', m.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const itens = pa.itens(m.el);
      if (!itens.length) return toast('Escolha ao menos um arquivo.', true);
      const solta = travar($('button[type=submit]', m.el), 'Enviando…');
      const n = await enviarAnexos(v.id, itens);
      solta();
      if (n) { m.fechar(); depois && depois(); }
    });
  }

  async function abrirAnexo(a) {
    const w = window.open('', '_blank'); // abre já no clique (evita bloqueio de pop-up)
    const { data, error } = await sb.storage.from('anexos').createSignedUrl(a.caminho, 120);
    if (error || !data) { if (w) w.close(); return toast(error ? erroAmigavel(error) : 'Arquivo indisponível.', true); }
    if (w) { w.opener = null; w.location.href = data.signedUrl; } else location.href = data.signedUrl;
  }

  async function excluirAnexo(a) {
    if (!(await confirmar('Excluir documento', `Remover "${a.nome}"? Esta ação não pode ser desfeita.`, 'Excluir', true))) return false;
    const { error: e1 } = await sb.storage.from('anexos').remove([a.caminho]);
    if (e1) { toast(erroAmigavel(e1), true); return false; }
    const { error } = await sb.from('vaga_anexos').delete().eq('id', a.id);
    if (error) { toast(erroAmigavel(error), true); return false; }
    toast('Documento excluído.');
    return true;
  }

  function htmlDocumentos(v, anexos) {
    const pode = podeAnexar(v);
    const grupos = Object.keys(CATS).map((k) => [k, anexos.filter((a) => (a.categoria || 'outro') === k)]).filter(([, l]) => l.length);
    const meses = mesesRetencao();
    return `<div class="card" id="card-docs"><div class="section-title"><h2>Documentos${anexos.length ? ` <small class="muted">(${anexos.length})</small>` : ''}</h2>
        ${pode ? `<button class="btn sm primary" data-anexar>${I.clip} Anexar</button>` : ''}</div>
      ${grupos.length ? grupos.map(([k, l]) => `<div class="doc-group"><div class="doc-group-t"><span class="chip ${CATS[k].c}">${esc(CATS[k].l)}</span>${CATS[k].sens ? '<small class="muted">Restrito ao RH</small>' : ''}</div>
        ${l.map((a) => `<div class="list-row doc-row"><span class="doc-ic">${I.doc}</span><div class="grow"><b class="doc-name">${esc(a.nome)}</b>
          <br><small>${a.item_admissao && ITEM_ADM_L[a.item_admissao] ? esc(ITEM_ADM_L[a.item_admissao]) + ' · ' : ''}${a.candidato ? esc(a.candidato) + ' · ' : ''}${fmtTam(a.tamanho)} · ${fmtData(a.criado_em)}${a.autor_nome ? ' · ' + esc(a.autor_nome) : ''}</small>
          ${a.contratado ? '<br><span class="chip ok plain" style="margin-top:4px">Contratado · não expira</span>' : ''}</div>
          <div class="doc-act"><button class="btn sm" data-abrir="${esc(a.id)}">Abrir</button>
          ${pode && COM_CANDIDATO.includes(k) ? `<button class="btn sm ghost" data-contr="${esc(a.id)}" title="${a.contratado ? 'Desmarcar' : 'Marcar como do contratado (não é excluído pela retenção)'}" aria-label="Marcar contratado">${a.contratado ? '★' : '☆'}</button>` : ''}
          ${a.autor_id === S.me.id || isMaster() ? `<button class="btn sm ghost danger" data-del-anexo="${esc(a.id)}" aria-label="Excluir">✕</button>` : ''}</div></div>`).join('')}</div>`).join('')
        : `<p class="muted" style="margin:0">Nenhum documento.${pode ? ' Anexe currículos, pareceres e documentos de admissão.' : ''}</p>`}
      <p class="hint" style="margin-top:12px">Currículos e pareceres de candidatos não contratados são excluídos ${meses} ${meses === 1 ? 'mês' : 'meses'} após o encerramento da vaga (LGPD). Use ☆ para manter os do contratado.</p></div>`;
  }

  function ligarDocumentos(el, v, anexos, recarregar) {
    const padrao = ['admissao', 'concluida'].includes(v.status) ? 'admissao' : ['em_divulgacao', 'aprovada', 'rascunho', 'aguardando_aprovacao', 'devolvida'].includes(v.status) ? 'descricao_cargo' : 'curriculo';
    on(el, '[data-anexar]', 'click', () => modalAnexar(v, padrao, recarregar));
    on(el, '[data-abrir]', 'click', (e) => abrirAnexo(anexos.find((x) => x.id === e.currentTarget.dataset.abrir)));
    on(el, '[data-del-anexo]', 'click', async (e) => { if (await excluirAnexo(anexos.find((x) => x.id === e.currentTarget.dataset.delAnexo))) recarregar(); });
    on(el, '[data-contr]', 'click', async (e) => {
      const a = anexos.find((x) => x.id === e.currentTarget.dataset.contr);
      const { error } = await sb.from('vaga_anexos').update({ contratado: !a.contratado }).eq('id', a.id);
      if (error) return toast(erroAmigavel(error), true);
      toast(a.contratado ? 'Marcação removida.' : 'Documento mantido como do contratado.');
      recarregar();
    });
  }

  // Exclui documentos vencidos (em lotes): primeiro o arquivo, depois o registro
  async function purgarVencidos(lista) {
    let n = 0;
    for (let i = 0; i < lista.length; i += 50) {
      const parte = lista.slice(i, i + 50);
      const { error } = await sb.storage.from('anexos').remove(parte.map((a) => a.caminho));
      if (error) break;
      const { error: e2 } = await sb.from('vaga_anexos').delete().in('id', parte.map((a) => a.id));
      if (e2) break;
      n += parte.length;
    }
    return n;
  }

  async function retencaoAutomatica() {
    if (!isMaster() || S.config.retencao_automatica === false) return;
    const chave = 'rh-gnl-retencao-' + S.me.id;
    try { if (localStorage.getItem(chave) === hoje()) return; } catch (_) { /* sem armazenamento */ }
    const { data, error } = await sb.rpc('anexos_vencidos');
    if (error) return;
    const n = data && data.length ? await purgarVencidos(data) : 0;
    try { localStorage.setItem(chave, hoje()); } catch (_) { /* sem armazenamento */ }
    if (n) toast(`${n} documento(s) com prazo de retenção vencido foram excluídos (LGPD).`);
  }

  // ------------------------------------------------------------------ admissão: checklist de documentos (REV.03)
  const arquivosItem = (anexos, adm, k) => anexos.filter((a) => a.admissao_id === adm.id && a.item_admissao === k);
  const itemRecebido = (anexos, adm, k) => (adm.itens || {})[k] === true || arquivosItem(anexos, adm, k).length > 0;
  const pendenciasAdm = (anexos, adm) => ITENS_ADM.filter(([k, , opc]) => !opc && !itemRecebido(anexos, adm, k)).map(([, l]) => l);

  async function invocarEmail(vagaId, reenviar = false) {
    const { data, error } = await sb.functions.invoke('avisos-email', { body: { acao: 'admissao_concluida', vaga_id: vagaId, reenviar } });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.erro || msg; } catch (_) { /* sem corpo */ }
      throw new Error(msg);
    }
    if (data?.erro) throw new Error(data.erro);
    return data;
  }

  function htmlAdmissoes(v, adms, anexos) {
    const pode = podeConduzir(v) && !['cancelada', 'reprovada'].includes(v.status);
    const obrig = ITENS_ADM.filter((x) => !x[2]).length;
    const bloco = (a) => {
      const pend = pendenciasAdm(anexos, a);
      const ok = obrig - pend.length;
      return `<div class="adm" data-adm="${esc(a.id)}">
        <div class="adm-head"><div class="grow"><b>${esc(a.candidato)}</b><br>
          <small class="muted">Admissão: ${fmtData(a.data_admissao)}${a.atualizado_por ? ` · atualizado por ${esc(a.atualizado_por)} em ${fmtDH(a.atualizado_em)}` : ''}</small></div>
          <span class="chip ${pend.length ? 'warn' : 'ok'}">${ok}/${obrig} obrigatórios</span>
          ${pode ? `<button class="btn sm ghost" data-adm-edit="${esc(a.id)}">Editar</button>` : ''}</div>
        <div class="adm-list">${ITENS_ADM.map(([k, l, opc]) => {
          const fs = arquivosItem(anexos, a, k), rec = itemRecebido(anexos, a, k);
          return `<div class="adm-row ${rec ? 'ok' : ''}">
            <label class="check adm-chk"><input type="checkbox" data-item="${k}" ${rec ? 'checked' : ''} ${!pode || fs.length ? 'disabled' : ''}>
              <span>${esc(l)}${opc ? ' <small class="muted">(opcional)</small>' : ''}</span></label>
            <div class="adm-files">${fs.map((f) => `<button class="btn sm ghost adm-file" data-abrir="${esc(f.id)}" title="${esc(f.nome)}">${I.doc}<span>${esc(f.nome)}</span></button>`).join('')}
              ${pode ? `<label class="btn sm ghost" title="Anexar ${esc(l)}" aria-label="Anexar ${esc(l)}">${I.clip}<input type="file" class="hidden" multiple accept="${ACCEPT}" data-up="${k}"></label>` : ''}</div></div>`;
        }).join('')}</div>
        <div class="adm-adiant"><span>Adiantamento</span>
          <div class="seg">${[['true', 'Sim'], ['false', 'Não']].map(([val, rot]) => `<label><input type="radio" name="adiant-${esc(a.id)}" value="${val}" data-adiant ${String(a.adiantamento) === val ? 'checked' : ''} ${pode ? '' : 'disabled'}><span>${rot}</span></label>`).join('')}</div></div>
      </div>`;
    };
    const email = v.status === 'concluida' && podeConduzir(v) ? `<div class="adm-mail">${I.mail}<div class="grow">
        <b>Aviso ao organograma</b><br><small class="muted">${v.email_organograma_em ? 'E-mail enviado em ' + fmtDH(v.email_organograma_em) : 'E-mail ainda não enviado'}</small></div>
        <button class="btn sm" data-email>${v.email_organograma_em ? 'Reenviar' : 'Enviar agora'}</button></div>` : '';
    return `<div class="card" id="card-adm"><div class="section-title"><h2>Admissão · documentos</h2>
        ${pode ? `<button class="btn sm primary" data-adm-novo>${I.plus} Admitido</button>` : ''}</div>
      ${adms.length ? adms.map(bloco).join('') : `<p class="muted" style="margin:0">Nenhum admitido registrado.${pode ? ' Adicione o candidato aprovado para controlar os documentos.' : ''}</p>`}
      ${email}</div>`;
  }

  function modalAdmitido(v, a, depois) {
    const m = modal(`<h2>${a ? 'Editar admitido' : 'Adicionar admitido'}</h2><p class="muted" style="margin-top:0">${esc(v.numero)} · ${esc(v.cargo_nome)}</p>
      <form id="f-adm" class="form-grid" novalidate>
        <label class="f"><span>Nome completo <em>*</em></span><input class="input" name="cand" maxlength="120" value="${esc(a?.candidato || '')}"></label>
        <label class="f"><span>Data de admissão</span><input class="input" type="date" name="data" value="${esc(a?.data_admissao || '')}"></label>
        <div class="actions">${a ? '<button type="button" class="btn ghost danger" data-del style="margin-right:auto">Excluir</button>' : ''}
          <button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`);
    const f = $('#f-adm', m.el);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = { candidato: f.cand.value.trim(), data_admissao: f.data.value || null };
      if (!dados.candidato) return toast('Informe o nome.', true);
      const solta = travar($('button[type=submit]', f), 'Salvando…');
      const { error } = a ? await sb.from('vaga_admissoes').update(dados).eq('id', a.id)
        : await sb.from('vaga_admissoes').insert({ ...dados, vaga_id: v.id });
      if (error) { solta(); return toast(erroAmigavel(error), true); }
      m.fechar(); toast('Admitido salvo.'); depois();
    });
    on(m.el, '[data-del]', 'click', async () => {
      if (!(await confirmar('Excluir admitido', `Remover o checklist de ${a.candidato}? Os documentos anexados continuam na vaga.`, 'Excluir', true))) return;
      const { error } = await sb.from('vaga_admissoes').delete().eq('id', a.id);
      if (error) return toast(erroAmigavel(error), true);
      m.fechar(); toast('Admitido removido.'); depois();
    });
  }

  function ligarAdmissoes(el, v, adms, anexos, recarregar) {
    if (!el) return;
    on(el, '[data-adm-novo]', 'click', () => modalAdmitido(v, null, recarregar));
    on(el, '[data-adm-edit]', 'click', (e) => modalAdmitido(v, adms.find((a) => a.id === e.currentTarget.dataset.admEdit), recarregar));
    on(el, '[data-abrir]', 'click', (e) => abrirAnexo(anexos.find((x) => x.id === e.currentTarget.dataset.abrir)));
    on(el, '[data-item]', 'change', async (e) => {
      const cb = e.currentTarget, a = adms.find((x) => x.id === cb.closest('[data-adm]').dataset.adm);
      const itens = { ...(a.itens || {}), [cb.dataset.item]: cb.checked };
      const { error } = await sb.from('vaga_admissoes').update({ itens }).eq('id', a.id);
      if (error) { cb.checked = !cb.checked; return toast(erroAmigavel(error), true); }
      a.itens = itens;
      const pend = pendenciasAdm(anexos, a), obrig = ITENS_ADM.filter((x) => !x[2]).length;
      const chip = $('.adm-head .chip', cb.closest('[data-adm]'));
      chip.textContent = `${obrig - pend.length}/${obrig} obrigatórios`;
      chip.className = 'chip ' + (pend.length ? 'warn' : 'ok');
      cb.closest('.adm-row').classList.toggle('ok', cb.checked);
    });
    on(el, '[data-adiant]', 'change', async (e) => {
      const r = e.currentTarget, a = adms.find((x) => x.id === r.closest('[data-adm]').dataset.adm);
      const { error } = await sb.from('vaga_admissoes').update({ adiantamento: r.value === 'true' }).eq('id', a.id);
      if (error) return toast(erroAmigavel(error), true);
      toast('Adiantamento registrado.');
    });
    on(el, '[data-up]', 'change', async (e) => {
      const inp = e.currentTarget, k = inp.dataset.up, a = adms.find((x) => x.id === inp.closest('[data-adm]').dataset.adm);
      const files = Array.from(inp.files || []);
      if (!files.length) return;
      toast('Enviando…');
      const n = await enviarAnexos(v.id, files.map((file) => ({ file, categoria: 'admissao', candidato: a.candidato, contratado: true, admissao_id: a.id, item_admissao: k })));
      if (n && (a.itens || {})[k] !== true) await sb.from('vaga_admissoes').update({ itens: { ...(a.itens || {}), [k]: true } }).eq('id', a.id);
      recarregar();
    });
    on(el, '[data-email]', 'click', async (e) => {
      const solta = travar(e.currentTarget, 'Enviando…');
      try { const r = await invocarEmail(v.id, true); toast(`E-mail enviado para ${r.enviados} destinatário(s).`); recarregar(); }
      catch (err) { solta(); toast(erroAmigavel(err), true); }
    });
  }

  // ------------------------------------------------------------------ detalhe
  async function telaVaga(id) {
    carregando();
    const [rv, rr, rh, rc, ra, rad] = await Promise.all([
      sb.from('vagas').select('*').eq('id', id).maybeSingle(),
      sb.from('vaga_remuneracao').select('*').eq('vaga_id', id).maybeSingle(),
      sb.from('vaga_historico').select('*').eq('vaga_id', id).order('criado_em', { ascending: false }),
      sb.from('vaga_comentarios').select('*').eq('vaga_id', id).order('criado_em'),
      sb.from('vaga_anexos').select('*').eq('vaga_id', id).order('criado_em'),
      sb.from('vaga_admissoes').select('*').eq('vaga_id', id).order('criado_em'),
    ]);
    const v = rv.data;
    if (!v) { view().innerHTML = `<div class="page"><div class="empty"><b>Vaga não encontrada</b>Ela não existe ou você não tem acesso a ela.</div></div>`; return; }
    const r = rr.data, hist = rh.data || [], coms = rc.data || [], anexos = ra.data || [], adms = rad.data || [];
    v._adms = adms; v._anexos = anexos;
    const mostraAdm = ['admissao', 'concluida'].includes(v.status) || adms.length > 0;
    const me = S.me, m = isMaster();
    const trans = transicoes(v);
    const podeEditar = ['rascunho', 'devolvida'].includes(v.status) && (v.solicitante_id === me.id || m);
    const podeComentar = m || me.pode_comentar;
    const verInternos = m || me.ver_internos;
    const atr = atrasada(v);
    const item = (rot, val, full) => `<div class="${full ? 'full' : ''}"><dt>${esc(rot)}</dt><dd>${val}</dd></div>`;
    const cargoInfo = S.cargos.find((c) => c.id === v.cargo_id);

    let motivoDet = '';
    if (v.motivo === 'aumento_quadro') motivoDet = item('Previsto no orçamento', simNao(v.previsto_orcamento)) + item('Justificativa', txt(v.justificativa), true);
    else if (v.motivo === 'substituicao') motivoDet = item('Colaborador substituído', txt(v.substituido_nome)) + item('Motivo do desligamento', txt(v.motivo_desligamento)) + item('Data de saída', fmtData(v.data_saida)) + (v.justificativa ? item('Observações', txt(v.justificativa), true) : '');
    else if (v.motivo === 'afastamento') motivoDet = item('Período', `${fmtData(v.afastamento_inicio)} a ${fmtData(v.afastamento_fim)}`) + item('Justificativa', txt(v.justificativa), true);
    else motivoDet = item('Justificativa', txt(v.justificativa), true);

    view().innerHTML = `<div class="page">
      <div class="page-head"><a class="btn ghost sm" href="#/vagas">${I.back} Vagas</a>
        <div class="actions">
          ${podeAnexar(v) ? `<button class="btn sm" data-anexar-topo>${I.clip} Anexar</button>` : ''}
          <button class="btn sm" data-print>${I.print} PDF</button>
          ${me.pode_criar || m ? `<a class="btn sm" href="#/nova?dup=${esc(v.id)}">${I.copy} Duplicar</a>` : ''}
        </div></div>

      <div class="card">
        <div class="num muted" style="font-size:12.5px;font-weight:600">${esc(v.numero)}${v.confidencial ? ' · 🔒 Confidencial' : ''}</div>
        <h1 style="margin:4px 0 10px">${esc(v.cargo_nome)}${v.quantidade > 1 ? ` <small>(${v.quantidade} vagas)</small>` : ''}</h1>
        <div class="actions" style="gap:6px">${chipStatus(v.status)}
          <span class="chip ${URG[v.urgencia].c}">Urgência ${URG[v.urgencia].l.toLowerCase()}</span>
          ${atr ? '<span class="chip bad">Prazo vencido</span>' : ''}</div>
        <dl class="dl" style="margin-top:14px">
          ${item('Unidade', esc(uniNome(v.unidade_id)))}${item('Departamento', esc(depNome(v.departamento_id)))}
          ${item('Solicitante', txt(v.solicitante_nome))}${item('Aberta em', fmtDH(v.criado_em))}
          ${v.status === 'aguardando_aprovacao' && uni(v.unidade_id)?.aprovador_nome ? item('Aprovação com', txt(uni(v.unidade_id).aprovador_nome)) : ''}
          ${v.aprovado_em ? item('Aprovada por', `${txt(v.aprovador_nome)} em ${fmtData(v.aprovado_em)}`) : ''}
          ${v.prazo_sla ? item('Prazo (SLA)', `<span class="${atr ? 'overdue' : ''}">${fmtData(v.prazo_sla)}</span> · ${v.sla_dias} dias`) : item('SLA do cargo', `${v.sla_dias || '—'} dias após aprovação`)}
          ${v.status === 'concluida' ? item('Contratado(s)', txt(v.contratado_nome)) + item('Data de admissão', fmtData(v.data_admissao)) : ''}
        </dl>
        ${(trans.length || podeEditar) ? `<div class="actions" style="margin-top:16px">
          ${podeEditar ? `<a class="btn" href="#/editar/${esc(v.id)}">Editar</a>` : ''}
          ${trans.includes('aguardando_aprovacao') ? `<button class="btn primary" data-st="aguardando_aprovacao">Enviar para aprovação</button>` : ''}
          ${trans.includes('aprovada') ? `<button class="btn primary" data-st="aprovada">Aprovar</button><button class="btn" data-st="devolvida">Devolver</button><button class="btn danger" data-st="reprovada">Reprovar</button>` : ''}
          ${trans.some((t) => ETAPAS_RH.includes(t)) ? `<button class="btn primary" data-st="rh">Atualizar status</button>` : ''}
          ${trans.includes('cancelada') ? `<button class="btn danger ghost" data-st="cancelada">Cancelar vaga</button>` : ''}
          ${v.status === 'rascunho' && v.solicitante_id === me.id ? `<button class="btn ghost danger" data-excluir>Excluir rascunho</button>` : ''}
        </div>` : ''}
      </div>

      <div class="grid two" style="margin-top:12px;align-items:start">
        <div>
          <div class="card"><h2 style="margin-bottom:12px">Cargo</h2><dl class="dl">
            ${item('Nível', txt(v.nivel))}${item('Contratação', txt(v.tipo_contratacao))}
            ${item('Jornada', txt(v.jornada))}${item('Trabalha aos sábados', simNao(v.trabalha_sabado))}
            ${item('Centro de custo', txt(v.centro_custo))}
            ${cargoInfo?.descricao ? item('Descrição do cargo', txt(cargoInfo.descricao), true) : ''}
            ${item('Principais atividades', txt(v.atividades), true)}</dl></div>
          <div class="card"><h2 style="margin-bottom:12px">Motivo</h2><dl class="dl">
            ${item('Motivo', txt(MOTIVOS[v.motivo]))}${motivoDet}</dl></div>
          ${r ? `<div class="card"><h2 style="margin-bottom:12px">Remuneração e benefícios</h2><dl class="dl">
            ${item('Faixa salarial', r.salario_min || r.salario_max ? `${money(r.salario_min)} a ${money(r.salario_max)}` : '—')}
            ${item('Variável / comissão', r.tem_variavel ? 'Sim' : 'Não')}
            ${r.tem_variavel ? item('Regra da variável', txt(r.regra_variavel), true) : ''}
            ${item('Benefícios', txt([...(r.beneficios || []), r.beneficios_outros].filter(Boolean).join(', ')), true)}</dl></div>` : ''}
          <div class="card"><h2 style="margin-bottom:12px">Perfil desejado</h2><dl class="dl">
            ${item('Escolaridade', txt(v.escolaridade))}${item('Experiência', v.experiencia_anos != null ? `${v.experiencia_anos} ano(s)${v.experiencia_segmento ? ' · ' + esc(v.experiencia_segmento) : ''}` : txt(v.experiencia_segmento))}
            ${item('CNH obrigatória', v.cnh_obrigatoria ? `Sim · categoria ${txt(v.cnh_categoria)}` : 'Não')}
            ${item('Cursos e certificações', txt(v.cursos), true)}${item('Conhecimentos técnicos', txt(v.conhecimentos), true)}
            ${item('Competências comportamentais', txt(v.competencias), true)}</dl></div>
          <div class="card"><h2 style="margin-bottom:12px">Processo seletivo</h2><dl class="dl">
            ${item('Início ideal', fmtData(v.data_inicio_ideal))}${item('Recrutamento interno primeiro', simNao(v.recrutamento_interno))}
            ${item('Entrevistadores', txt(v.entrevistadores), true)}${item('Indicações', txt(v.indicacoes), true)}
            ${item('Observações', txt(v.observacoes), true)}</dl></div>
        </div>
        <div>
          <div class="card"><h2 style="margin-bottom:14px">Linha do tempo</h2>
            <ul class="timeline">${hist.map((h) => `<li><div>${chipStatus(h.status_para)}</div>
              <div class="when">${fmtDH(h.criado_em)} · ${esc(h.autor_nome || '—')}</div>
              ${h.comentario ? `<div class="c">${esc(h.comentario)}</div>` : ''}</li>`).join('')}
              <li><div><span class="chip">Criada</span></div><div class="when">${fmtDH(v.criado_em)} · ${esc(v.solicitante_nome || '—')}</div></li></ul></div>
          <div class="card"><h2 style="margin-bottom:12px">Comentários</h2>
            ${coms.length ? coms.map((c) => `<div class="comment ${c.interno ? 'interno' : ''}"><div class="who">${esc(c.autor_nome || '—')} · ${fmtDH(c.criado_em)}${c.interno ? ' · Interno RH' : ''}</div><p>${esc(c.texto)}</p></div>`).join('') : '<p class="muted" style="margin:0 0 4px">Nenhum comentário.</p>'}
            ${podeComentar ? `<form id="f-com" class="form-grid" style="margin-top:12px">
              <textarea class="input" name="texto" maxlength="2000" placeholder="Escreva um comentário" required style="min-height:70px"></textarea>
              <div class="actions" style="justify-content:space-between;align-items:center">
                ${verInternos ? '<label class="check" style="padding:0"><input type="checkbox" name="interno"> Interno (só RH)</label>' : '<span></span>'}
                <button class="btn primary sm" type="submit">Comentar</button></div></form>` : ''}
          </div>
          ${mostraAdm ? htmlAdmissoes(v, adms, anexos) : ''}
          ${htmlDocumentos(v, anexos)}
        </div>
      </div></div>`;

    const el = view();
    on(el, '[data-st]', 'click', (e) => modalStatus(v, e.currentTarget.dataset.st, trans));
    on(el, '[data-print]', 'click', () => imprimir(v, r));
    on(el, '[data-excluir]', 'click', async () => {
      if (!(await confirmar('Excluir rascunho', 'Este rascunho será apagado definitivamente.', 'Excluir', true))) return;
      const { error } = await sb.from('vagas').delete().eq('id', v.id);
      if (error) return toast(erroAmigavel(error), true);
      toast('Rascunho excluído.'); location.hash = '#/vagas';
    });
    const fc = $('#f-com');
    if (fc) fc.addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = fc.texto.value.trim();
      if (!texto) return;
      const solta = travar($('button[type=submit]', fc));
      const { error } = await sb.from('vaga_comentarios').insert({ vaga_id: v.id, texto, interno: !!fc.interno?.checked });
      solta();
      if (error) return toast(erroAmigavel(error), true);
      telaVaga(v.id);
    });
    ligarDocumentos($('#card-docs', el), v, anexos, () => telaVaga(v.id));
    ligarAdmissoes($('#card-adm', el), v, adms, anexos, () => telaVaga(v.id));
    on(el, '[data-anexar-topo]', 'click', () => $('#card-docs [data-anexar]', el).click());
  }

  function modalStatus(v, alvo, trans) {
    let opcoes = alvo === 'rh' ? trans.filter((t) => ETAPAS_RH.includes(t)) : [alvo];
    const titulo = alvo === 'rh' ? 'Atualizar status' : ST[alvo].l;
    const CAT_ETAPA = { em_divulgacao: 'descricao_cargo', triagem: 'curriculo', entrevistas: 'curriculo',
      proposta_enviada: veSensiveis() ? 'parecer_psicologico' : 'curriculo', admissao: 'admissao', concluida: 'admissao' };
    const comAnexo = podeAnexar(v) && opcoes.some((o) => CAT_ETAPA[o]);
    const pa = comAnexo ? painelArquivos(CAT_ETAPA[opcoes[0]] || 'curriculo', { titulo: 'Anexar documentos (opcional)' }) : null;
    const m = modal(`<h2>${esc(titulo)}</h2><form id="f-st" class="form-grid" novalidate>
      ${opcoes.length > 1 ? `<div class="f"><span style="display:block;font-size:13px;font-weight:600;margin-bottom:8px">Novo status</span>
        <div class="seg">${opcoes.map((o, i) => `<label><input type="radio" name="st" value="${o}" ${i === 0 ? 'checked' : ''}><span>${esc(ST[o].l)}</span></label>`).join('')}</div></div>`
        : `<input type="hidden" name="st" value="${opcoes[0]}"><div>${chipStatus(v.status)} → ${chipStatus(opcoes[0])}</div>`}
      <div id="st-admi" class="form-grid hidden">
        <label class="f"><span>Candidato aprovado</span><input class="input" name="cand_adm" maxlength="120" placeholder="Nome completo — abre o checklist de documentos">
        <div class="hint">Se houver mais de um admitido, adicione os demais pelo quadro “Admissão · documentos”.</div></label></div>
      <div id="st-conc" class="form-grid hidden">
        <label class="f"><span>Contratado(s) <em>*</em></span><input class="input" name="contratado" maxlength="300" placeholder="Nome completo" value="${esc((v._adms || []).map((a) => a.candidato).join(', '))}"></label>
        <label class="f"><span>Data de admissão</span><input class="input" type="date" name="adm" value="${esc((v._adms || []).find((a) => a.data_admissao)?.data_admissao || '')}"></label>
        <div class="hint">Ao concluir, o aviso de admissão é enviado por e-mail para atualização do organograma.</div></div>
      <label class="f"><span id="st-lbl">Comentário</span><textarea class="input" name="com" maxlength="2000" placeholder="Visível para o solicitante e gestores autorizados"></textarea></label>
      ${pa ? `<div id="st-anx">${pa.html}</div>` : ''}
      <div class="actions"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn primary" type="submit">Confirmar</button></div></form>`, { wide: !!pa });
    const f = $('#f-st', m.el);
    if (pa) pa.ligar(m.el);
    const sel = () => (f.querySelector('input[name=st]:checked') || f.querySelector('input[name=st]')).value;
    const ajustar = () => {
      const s = sel();
      $('#st-conc', m.el).classList.toggle('hidden', s !== 'concluida');
      $('#st-admi', m.el).classList.toggle('hidden', s !== 'admissao');
      $('#st-lbl', m.el).innerHTML = PEDE_MOTIVO.includes(s) ? 'Motivo <em>*</em>' : 'Comentário';
      if (pa) { $('#st-anx', m.el).classList.toggle('hidden', !CAT_ETAPA[s]); if (CAT_ETAPA[s]) pa.definirCategoria(m.el, CAT_ETAPA[s]); }
    };
    on(f, 'input[name=st]', 'change', ajustar); ajustar();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const s = sel(), com = f.com.value.trim();
      if (PEDE_MOTIVO.includes(s) && !com) return toast('Informe o motivo.', true);
      if (s === 'concluida' && !f.contratado.value.trim()) return toast('Informe o nome do(s) contratado(s).', true);
      if (s === 'concluida') {
        const pend = (v._adms || []).map((a) => [a.candidato, pendenciasAdm(v._anexos || [], a)]).filter(([, p]) => p.length);
        if (pend.length && !(await confirmar('Documentos pendentes', `Ainda faltam documentos obrigatórios: ${pend.map(([n, p]) => `${n} — ${p.join(', ')}`).join('; ')}. Concluir mesmo assim?`, 'Concluir mesmo assim'))) return;
      }
      const solta = travar($('button[type=submit]', f), 'Salvando…');
      const { error } = await sb.rpc('mudar_status', { p_vaga: v.id, p_status: s, p_comentario: com || null,
        p_contratado: s === 'concluida' ? f.contratado.value.trim() : null, p_data_admissao: s === 'concluida' && f.adm.value ? f.adm.value : null });
      if (error) { solta(); return toast(erroAmigavel(error), true); }
      const cand = s === 'admissao' ? f.cand_adm.value.trim() : '';
      if (cand && !(v._adms || []).some((a) => a.candidato.toLowerCase() === cand.toLowerCase())) {
        const { error: ea } = await sb.from('vaga_admissoes').insert({ vaga_id: v.id, candidato: cand });
        if (ea) toast('Status atualizado, mas o checklist não foi criado: ' + erroAmigavel(ea), true);
      }
      let itens = pa && CAT_ETAPA[s] ? pa.itens(m.el) : [];
      if (s === 'concluida') itens = itens.map((it) => ({ ...it, candidato: it.candidato || f.contratado.value.trim(), contratado: COM_CANDIDATO.includes(it.categoria) }));
      if (itens.length) await enviarAnexos(v.id, itens); else toast('Status atualizado.');
      if (s === 'concluida') {
        try { const r = await invocarEmail(v.id); if (r?.enviados) toast(`Vaga concluída. Aviso de admissão enviado para ${r.enviados} e-mail(s).`); }
        catch (err) { toast('Vaga concluída, mas o e-mail do organograma não foi enviado: ' + erroAmigavel(err), true); }
      }
      solta(); m.fechar(); telaVaga(v.id);
    });
  }

  function imprimir(v, r) {
    const l = (a, b) => `<tr><td>${esc(a)}</td><td>${b}</td></tr>`;
    $('#print-area').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h1>Requisição de Pessoal</h1><div>RH Grupo Nogueira Lins</div></div>
      <div style="text-align:right"><b>${esc(v.numero)}</b><br>${esc(ST[v.status].l)}<br>Emitido em ${fmtDH(new Date().toISOString())}</div></div>
      <h2>Identificação</h2><table>${l('Unidade', esc(uniNome(v.unidade_id)))}${l('Departamento', esc(depNome(v.departamento_id)))}${l('Centro de custo', txt(v.centro_custo))}${l('Solicitante', txt(v.solicitante_nome))}${l('Data da solicitação', fmtData(v.criado_em))}${v.confidencial ? l('Confidencial', 'Sim') : ''}</table>
      <h2>Cargo</h2><table>${l('Cargo', esc(v.cargo_nome))}${l('Quantidade', v.quantidade)}${l('Nível', txt(v.nivel))}${l('Contratação', txt(v.tipo_contratacao))}${l('Jornada', txt(v.jornada))}${l('Sábados', simNao(v.trabalha_sabado))}${l('Atividades', txt(v.atividades))}</table>
      <h2>Motivo</h2><table>${l('Motivo', txt(MOTIVOS[v.motivo]))}${v.substituido_nome ? l('Substituído', txt(v.substituido_nome)) + l('Motivo do desligamento', txt(v.motivo_desligamento)) + l('Data de saída', fmtData(v.data_saida)) : ''}${v.previsto_orcamento != null ? l('Previsto no orçamento', simNao(v.previsto_orcamento)) : ''}${l('Justificativa', txt(v.justificativa))}</table>
      ${r ? `<h2>Remuneração</h2><table>${l('Faixa salarial', `${money(r.salario_min)} a ${money(r.salario_max)}`)}${l('Variável', r.tem_variavel ? 'Sim — ' + txt(r.regra_variavel) : 'Não')}${l('Benefícios', txt([...(r.beneficios || []), r.beneficios_outros].filter(Boolean).join(', ')))}</table>` : ''}
      <h2>Perfil</h2><table>${l('Escolaridade', txt(v.escolaridade))}${l('Experiência', `${v.experiencia_anos ?? '—'} ano(s) ${v.experiencia_segmento ? '· ' + esc(v.experiencia_segmento) : ''}`)}${l('CNH', v.cnh_obrigatoria ? 'Obrigatória · ' + txt(v.cnh_categoria) : 'Não obrigatória')}${l('Cursos', txt(v.cursos))}${l('Conhecimentos', txt(v.conhecimentos))}${l('Competências', txt(v.competencias))}</table>
      <h2>Processo</h2><table>${l('Início ideal', fmtData(v.data_inicio_ideal))}${l('Urgência', URG[v.urgencia].l)}${l('Recrutamento interno', simNao(v.recrutamento_interno))}${l('Entrevistadores', txt(v.entrevistadores))}${l('Observações', txt(v.observacoes))}</table>
      ${v.aprovado_em ? `<h2>Aprovação</h2><table>${l('Aprovado por', txt(v.aprovador_nome))}${l('Data', fmtDH(v.aprovado_em))}${l('Prazo (SLA)', fmtData(v.prazo_sla))}</table>` : ''}
      <div class="sign"><div>Solicitante</div><div>Aprovação</div><div>Recursos Humanos</div></div>`;
    window.print();
  }

  // ------------------------------------------------------------------ formulário (wizard)
  const ESCOLARIDADE = ['Ensino fundamental', 'Ensino médio', 'Curso técnico', 'Superior em andamento', 'Superior completo', 'Pós-graduação'];
  const DESLIG = ['Pedido de demissão', 'Dispensa', 'Término de contrato', 'Transferência', 'Promoção', 'Outro'];
  const SEGMENTOS = ['Motocicletas', 'Automotivo', 'Varejo', 'Indiferente'];
  const CAMPOS_VAGA = ['unidade_id', 'departamento_id', 'centro_custo', 'cargo_id', 'cargo_nome', 'nivel', 'quantidade', 'tipo_contratacao', 'jornada', 'trabalha_sabado',
    'motivo', 'justificativa', 'previsto_orcamento', 'substituido_nome', 'motivo_desligamento', 'data_saida', 'afastamento_inicio', 'afastamento_fim', 'confidencial',
    'escolaridade', 'cursos', 'cnh_obrigatoria', 'cnh_categoria', 'experiencia_anos', 'experiencia_segmento', 'conhecimentos', 'competencias', 'atividades',
    'data_inicio_ideal', 'urgencia', 'recrutamento_interno', 'indicacoes', 'entrevistadores', 'observacoes'];
  const CAMPOS_REM = ['salario_min', 'salario_max', 'tem_variavel', 'regra_variavel', 'beneficios', 'beneficios_outros'];

  async function telaForm(id, dupId) {
    const me = S.me;
    if (!(me.pode_criar || isMaster()) && !id) return semAcesso();
    carregando();
    let f = { quantidade: 1, urgencia: 'normal', trabalha_sabado: false, confidencial: false, cnh_obrigatoria: false, recrutamento_interno: false, motivo: 'substituicao', tipo_contratacao: 'CLT' };
    let r = { beneficios: [], tem_variavel: false };
    const fonte = id || dupId;
    if (fonte) {
      const [rv, rr] = await Promise.all([sb.from('vagas').select('*').eq('id', fonte).maybeSingle(), sb.from('vaga_remuneracao').select('*').eq('vaga_id', fonte).maybeSingle()]);
      if (!rv.data) return semAcesso();
      if (id && !(['rascunho', 'devolvida'].includes(rv.data.status) && (rv.data.solicitante_id === me.id || isMaster()))) {
        view().innerHTML = `<div class="page"><div class="empty"><b>Edição indisponível</b>Só é possível editar rascunhos ou vagas devolvidas para ajuste.</div></div>`; return;
      }
      CAMPOS_VAGA.forEach((k) => { f[k] = rv.data[k]; });
      if (rr.data) CAMPOS_REM.forEach((k) => { r[k] = rr.data[k]; });
      r.beneficios = r.beneficios || [];
      if (dupId) { ['substituido_nome', 'data_saida', 'motivo_desligamento'].forEach((k) => { f[k] = null; }); }
    }
    const unis = minhasUnidades();
    if (!f.unidade_id && unis.length === 1) f.unidade_id = unis[0].id;
    const vagaOrig = id ? (await sb.from('vagas').select('status,numero').eq('id', id).maybeSingle()).data : null;
    let passo = 0;
    const pend = []; // documentos escolhidos no formulário, enviados ao salvar
    const paForm = painelArquivos('descricao_cargo');
    const htmlPend = () => (pend.length ? `<div class="fp-queue"><b>${pend.length} documento(s) para enviar ao salvar</b>
      ${pend.map((it, i) => `<div class="fp-item">${I.doc}<span class="fp-name">${esc(it.file.name)}</span><span class="chip ${CATS[it.categoria].c}">${esc(CATS[it.categoria].l)}</span>
        <button type="button" class="btn sm ghost" data-pend-rm="${i}" aria-label="Remover">✕</button></div>`).join('')}</div>` : '');

    const opt = (lista, val, vazio = 'Selecione') => `<option value="">${esc(vazio)}</option>` + lista.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(val ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('');
    const seg = (nome, lista, val) => `<div class="seg">${lista.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<label><input type="radio" name="${nome}" value="${esc(v)}" ${String(val ?? '') === String(v) ? 'checked' : ''}><span>${esc(l)}</span></label>`;
    }).join('')}</div>`;
    const campo = (rot, html, obrig, extra = '') => `<label class="f ${extra}"><span>${esc(rot)}${obrig ? ' <em>*</em>' : ''}</span>${html}</label>`;
    const grupo = (rot, html, obrig, extra = '') => `<div class="f ${extra}"><span style="display:block;font-size:13px;font-weight:600;margin-bottom:8px">${esc(rot)}${obrig ? ' <em>*</em>' : ''}</span>${html}</div>`;
    const inp = (k, tipo = 'text', o = {}) => `<input class="input" name="${k}" type="${tipo}" value="${esc(o.v ?? f[k] ?? '')}" ${o.max ? `maxlength="${o.max}"` : ''} ${o.min !== undefined ? `min="${o.min}"` : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.step ? `step="${o.step}"` : ''} ${tipo === 'number' ? 'inputmode="decimal"' : ''}>`;
    const area = (k, o = {}) => `<textarea class="input" name="${k}" maxlength="${o.max || 2000}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''}>${esc(o.v ?? f[k] ?? '')}</textarea>`;
    const chk = (k, rot, val) => `<label class="check"><input type="checkbox" name="${k}" ${val ? 'checked' : ''}> ${esc(rot)}</label>`;

    const PASSOS = [
      { t: 'Identificação', h: () => `<div class="form-grid cols-2">
          ${campo('Concessionária / unidade', `<select class="input" name="unidade_id">${opt(unis.map((u) => [u.id, u.nome]), f.unidade_id)}</select>`, true, 'span-2')}
          ${campo('Departamento', `<select class="input" name="departamento_id">${opt(S.departamentos.filter((d) => d.ativo).map((d) => [d.id, d.nome]), f.departamento_id)}</select>`, true)}
          ${campo('Centro de custo', inp('centro_custo', 'text', { max: 60, ph: 'Opcional' }))}</div>`,
        ok: () => (!f.unidade_id ? 'Selecione a unidade.' : !f.departamento_id ? 'Selecione o departamento.' : null) },
      { t: 'Cargo', h: () => {
          const cargos = S.cargos.filter((c) => c.ativo && (!f.departamento_id || c.departamento_id === f.departamento_id || c.id === f.cargo_id));
          return `<div class="form-grid cols-2">
          ${campo('Cargo', `<select class="input" name="cargo_id">${opt(cargos.map((c) => [c.id, c.nome]), f.cargo_id)}<option value="__outro" ${!f.cargo_id && f.cargo_nome ? 'selected' : ''}>Outro (digitar)</option></select>`, true)}
          <div class="${!f.cargo_id && f.cargo_nome ? '' : 'hidden'}" id="cargo-outro">${campo('Nome do cargo', inp('cargo_nome', 'text', { max: 120 }), true)}</div>
          ${grupo('Nível', seg('nivel', ['Júnior', 'Pleno', 'Sênior', 'Não se aplica'], f.nivel), false, 'span-2')}
          ${campo('Quantidade de vagas', inp('quantidade', 'number', { min: 1 }), true)}
          ${grupo('Tipo de contratação', seg('tipo_contratacao', ['CLT', 'Estágio', 'Aprendiz', 'Temporário'], f.tipo_contratacao), true, 'span-2')}
          ${campo('Jornada / horário', inp('jornada', 'text', { max: 150, ph: 'Ex.: seg a sex 8h–18h, sáb 8h–12h' }), false, 'span-2')}
          <div class="span-2">${chk('trabalha_sabado', 'Trabalha aos sábados', f.trabalha_sabado)}</div>
          ${campo('Principais atividades', area('atividades', { max: 4000, ph: 'Preenchido a partir do cargo; ajuste se precisar' }), false, 'span-2')}</div>`;
        },
        depois: (el) => {
          const s = $('select[name=cargo_id]', el);
          s.addEventListener('change', () => {
            $('#cargo-outro', el).classList.toggle('hidden', s.value !== '__outro');
            const c = S.cargos.find((x) => x.id === s.value);
            const at = $('textarea[name=atividades]', el);
            if (c && c.atividades && !at.value.trim()) at.value = c.atividades;
          });
        },
        ok: () => (!f.cargo_nome ? 'Informe o cargo.' : !(f.quantidade >= 1) ? 'Informe a quantidade.' : !f.tipo_contratacao ? 'Selecione o tipo de contratação.' : null) },
      { t: 'Motivo da vaga', h: () => `<div class="form-grid cols-2">
          ${grupo('Motivo', seg('motivo', Object.entries(MOTIVOS), f.motivo), true, 'span-2')}
          ${f.motivo === 'substituicao' ? `
            ${campo('Colaborador substituído', inp('substituido_nome', 'text', { max: 120 }), true)}
            ${campo('Motivo do desligamento', `<select class="input" name="motivo_desligamento">${opt(DESLIG, f.motivo_desligamento)}</select>`, true)}
            ${campo('Data de saída', inp('data_saida', 'date'))}
            ${campo('Observações', area('justificativa', { ph: 'Opcional' }), false, 'span-2')}` : ''}
          ${f.motivo === 'aumento_quadro' ? `
            ${grupo('Está previsto no orçamento?', seg('previsto_orcamento', [['true', 'Sim'], ['false', 'Não']], f.previsto_orcamento === null || f.previsto_orcamento === undefined ? '' : String(f.previsto_orcamento)), true, 'span-2')}
            ${campo('Justificativa', area('justificativa', { ph: 'Por que a equipe precisa crescer? (volume, nova operação, metas...)' }), true, 'span-2')}` : ''}
          ${f.motivo === 'afastamento' ? `
            ${campo('Início do afastamento', inp('afastamento_inicio', 'date'), true)}${campo('Fim previsto', inp('afastamento_fim', 'date'))}
            ${campo('Justificativa', area('justificativa'), true, 'span-2')}` : ''}
          ${f.motivo === 'nova_unidade' ? campo('Justificativa', area('justificativa', { ph: 'Qual expansão ou nova operação?' }), true, 'span-2') : ''}
          <div class="span-2">${chk('confidencial', 'Vaga confidencial', f.confidencial)}<div class="hint">Use quando a substituição ainda não foi comunicada. Só quem tem permissão específica verá a vaga.</div></div></div>`,
        depois: (el) => on(el, 'input[name=motivo]', 'change', () => { coletar(); desenhar(); }),
        ok: () => {
          if (!f.motivo) return 'Selecione o motivo.';
          if (f.motivo === 'substituicao' && (!f.substituido_nome || !f.motivo_desligamento)) return 'Informe quem será substituído e o motivo do desligamento.';
          if (f.motivo === 'aumento_quadro' && (f.previsto_orcamento === null || f.previsto_orcamento === undefined || !f.justificativa)) return 'Informe se está no orçamento e a justificativa.';
          if (f.motivo === 'afastamento' && (!f.afastamento_inicio || !f.justificativa)) return 'Informe o início do afastamento e a justificativa.';
          if (f.motivo === 'nova_unidade' && !f.justificativa) return 'Informe a justificativa.';
          return null;
        } },
      { t: 'Remuneração e benefícios', h: () => `<div class="form-grid cols-2">
          ${campo('Salário de (R$)', `<input class="input" name="r_salario_min" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(r.salario_min ?? '')}">`)}
          ${campo('Salário até (R$)', `<input class="input" name="r_salario_max" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(r.salario_max ?? '')}">`)}
          <div class="span-2">${chk('r_tem_variavel', 'Possui variável / comissão', r.tem_variavel)}</div>
          <div class="span-2 ${r.tem_variavel ? '' : 'hidden'}" id="var-regra">${campo('Regra da variável', `<textarea class="input" name="r_regra_variavel" maxlength="1000" placeholder="Ex.: % sobre vendas, prêmio por meta, comissão de serviços">${esc(r.regra_variavel ?? '')}</textarea>`)}</div>
          ${grupo('Benefícios', `<div class="perm-grid">${S.beneficios.filter((b) => b.ativo || r.beneficios.includes(b.nome)).map((b) => `<label class="check"><input type="checkbox" name="r_ben" value="${esc(b.nome)}" ${r.beneficios.includes(b.nome) ? 'checked' : ''}> ${esc(b.nome)}</label>`).join('')}</div>`, false, 'span-2')}
          ${campo('Outros benefícios', `<input class="input" name="r_beneficios_outros" maxlength="500" value="${esc(r.beneficios_outros ?? '')}">`, false, 'span-2')}</div>`,
        depois: (el) => $('input[name=r_tem_variavel]', el).addEventListener('change', (e) => $('#var-regra', el).classList.toggle('hidden', !e.target.checked)),
        ok: () => (r.salario_min && r.salario_max && Number(r.salario_min) > Number(r.salario_max) ? 'O salário inicial não pode ser maior que o final.' : null) },
      { t: 'Perfil desejado', h: () => `<div class="form-grid cols-2">
          ${campo('Escolaridade mínima', `<select class="input" name="escolaridade">${opt(ESCOLARIDADE, f.escolaridade)}</select>`)}
          ${campo('Experiência mínima (anos)', inp('experiencia_anos', 'number', { min: 0, step: '0.5' }))}
          ${campo('Segmento da experiência', `<select class="input" name="experiencia_segmento">${opt(SEGMENTOS, f.experiencia_segmento)}</select>`)}
          <div>${chk('cnh_obrigatoria', 'CNH obrigatória', f.cnh_obrigatoria)}</div>
          <div class="span-2 ${f.cnh_obrigatoria ? '' : 'hidden'}" id="cnh-cat">${grupo('Categoria da CNH', seg('cnh_categoria', ['A', 'B', 'AB', 'C', 'D', 'E'], f.cnh_categoria))}<div class="hint">Categoria A é necessária para test-ride e movimentação de motos.</div></div>
          ${campo('Cursos e certificações', area('cursos', { max: 1000, ph: 'Ex.: técnico em mecânica, treinamentos de fábrica' }), false, 'span-2')}
          ${campo('Conhecimentos técnicos', area('conhecimentos', { ph: 'Ex.: sistema DMS, Excel, diagnóstico eletrônico' }), false, 'span-2')}
          ${campo('Competências comportamentais', area('competencias', { ph: 'Ex.: foco no cliente, organização, trabalho em equipe' }), false, 'span-2')}</div>`,
        depois: (el) => $('input[name=cnh_obrigatoria]', el).addEventListener('change', (e) => $('#cnh-cat', el).classList.toggle('hidden', !e.target.checked)),
        ok: () => (f.cnh_obrigatoria && !f.cnh_categoria ? 'Selecione a categoria da CNH.' : null) },
      { t: 'Processo seletivo', h: () => `<div class="form-grid cols-2">
          ${campo('Data ideal de início', inp('data_inicio_ideal', 'date'))}
          ${grupo('Urgência', seg('urgencia', [['normal', 'Normal'], ['alta', 'Alta'], ['critica', 'Crítica']], f.urgencia), true)}
          <div class="span-2">${chk('recrutamento_interno', 'Divulgar internamente antes (recrutamento interno)', f.recrutamento_interno)}</div>
          ${campo('Quem participa das entrevistas', inp('entrevistadores', 'text', { max: 500 }), false, 'span-2')}
          ${campo('Indicações de candidatos', area('indicacoes', { max: 1000, ph: 'Nome e contato, se houver' }), false, 'span-2')}
          ${campo('Observações para o RH', area('observacoes'), false, 'span-2')}
          <div class="span-2"><div class="doc-sec-t">${I.clip} Documentos (opcional)</div>
            <p class="hint" style="margin:0 0 10px">Descrição do cargo, currículos de candidatos indicados ou outros arquivos. Serão enviados ao salvar a vaga.</p>
            <div id="pend-lista">${htmlPend()}</div>${paForm.html}
            <button type="button" class="btn sm" data-pend-add style="margin-top:8px">${I.plus} Adicionar à lista</button></div></div>`,
        depois: (el) => {
          paForm.ligar(el);
          const repinta = () => { $('#pend-lista', el).innerHTML = htmlPend(); on($('#pend-lista', el), '[data-pend-rm]', 'click', (e) => { pend.splice(+e.currentTarget.dataset.pendRm, 1); repinta(); }); };
          on(el, '[data-pend-add]', 'click', () => {
            const novos = paForm.itens(el);
            if (!novos.length) return toast('Escolha os arquivos primeiro.', true);
            pend.push(...novos); paForm.limpar(); coletar(); desenhar();
          });
          repinta();
        },
        ok: () => (!f.urgencia ? 'Selecione a urgência.' : null) },
      { t: 'Revisão', h: () => {
          const li = (a, b) => `<div><dt>${esc(a)}</dt><dd>${b}</dd></div>`;
          return `<dl class="dl">
            ${li('Unidade', esc(uniNome(f.unidade_id)))}${li('Departamento', esc(depNome(f.departamento_id)))}
            ${li('Cargo', `${esc(f.cargo_nome)} · ${f.quantidade} vaga(s)`)}${li('Contratação', `${txt(f.tipo_contratacao)} · ${txt(f.nivel)}`)}
            ${li('Motivo', txt(MOTIVOS[f.motivo]))}${li('Urgência', URG[f.urgencia]?.l || '—')}
            ${li('Faixa salarial', r.salario_min || r.salario_max ? `${money(r.salario_min)} a ${money(r.salario_max)}` : '—')}
            ${li('Confidencial', simNao(f.confidencial))}
            ${li('CNH', f.cnh_obrigatoria ? 'Obrigatória · ' + txt(f.cnh_categoria) : 'Não obrigatória')}${li('Início ideal', fmtData(f.data_inicio_ideal))}
            ${li('Documentos', pend.length ? pend.map((it) => esc(it.file.name)).join('<br>') : '—')}
          </dl><p class="muted" style="margin:16px 0 0">Ao enviar, a vaga segue para aprovação. Você pode salvar como rascunho e enviar depois.</p>`;
        }, ok: () => null },
    ];

    function coletar() {
      const el = view();
      // arquivos escolhidos mas não adicionados à lista entram automaticamente
      if ($('#pend-lista', el) && paForm.quantidade()) { pend.push(...paForm.itens(el)); paForm.limpar(); }
      $$('[name]', el).forEach((n) => {
        const k = n.name;
        if (k === 'r_ben') return;
        if (k.startsWith('r_')) {
          const kk = k.slice(2);
          r[kk] = n.type === 'checkbox' ? n.checked : n.value === '' ? null : n.value;
          return;
        }
        if (n.type === 'radio') { if (n.checked) f[k] = k === 'previsto_orcamento' ? n.value === 'true' : n.value; return; }
        if (n.type === 'checkbox') { f[k] = n.checked; return; }
        if (k === 'cargo_id') {
          if (n.value === '__outro') { if (f.cargo_id) f.cargo_nome = ''; f.cargo_id = null; }
          else { f.cargo_id = n.value || null; const c = S.cargos.find((x) => x.id === n.value); if (c) f.cargo_nome = c.nome; }
          return;
        }
        if (k === 'cargo_nome' && f.cargo_id) return;
        f[k] = n.type === 'number' ? (n.value === '' ? null : Number(n.value)) : n.value.trim() === '' ? null : n.value.trim();
      });
      const bens = $$('input[name=r_ben]', el);
      if (bens.length) r.beneficios = bens.filter((b) => b.checked).map((b) => b.value);
    }

    function desenhar() {
      const p = PASSOS[passo];
      view().innerHTML = `<div class="page" style="max-width:760px">
        <div class="page-head"><a class="btn ghost sm" href="${id ? '#/vaga/' + esc(id) : '#/vagas'}">${I.back} ${id ? 'Voltar à vaga' : 'Cancelar'}</a>
          <small class="muted">${id ? esc(vagaOrig?.numero || '') + ' · editando' : dupId ? 'Nova vaga (cópia)' : 'Nova vaga'}</small></div>
        <div class="steps">${PASSOS.map((_, i) => `<i class="${i <= passo ? 'on' : ''}"></i>`).join('')}</div>
        <div class="step-title"><h1>${esc(p.t)}</h1><small class="muted">Etapa ${passo + 1} de ${PASSOS.length}</small></div>
        <form id="f-vaga" novalidate><div class="card">${p.h()}</div>
        <div class="wizard-foot">
          ${passo > 0 ? '<button type="button" class="btn" data-ant>Voltar</button>' : '<span></span>'}
          <div class="actions">
            <button type="button" class="btn ghost" data-rasc>Salvar rascunho</button>
            ${passo < PASSOS.length - 1 ? '<button type="submit" class="btn primary">Continuar</button>' : '<button type="button" class="btn primary" data-enviar>Enviar para aprovação</button>'}
          </div></div></form></div>`;
      const el = view();
      if (p.depois) p.depois(el);
      $('#f-vaga').addEventListener('submit', (e) => {
        e.preventDefault(); coletar();
        const erro = p.ok(); if (erro) return toast(erro, true);
        passo++; desenhar(); window.scrollTo(0, 0);
      });
      on(el, '[data-ant]', 'click', () => { coletar(); passo--; desenhar(); });
      on(el, '[data-rasc]', 'click', (e) => salvar(false, e.currentTarget));
      on(el, '[data-enviar]', 'click', (e) => salvar(true, e.currentTarget));
    }

    async function salvar(enviar, btn) {
      coletar();
      if (!f.unidade_id) { passo = 0; desenhar(); return toast('Selecione a unidade para salvar.', true); }
      if (!f.cargo_nome) { passo = 1; desenhar(); return toast('Informe o cargo para salvar.', true); }
      if (enviar) {
        for (let i = 0; i < PASSOS.length; i++) { const e = PASSOS[i].ok(); if (e) { passo = i; desenhar(); return toast(e, true); } }
      }
      const solta = travar(btn, 'Salvando…');
      const dados = {};
      CAMPOS_VAGA.forEach((k) => { dados[k] = f[k] === undefined ? null : f[k]; });
      if (!dados.cnh_obrigatoria) dados.cnh_categoria = null;
      if (dados.motivo !== 'substituicao') { dados.substituido_nome = null; dados.motivo_desligamento = null; dados.data_saida = null; }
      if (dados.motivo !== 'aumento_quadro') dados.previsto_orcamento = null;
      if (dados.motivo !== 'afastamento') { dados.afastamento_inicio = null; dados.afastamento_fim = null; }
      let vagaId = id;
      if (id) {
        const { error } = await sb.from('vagas').update(dados).eq('id', id);
        if (error) { solta(); return toast(erroAmigavel(error), true); }
      } else {
        const { data, error } = await sb.from('vagas').insert(dados).select('id').single();
        if (error) { solta(); return toast(erroAmigavel(error), true); }
        vagaId = data.id;
      }
      const rem = { vaga_id: vagaId };
      CAMPOS_REM.forEach((k) => { rem[k] = r[k] === undefined ? null : r[k]; });
      rem.salario_min = rem.salario_min === null ? null : Number(rem.salario_min);
      rem.salario_max = rem.salario_max === null ? null : Number(rem.salario_max);
      if (!rem.tem_variavel) rem.regra_variavel = null;
      const { error: er } = await sb.from('vaga_remuneracao').upsert(rem, { onConflict: 'vaga_id' });
      if (er) toast('Vaga salva, mas a remuneração não pôde ser gravada: ' + erroAmigavel(er), true);
      let docsFalharam = false;
      if (pend.length) {
        btn.textContent = 'Enviando documentos…';
        const n = await enviarAnexos(vagaId, pend);
        docsFalharam = n < pend.length;
        pend.length = 0;
      }
      const avisoDocs = docsFalharam ? ' Alguns documentos não foram enviados; anexe-os pela tela da vaga.' : '';
      if (enviar) {
        const { error: es } = await sb.rpc('mudar_status', { p_vaga: vagaId, p_status: 'aguardando_aprovacao', p_comentario: vagaOrig?.status === 'devolvida' ? 'Ajustes realizados e reenviada.' : null });
        if (es) { solta(); location.hash = '#/vaga/' + vagaId; return toast(erroAmigavel(es), true); }
        toast('Vaga enviada para aprovação.' + avisoDocs, docsFalharam);
      } else toast('Rascunho salvo.' + avisoDocs, docsFalharam);
      location.hash = '#/vaga/' + vagaId;
    }

    desenhar();
  }

  // ------------------------------------------------------------------ outras solicitações (REV.03)
  async function buscarSols() {
    const { data, error } = await sb.from('solicitacoes')
      .select('id,numero,tipo,status,unidade_id,solicitante_id,solicitante_nome,colaborador_nome,titulo,criado_em,atualizado_em,concluido_em')
      .order('atualizado_em', { ascending: false }).limit(2000);
    return error ? [] : data || [];
  }

  function itemSol(s) {
    return `<a class="vaga-item" href="#/solicitacao/${esc(s.id)}">
      <div class="top"><div><div class="num">${esc(s.numero)} · ${esc(TIPOS_SOL[s.tipo])}</div>
        <h3 style="margin-top:2px">${esc(tituloSol(s))}</h3></div>${chipSol(s.status)}</div>
      <div class="meta"><span>${esc(uniNome(s.unidade_id))}</span><span>Solicitante: ${esc(s.solicitante_nome || '—')}</span>
        <span>Aberta em ${fmtData(s.criado_em)}</span></div></a>`;
  }

  function escolherTipoSol() {
    const m = modal(`<h2>Nova solicitação</h2><p class="muted" style="margin-top:0">Qual tipo de solicitação?</p>
      <div class="form-grid">
        <a class="list-row card tipo-sol" href="#/nova-solicitacao?tipo=alteracao_cargo" style="color:inherit">${I.swap}<div class="grow"><b>Alteração de cargo e/ou salário</b><br><small>Promoção, mudança de função, reajuste ou troca de centro de custo. Passa pela aprovação da diretoria.</small></div>›</a>
        <a class="list-row card tipo-sol" href="#/nova-solicitacao?tipo=geral" style="color:inherit">${I.doc}<div class="grow"><b>Solicitação geral</b><br><small>Qualquer outro pedido ao RH. Vai direto para o RH.</small></div>›</a>
      </div><div class="actions"><button class="btn" data-fechar>Cancelar</button></div>`);
    return m;
  }

  async function telaListaSol(params) {
    carregando();
    const ss = await buscarSols();
    const f = { q: '', u: '', t: '', f: params.get('f') || 'abertas' };
    const unis = S.unidades.filter((u) => ss.some((s) => s.unidade_id === u.id));
    const podeCriar = S.me.pode_criar || isMaster();
    view().innerHTML = `<div class="page">
      <div class="page-head"><div><h1>Outras solicitações</h1><small>Alteração de cargo/salário e solicitações gerais ao RH</small></div>
        ${podeCriar ? `<button class="btn sm primary" data-nova-sol>${I.plus} Nova</button>` : ''}</div>
      <div class="filters">
        <input class="input" type="search" placeholder="Buscar nº, colaborador, título ou solicitante" data-k="q" aria-label="Buscar">
        <select class="input" data-k="f" aria-label="Situação"><option value="abertas">Em aberto</option><option value="todas">Todas</option>
          <optgroup label="Status">${Object.entries(ST_SOL).map(([k, s]) => `<option value="${k}">${esc(s.l)}</option>`).join('')}</optgroup></select>
        <select class="input" data-k="t" aria-label="Tipo"><option value="">Todos os tipos</option>${Object.entries(TIPOS_SOL).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
        <select class="input" data-k="u" aria-label="Unidade"><option value="">Todas as unidades</option>${unis.map((u) => `<option value="${u.id}">${esc(u.nome)}</option>`).join('')}</select>
      </div><div id="lista"></div></div>`;
    $('[data-k=f]').value = f.f;
    const pintar = () => {
      const q = f.q.toLowerCase();
      const r = ss.filter((s) => (f.f === 'todas' || (f.f === 'abertas' && !FINAIS_SOL.includes(s.status)) || s.status === f.f)
        && (!f.t || s.tipo === f.t) && (!f.u || s.unidade_id === f.u)
        && (!q || [s.numero, s.colaborador_nome, s.titulo, s.solicitante_nome].join(' ').toLowerCase().includes(q)));
      $('#lista').innerHTML = r.length ? `<small class="muted">${r.length} solicitação(ões)</small><div style="margin-top:8px">${r.map(itemSol).join('')}</div>`
        : `<div class="empty"><b>Nenhuma solicitação encontrada</b>${podeCriar && !ss.length ? 'Use “Nova” para pedir uma alteração de cargo/salário ou outra solicitação ao RH.' : 'Ajuste os filtros para ver outras solicitações.'}</div>`;
    };
    $$('[data-k]').forEach((el) => el.addEventListener('input', () => { f[el.dataset.k] = el.value; pintar(); }));
    on(view(), '[data-nova-sol]', 'click', escolherTipoSol);
    pintar();
    if (params.get('nova') && podeCriar) escolherTipoSol();
  }

  function transicoesSol(s) {
    const me = S.me, out = [];
    if (FINAIS_SOL.includes(s.status)) return out;
    const rh = podeConduzir(s), dono = s.solicitante_id === me.id || isMaster();
    if (s.status === 'aguardando_aprovacao' && podeAprovarUni(s.unidade_id)) out.push('pendente_rh', 'devolvida', 'reprovada');
    if (s.status === 'pendente_rh' && rh) out.push('em_andamento', 'concluida', 'devolvida');
    if (s.status === 'em_andamento' && rh) out.push('concluida', 'devolvida');
    if (rh || (dono && ['aguardando_aprovacao', 'devolvida', 'pendente_rh'].includes(s.status))) out.push('cancelada');
    return out;
  }

  const ROT_ACAO_SOL = { pendente_rh: 'Aprovar', devolvida: 'Devolver', reprovada: 'Reprovar', em_andamento: 'Iniciar atendimento', concluida: 'Concluir', cancelada: 'Cancelar solicitação' };

  async function telaSol(id) {
    carregando();
    const [rs, rsal, rh] = await Promise.all([
      sb.from('solicitacoes').select('*').eq('id', id).maybeSingle(),
      sb.from('solicitacao_salarios').select('*').eq('solicitacao_id', id).maybeSingle(),
      sb.from('solicitacao_historico').select('*').eq('solicitacao_id', id).order('criado_em', { ascending: false }),
    ]);
    const s = rs.data;
    if (!s) { view().innerHTML = `<div class="page"><div class="empty"><b>Solicitação não encontrada</b>Ela não existe ou você não tem acesso a ela.</div></div>`; return; }
    const sal = rsal.data, hist = rh.data || [];
    const trans = transicoesSol(s);
    const podeEditar = s.status === 'devolvida' && (s.solicitante_id === S.me.id || isMaster());
    const item = (rot, val, full) => `<div class="${full ? 'full' : ''}"><dt>${esc(rot)}</dt><dd>${val}</dd></div>`;
    const btn = (st) => `<button class="btn ${['pendente_rh', 'concluida', 'em_andamento'].includes(st) ? 'primary' : ['reprovada'].includes(st) ? 'danger' : st === 'cancelada' ? 'danger ghost' : ''}" data-st="${st}">${ROT_ACAO_SOL[st]}</button>`;
    const dif = sal && sal.salario_atual && sal.salario_novo ? ((sal.salario_novo / sal.salario_atual - 1) * 100) : null;
    view().innerHTML = `<div class="page">
      <div class="page-head"><a class="btn ghost sm" href="#/solicitacoes">${I.back} Solicitações</a></div>
      <div class="grid two" style="align-items:start">
        <div>
          <div class="card">
            <div class="num muted" style="font-size:12.5px;font-weight:600">${esc(s.numero)} · ${esc(TIPOS_SOL[s.tipo])}</div>
            <h1 style="margin:4px 0 10px">${esc(s.tipo === 'geral' ? s.titulo : s.colaborador_nome)}</h1>
            <div class="actions" style="gap:6px">${chipSol(s.status)}</div>
            <dl class="dl" style="margin-top:14px">
              ${item('Unidade', esc(uniNome(s.unidade_id)))}${item('Solicitante', txt(s.solicitante_nome))}
              ${item('Aberta em', fmtDH(s.criado_em))}
              ${s.status === 'aguardando_aprovacao' && uni(s.unidade_id)?.aprovador_nome ? item('Aprovação com', txt(uni(s.unidade_id).aprovador_nome)) : ''}
              ${s.aprovado_em ? item('Aprovada por', `${txt(s.aprovador_nome)} em ${fmtData(s.aprovado_em)}`) : ''}
              ${s.concluido_em ? item('Encerrada em', fmtDH(s.concluido_em)) : ''}
            </dl>
            ${trans.length || podeEditar ? `<div class="actions" style="margin-top:16px">
              ${podeEditar ? `<a class="btn primary" href="#/editar-solicitacao/${esc(s.id)}">Ajustar e reenviar</a>` : ''}
              ${trans.map(btn).join('')}</div>` : ''}
          </div>
          ${s.tipo === 'alteracao_cargo' ? `<div class="card"><h2 style="margin-bottom:12px">Alteração solicitada</h2><dl class="dl">
            ${item('Colaborador', txt(s.colaborador_nome), true)}
            ${item('Cargo atual', txt(s.cargo_atual))}${item('Cargo alterado', s.cargo_novo ? txt(s.cargo_novo) : '<span class="muted">Sem alteração</span>')}
            ${sal ? item('Salário atual', money(sal.salario_atual)) + item('Salário alterado', sal.salario_novo ? money(sal.salario_novo) + (dif !== null ? ` <small class="muted">(${dif >= 0 ? '+' : ''}${dif.toFixed(1).replace('.', ',')}%)</small>` : '') : '<span class="muted">Sem alteração</span>') : ''}
            ${item('Centro de custo terá alteração', s.altera_centro_custo ? `Sim · novo: ${txt(s.centro_custo_novo)}` : simNao(s.altera_centro_custo))}
            ${item('Motivo da alteração', txt(s.motivo), true)}</dl></div>`
          : `<div class="card"><h2 style="margin-bottom:12px">Solicitação</h2><dl class="dl">
            ${item('Título', txt(s.titulo), true)}${item('Motivo da solicitação', txt(s.motivo), true)}</dl></div>`}
        </div>
        <div><div class="card"><h2 style="margin-bottom:14px">Linha do tempo</h2>
          <ul class="timeline">${hist.map((h) => `<li><div>${chipSol(h.status_para)}</div>
            <div class="when">${fmtDH(h.criado_em)} · ${esc(h.autor_nome || '—')}</div>
            ${h.comentario ? `<div class="c">${esc(h.comentario)}</div>` : ''}</li>`).join('')}</ul></div></div>
      </div></div>`;
    on(view(), '[data-st]', 'click', (e) => modalStatusSol(s, e.currentTarget.dataset.st));
  }

  function modalStatusSol(s, alvo) {
    const motivo = ['devolvida', 'reprovada', 'cancelada'].includes(alvo);
    const m = modal(`<h2>${esc(ROT_ACAO_SOL[alvo])}</h2><p class="muted" style="margin-top:0">${esc(s.numero)} · ${esc(tituloSol(s))}</p>
      <form id="f-sst" class="form-grid" novalidate><div>${chipSol(s.status)} → ${chipSol(alvo)}</div>
      <label class="f"><span>${motivo ? 'Motivo <em>*</em>' : 'Comentário'}</span><textarea class="input" name="com" maxlength="2000" placeholder="${alvo === 'concluida' ? 'Ex.: alteração lançada na folha a partir de...' : 'Visível para o solicitante e gestores autorizados'}"></textarea></label>
      <div class="actions"><button type="button" class="btn" data-fechar>Voltar</button><button class="btn primary" type="submit">Confirmar</button></div></form>`);
    const f = $('#f-sst', m.el);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const com = f.com.value.trim();
      if (motivo && !com) return toast('Informe o motivo.', true);
      const solta = travar($('button[type=submit]', f), 'Salvando…');
      const { error } = await sb.rpc('mudar_status_solicitacao', { p_id: s.id, p_status: alvo, p_comentario: com || null });
      if (error) { solta(); return toast(erroAmigavel(error), true); }
      m.fechar(); toast('Solicitação atualizada.'); telaSol(s.id);
    });
  }

  async function telaFormSol(id, tipoNovo) {
    const me = S.me;
    if (!id && !(me.pode_criar || isMaster())) return semAcesso();
    carregando();
    let s = { tipo: TIPOS_SOL[tipoNovo] ? tipoNovo : null }, sal = {};
    if (id) {
      const [rs, rsal] = await Promise.all([sb.from('solicitacoes').select('*').eq('id', id).maybeSingle(), sb.from('solicitacao_salarios').select('*').eq('solicitacao_id', id).maybeSingle()]);
      if (!rs.data) return semAcesso();
      if (!(rs.data.status === 'devolvida' && (rs.data.solicitante_id === me.id || isMaster()))) {
        view().innerHTML = `<div class="page"><div class="empty"><b>Edição indisponível</b>Só é possível ajustar solicitações devolvidas.</div></div>`; return;
      }
      s = rs.data; sal = rsal.data || {};
    }
    if (!s.tipo) { location.hash = '#/solicitacoes?nova=1'; return; }
    const unis = minhasUnidades();
    if (!s.unidade_id && unis.length === 1) s.unidade_id = unis[0].id;
    const alt = s.tipo === 'alteracao_cargo';
    const campo = (rot, html, obrig, extra = '') => `<label class="f ${extra}"><span>${esc(rot)}${obrig ? ' <em>*</em>' : ''}</span>${html}</label>`;
    const inp = (k, o = {}) => `<input class="input" name="${k}" value="${esc(o.v ?? s[k] ?? '')}" maxlength="${o.max || 120}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.list ? `list="${o.list}"` : ''}>`;
    const din = (k) => `<input class="input" name="${k}" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(sal[k] ?? '')}">`;
    view().innerHTML = `<div class="page" style="max-width:760px">
      <div class="page-head"><a class="btn ghost sm" href="${id ? '#/solicitacao/' + esc(id) : '#/solicitacoes'}">${I.back} ${id ? 'Voltar' : 'Cancelar'}</a>
        <small class="muted">${id ? esc(s.numero) + ' · ajustando' : 'Nova solicitação'}</small></div>
      <div class="step-title"><h1>${esc(TIPOS_SOL[s.tipo])}</h1><small class="muted">${alt ? 'Segue para aprovação da diretoria e depois para o RH.' : 'Segue direto para o RH.'}</small></div>
      <form id="f-sol" novalidate><div class="card"><div class="form-grid cols-2">
        ${campo('Concessionária / unidade', `<select class="input" name="unidade_id" ${id ? 'disabled' : ''}><option value="">Selecione</option>${(id ? S.unidades.filter((u) => u.id === s.unidade_id) : unis).map((u) => `<option value="${u.id}" ${u.id === s.unidade_id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select>`, true, 'span-2')}
        ${alt ? `
          ${campo('Nome do colaborador', inp('colaborador_nome'), true, 'span-2')}
          ${campo('Motivo da alteração', `<textarea class="input" name="motivo" maxlength="2000" placeholder="Ex.: promoção por desempenho, reenquadramento, mudança de função">${esc(s.motivo || '')}</textarea>`, true, 'span-2')}
          ${campo('Cargo que está', inp('cargo_atual', { list: 'dl-cargos' }), true)}
          ${campo('Cargo alterado', inp('cargo_novo', { list: 'dl-cargos', ph: 'Deixe vazio se não muda' }))}
          ${campo('Salário atual (R$)', din('salario_atual'))}
          ${campo('Salário alterado (R$)', din('salario_novo'))}
          <div class="f span-2"><span style="display:block;font-size:13px;font-weight:600;margin-bottom:8px">Centro de custo terá alteração? <em>*</em></span>
            <div class="seg">${[['true', 'Sim'], ['false', 'Não']].map(([v, l]) => `<label><input type="radio" name="altera_centro_custo" value="${v}" ${String(s.altera_centro_custo) === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
          <div class="span-2 ${s.altera_centro_custo ? '' : 'hidden'}" id="cc-novo">${campo('Novo centro de custo', inp('centro_custo_novo', { max: 60 }), true)}</div>
          <datalist id="dl-cargos">${S.cargos.filter((c) => c.ativo).map((c) => `<option value="${esc(c.nome)}">`).join('')}</datalist>
          <p class="hint span-2" style="margin:0">Salários ficam visíveis apenas para você, para a diretoria que aprova e para quem tem permissão de ver salários.</p>`
        : `
          ${campo('Título da solicitação', inp('titulo', { max: 150, ph: 'Ex.: Troca de uniforme, ajuste de jornada, declaração' }), true, 'span-2')}
          ${campo('Motivo da solicitação', `<textarea class="input" name="motivo" maxlength="2000">${esc(s.motivo || '')}</textarea>`, true, 'span-2')}`}
      </div></div>
      <div class="wizard-foot"><span></span><button type="submit" class="btn primary">${id ? 'Reenviar' : alt ? 'Enviar para aprovação' : 'Enviar ao RH'}</button></div></form></div>`;
    const f = $('#f-sol');
    on(f, 'input[name=altera_centro_custo]', 'change', (e) => $('#cc-novo').classList.toggle('hidden', e.target.value !== 'true'));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = (k) => (f[k] ? f[k].value.trim() : '') || null;
      const unidade_id = id ? s.unidade_id : val('unidade_id');
      const d = { motivo: val('motivo') };
      let salario = null;
      if (!unidade_id) return toast('Selecione a unidade.', true);
      if (alt) {
        Object.assign(d, { colaborador_nome: val('colaborador_nome'), cargo_atual: val('cargo_atual'), cargo_novo: val('cargo_novo') });
        const cc = f.querySelector('input[name=altera_centro_custo]:checked');
        d.altera_centro_custo = cc ? cc.value === 'true' : null;
        d.centro_custo_novo = d.altera_centro_custo ? val('centro_custo_novo') : null;
        const sa = val('salario_atual'), sn = val('salario_novo');
        salario = { salario_atual: sa === null ? null : Number(sa), salario_novo: sn === null ? null : Number(sn) };
        if (!d.colaborador_nome) return toast('Informe o nome do colaborador.', true);
        if (!d.motivo) return toast('Informe o motivo da alteração.', true);
        if (!d.cargo_atual) return toast('Informe o cargo atual.', true);
        if (d.altera_centro_custo === null) return toast('Informe se o centro de custo terá alteração.', true);
        if (d.altera_centro_custo && !d.centro_custo_novo) return toast('Informe o novo centro de custo.', true);
        if (!d.cargo_novo && salario.salario_novo === null && !d.altera_centro_custo) return toast('Informe o cargo alterado e/ou o salário alterado.', true);
        if (d.cargo_novo && d.cargo_novo.toLowerCase() === d.cargo_atual.toLowerCase()) return toast('O cargo alterado é igual ao atual.', true);
      } else {
        d.titulo = val('titulo');
        if (!d.titulo) return toast('Informe o título.', true);
        if (!d.motivo) return toast('Informe o motivo.', true);
      }
      const solta = travar($('button[type=submit]', f), 'Enviando…');
      let solId = id;
      if (id) {
        const { error } = await sb.from('solicitacoes').update(d).eq('id', id);
        if (error) { solta(); return toast(erroAmigavel(error), true); }
      } else {
        const { data, error } = await sb.from('solicitacoes').insert({ ...d, tipo: s.tipo, unidade_id }).select('id').single();
        if (error) { solta(); return toast(erroAmigavel(error), true); }
        solId = data.id;
      }
      if (salario && (id || salario.salario_atual !== null || salario.salario_novo !== null)) {
        const { error: es } = await sb.from('solicitacao_salarios').upsert({ solicitacao_id: solId, ...salario }, { onConflict: 'solicitacao_id' });
        if (es) toast('Solicitação salva, mas os salários não puderam ser gravados: ' + erroAmigavel(es), true);
      }
      if (id) {
        const { error: er } = await sb.rpc('mudar_status_solicitacao', { p_id: id, p_status: alt ? 'aguardando_aprovacao' : 'pendente_rh', p_comentario: 'Ajustes realizados e reenviada.' });
        if (er) { solta(); location.hash = '#/solicitacao/' + id; return toast(erroAmigavel(er), true); }
      }
      toast(alt ? 'Solicitação enviada para aprovação.' : 'Solicitação enviada ao RH.');
      location.hash = '#/solicitacao/' + solId;
    });
  }

  // ------------------------------------------------------------------ administração: configurações (REV.03)
  function telaConfig() {
    if (!isMaster()) return semAcesso();
    const emails = Array.isArray(S.config.emails_admissao) ? S.config.emails_admissao : [];
    view().innerHTML = `<div class="page" style="max-width:760px"><div class="page-head"><h1>Configurações</h1></div>
      <div class="card"><h2 style="margin-bottom:6px">${I.mail} Aviso de admissão concluída</h2>
        <p class="muted" style="margin:0 0 12px">Quando o RH conclui uma vaga, o sistema envia um e-mail com os dados do(s) admitido(s) — nome, cargo, data de admissão, concessionária, departamento, centro de custo e gestor — para atualizar o organograma.</p>
        <form id="f-cfg" class="form-grid">
          <label class="f"><span>E-mails que recebem o aviso (um por linha, até 10)</span>
            <textarea class="input" name="emails" style="min-height:110px" placeholder="isabela.moura@gruponogueiralins.com.br">${esc(emails.join('\n'))}</textarea></label>
          <div class="actions" style="justify-content:flex-end"><button class="btn primary sm" type="submit">Salvar</button></div></form></div></div>`;
    $('#f-cfg').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fr = e.currentTarget;
      const lista = [...new Set(fr.emails.value.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
      const inval = lista.filter((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
      if (inval.length) return toast('E-mail inválido: ' + inval[0], true);
      if (lista.length > 10) return toast('Use no máximo 10 e-mails.', true);
      const solta = travar($('button[type=submit]', fr), 'Salvando…');
      const { error } = await sb.from('configuracoes').upsert({ chave: 'emails_admissao', valor: lista, atualizado_em: new Date().toISOString() }, { onConflict: 'chave' });
      solta();
      if (error) return toast(erroAmigavel(error), true);
      S.config.emails_admissao = lista;
      toast('E-mails salvos.');
    });
  }

  // ------------------------------------------------------------------ avisos
  async function telaAvisos() {
    carregando();
    const { data } = await sb.from('notificacoes').select('*').order('criado_em', { ascending: false }).limit(100);
    const ns = data || [];
    view().innerHTML = `<div class="page" style="max-width:760px"><div class="page-head"><h1>Avisos</h1>
      ${ns.some((n) => !n.lida) ? '<button class="btn sm" data-todas>Marcar todos como lidos</button>' : ''}</div>
      <div class="card">${ns.length ? ns.map((n) => `<a class="list-row" href="${n.solicitacao_id ? '#/solicitacao/' + esc(n.solicitacao_id) : '#/vaga/' + esc(n.vaga_id)}" data-n="${n.id}" style="color:inherit">
        <span class="avatar" style="${n.lida ? 'opacity:.4' : ''}">${I.bell}</span>
        <div class="grow"><div style="${n.lida ? '' : 'font-weight:650'}">${esc(n.texto)}</div><small>${fmtDH(n.criado_em)}</small></div></a>`).join('')
        : '<div class="empty"><b>Tudo em dia</b>Você não tem avisos.</div>'}</div></div>`;
    on(view(), '[data-n]', 'click', (e) => { sb.from('notificacoes').update({ lida: true }).eq('id', e.currentTarget.dataset.n).then(contarAvisos); });
    on(view(), '[data-todas]', 'click', async () => {
      await sb.from('notificacoes').update({ lida: true }).eq('lida', false).eq('usuario_id', S.me.id);
      contarAvisos(); telaAvisos();
    });
  }

  // ------------------------------------------------------------------ mais / conta
  function telaMais() {
    const adm = itensAdmin();
    view().innerHTML = `<div class="page" style="max-width:760px"><h1 style="margin-bottom:16px">Mais</h1>
      <div class="card"><a class="list-row" href="#/solicitacoes" style="color:inherit">${I.swap}<div class="grow">Outras solicitações<br><small>Alteração de cargo/salário e solicitações gerais</small></div>›</a></div>
      ${adm.length ? `<div class="card"><h2 style="margin-bottom:6px">Administração</h2>${adm.map((x) => `<a class="list-row" href="#/${x.h}" style="color:inherit">${x.i}<div class="grow">${esc(x.l)}</div>›</a>`).join('')}</div>` : ''}
      <div class="card"><a class="list-row" href="#/conta" style="color:inherit">${I.user}<div class="grow">Minha conta</div>›</a>
      <a class="list-row" href="#" data-sair2 style="color:var(--bad)">${I.out}<div class="grow">Sair</div></a></div></div>`;
    on(view(), '[data-sair2]', 'click', (e) => { e.preventDefault(); sair(); });
  }

  function telaConta() {
    const me = S.me;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    view().innerHTML = `<div class="page" style="max-width:760px"><h1 style="margin-bottom:16px">Minha conta</h1>
      <div class="card"><div class="list-row" style="border:0"><span class="avatar" style="width:48px;height:48px;font-size:16px">${esc(iniciais(me.nome))}</span>
        <div class="grow"><h2>${esc(me.nome)}</h2><small>${esc(me.email)} · ${esc(PERFIS[me.perfil])}</small></div></div>
        <div class="actions" style="margin-top:8px"><button class="btn" data-senha>Trocar senha</button><button class="btn danger" data-sair3>Sair</button></div></div>
      ${instalado ? '' : `<div class="card"><h2 style="margin-bottom:8px">Instalar no celular</h2>
        ${S.instalar ? '<button class="btn primary" data-instalar>Instalar aplicativo</button>'
          : ios ? '<p class="muted" style="margin:0">No Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</p>'
          : '<p class="muted" style="margin:0">No Chrome, abra o menu ⋮ e toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</p>'}</div>`}
      <div class="card"><h2 style="margin-bottom:8px">Segurança</h2><p class="muted" style="margin:0">Sua sessão é encerrada após ${C.INATIVIDADE_MIN || 60} minutos sem uso. Não compartilhe sua senha; cada acesso fica registrado.</p></div></div>`;
    on(view(), '[data-senha]', 'click', () => telaTrocarSenha(false));
    on(view(), '[data-sair3]', 'click', sair);
    on(view(), '[data-instalar]', 'click', async () => { S.instalar.prompt(); await S.instalar.userChoice; S.instalar = null; telaConta(); });
  }

  // ------------------------------------------------------------------ administração: usuários
  const MODELOS = {
    master: { escopo: 'unidade', todas_unidades: true, pode_criar: true, pode_aprovar: true, pode_alterar_status: true, pode_comentar: true, pode_exportar: true, ver_salario: true, ver_confidencial: true, ver_internos: true, ver_sensiveis: true, gerenciar_cadastros: true },
    rh: { escopo: 'unidade', todas_unidades: false, pode_criar: true, pode_aprovar: false, pode_alterar_status: true, pode_comentar: true, pode_exportar: true, ver_salario: true, ver_confidencial: true, ver_internos: true, ver_sensiveis: true, gerenciar_cadastros: true },
    aprovador: { escopo: 'unidade', todas_unidades: false, pode_criar: true, pode_aprovar: true, pode_alterar_status: false, pode_comentar: true, pode_exportar: true, ver_salario: true, ver_confidencial: true, ver_internos: false, ver_sensiveis: false, gerenciar_cadastros: false },
    gestor: { escopo: 'proprias', todas_unidades: false, pode_criar: true, pode_aprovar: false, pode_alterar_status: false, pode_comentar: true, pode_exportar: false, ver_salario: false, ver_confidencial: false, ver_internos: false, ver_sensiveis: false, gerenciar_cadastros: false },
    visualizador: { escopo: 'unidade', todas_unidades: false, pode_criar: false, pode_aprovar: false, pode_alterar_status: false, pode_comentar: false, pode_exportar: false, ver_salario: false, ver_confidencial: false, ver_internos: false, ver_sensiveis: false, gerenciar_cadastros: false },
  };
  const PERMS = [
    ['pode_criar', 'Abrir vagas'], ['pode_aprovar', 'Aprovar / reprovar vagas'], ['pode_alterar_status', 'Alterar status (RH)'],
    ['pode_comentar', 'Comentar'], ['pode_exportar', 'Exportar planilha'], ['ver_salario', 'Ver salário e benefícios'],
    ['ver_confidencial', 'Ver vagas confidenciais'], ['ver_internos', 'Ver comentários internos do RH'],
    ['ver_sensiveis', 'Ver e anexar parecer psicológico'], ['gerenciar_cadastros', 'Gerenciar cadastros (cargos, etc.)'],
  ];

  async function invocarAdmin(corpo) {
    const { data, error } = await sb.functions.invoke('admin-usuarios', { body: corpo });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.erro || msg; } catch (_) { /* sem corpo */ }
      throw new Error(msg);
    }
    if (data?.erro) throw new Error(data.erro);
    return data;
  }

  function mostrarSenha(nome, email, senha) {
    const m = modal(`<h2>Acesso criado</h2><p class="muted" style="margin:0">Envie estes dados para <b>${esc(nome)}</b> por um canal seguro. No primeiro acesso, o sistema pedirá uma nova senha.</p>
      <div style="margin-top:12px"><small class="muted">Endereço</small><div class="secret" style="font-size:14px;letter-spacing:0">${esc(location.origin + location.pathname)}</div>
      <small class="muted">E-mail</small><div class="secret" style="font-size:15px;letter-spacing:0">${esc(email)}</div>
      <small class="muted">Senha temporária</small><div class="secret">${esc(senha)}</div></div>
      <div class="actions"><button class="btn" data-copiar>${I.copy} Copiar mensagem</button><button class="btn primary" data-fechar>Pronto</button></div>`);
    $('[data-copiar]', m.el).addEventListener('click', async () => {
      const t = `Olá, ${nome}! Seu acesso ao RH Grupo Nogueira Lins:\n${location.origin + location.pathname}\nE-mail: ${email}\nSenha temporária: ${senha}\nNo primeiro acesso você criará sua senha pessoal.`;
      try { await navigator.clipboard.writeText(t); toast('Mensagem copiada.'); } catch (_) { toast('Não foi possível copiar.', true); }
    });
  }

  function formUsuario(u, preset = {}) {
    const novo = !u;
    const d = Object.assign({ perfil: 'gestor', unidades: [], ...MODELOS.gestor }, preset.perfil ? MODELOS[preset.perfil] : {}, preset, u || {});
    const m = modal(`<h2>${novo ? 'Novo usuário' : 'Editar usuário'}</h2>
      <form id="f-user" class="form-grid" novalidate>
        <label class="f"><span>Nome completo <em>*</em></span><input class="input" name="nome" maxlength="120" value="${esc(d.nome || '')}"></label>
        <label class="f"><span>E-mail (login) <em>*</em></span><input class="input" name="email" type="email" value="${esc(d.email || '')}" ${novo ? '' : 'readonly'}></label>
        <label class="f"><span>Perfil</span><select class="input" name="perfil">${Object.entries(PERFIS).map(([k, l]) => `<option value="${k}" ${d.perfil === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <div class="hint">Ao trocar o perfil, as permissões abaixo são preenchidas com o padrão. Ajuste se precisar.</div></label>
        <div class="f"><span style="display:block;font-size:13px;font-weight:600;margin-bottom:8px">Unidades que pode acessar</span>
          <label class="check"><input type="checkbox" name="todas_unidades" ${d.todas_unidades ? 'checked' : ''}> Todas as unidades</label>
          <div id="lista-uni" class="perm-grid ${d.todas_unidades ? 'hidden' : ''}">${S.unidades.filter((x) => x.ativo || (d.unidades || []).includes(x.id)).map((x) => `<label class="check"><input type="checkbox" name="uni" value="${x.id}" ${(d.unidades || []).includes(x.id) ? 'checked' : ''}> ${esc(x.nome)}</label>`).join('')}</div></div>
        <div class="f"><span style="display:block;font-size:13px;font-weight:600;margin-bottom:8px">Quais vagas enxerga</span>
          <div class="seg"><label><input type="radio" name="escopo" value="proprias" ${d.escopo === 'proprias' ? 'checked' : ''}><span>Só as que abriu</span></label>
          <label><input type="radio" name="escopo" value="unidade" ${d.escopo === 'unidade' ? 'checked' : ''}><span>Todas da(s) unidade(s)</span></label></div></div>
        <div class="f"><span style="display:block;font-size:13px;font-weight:600;margin-bottom:4px">Permissões</span>
          <div class="perm-grid">${PERMS.map(([k, l]) => `<label class="check"><input type="checkbox" name="${k}" ${d[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></div>
        ${novo ? '' : `<div class="card" style="background:var(--surface-2);box-shadow:none"><div class="actions">
          <button type="button" class="btn sm" data-reset>Gerar nova senha</button>
          ${u.id !== S.me.id ? `<button type="button" class="btn sm ${u.ativo ? 'danger' : ''}" data-ativo>${u.ativo ? 'Desativar acesso' : 'Reativar acesso'}</button>` : ''}</div>
          <small class="muted">Último acesso: ${fmtDH(u.ultimo_acesso)}</small></div>`}
        <div class="actions"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary" type="submit">${novo ? 'Criar acesso' : 'Salvar'}</button></div>
      </form>`, { wide: true });
    const f = $('#f-user', m.el);
    f.perfil.addEventListener('change', () => {
      const mod = MODELOS[f.perfil.value];
      Object.entries(mod).forEach(([k, v]) => {
        if (k === 'escopo') $$(`input[name=escopo]`, f).forEach((r) => { r.checked = r.value === v; });
        else if (f[k]) f[k].checked = v;
      });
      $('#lista-uni', f).classList.toggle('hidden', f.todas_unidades.checked);
    });
    f.todas_unidades.addEventListener('change', () => $('#lista-uni', f).classList.toggle('hidden', f.todas_unidades.checked));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const corpo = {
        nome: f.nome.value.trim(), email: f.email.value.trim().toLowerCase(), perfil: f.perfil.value,
        escopo: (f.querySelector('input[name=escopo]:checked') || {}).value || 'proprias',
        todas_unidades: f.todas_unidades.checked, unidades: $$('input[name=uni]:checked', f).map((x) => x.value),
      };
      PERMS.forEach(([k]) => { corpo[k] = f[k].checked; });
      if (!corpo.nome) return toast('Informe o nome.', true);
      if (novo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corpo.email)) return toast('Informe um e-mail válido.', true);
      if (!corpo.todas_unidades && !corpo.unidades.length && corpo.perfil !== 'master') return toast('Selecione ao menos uma unidade.', true);
      if (!novo && u.id === S.me.id && corpo.perfil !== 'master') return toast('Você não pode remover seu próprio perfil Master.', true);
      const solta = travar($('button[type=submit]', f), 'Salvando…');
      try {
        if (novo) {
          const r = await invocarAdmin({ acao: 'criar', ...corpo });
          m.fechar(); mostrarSenha(corpo.nome, corpo.email, r.senha_temporaria);
        } else {
          const { email, ...upd } = corpo;
          const { error } = await sb.from('perfis').update(upd).eq('id', u.id);
          if (error) throw error;
          m.fechar(); toast('Usuário atualizado.');
        }
        preset.depois ? preset.depois() : telaUsuarios();
      } catch (err) { solta(); toast(erroAmigavel(err), true); }
    });
    if (!novo) {
      on(f, '[data-reset]', 'click', async () => {
        if (!(await confirmar('Gerar nova senha', `Uma senha temporária será criada para ${u.nome}. A senha atual deixará de funcionar.`, 'Gerar'))) return;
        try { const r = await invocarAdmin({ acao: 'redefinir_senha', id: u.id }); m.fechar(); mostrarSenha(u.nome, u.email, r.senha_temporaria); }
        catch (err) { toast(erroAmigavel(err), true); }
      });
      on(f, '[data-ativo]', 'click', async () => {
        const ativo = !u.ativo;
        if (!(await confirmar(ativo ? 'Reativar acesso' : 'Desativar acesso', ativo ? `${u.nome} voltará a acessar o sistema.` : `${u.nome} perderá o acesso imediatamente. O histórico é preservado.`, ativo ? 'Reativar' : 'Desativar', !ativo))) return;
        try { await invocarAdmin({ acao: 'definir_ativo', id: u.id, ativo }); m.fechar(); toast(ativo ? 'Acesso reativado.' : 'Acesso desativado.'); preset.depois ? preset.depois() : telaUsuarios(); }
        catch (err) { toast(erroAmigavel(err), true); }
      });
    }
  }

  async function telaUsuarios() {
    if (!isMaster()) return semAcesso();
    carregando();
    const { data, error } = await sb.from('perfis').select('*').order('nome');
    if (error) return toast(erroAmigavel(error), true);
    const us = data || [];
    view().innerHTML = `<div class="page" style="max-width:900px"><div class="page-head"><h1>Usuários</h1><button class="btn primary" data-novo>${I.plus} Novo usuário</button></div>
      <input class="input" type="search" placeholder="Buscar por nome ou e-mail" id="bu" style="margin-bottom:12px" aria-label="Buscar usuário">
      <div class="card" id="lu"></div></div>`;
    const pintar = () => {
      const q = $('#bu').value.toLowerCase();
      const r = us.filter((u) => !q || (u.nome + ' ' + u.email).toLowerCase().includes(q));
      $('#lu').innerHTML = r.length ? r.map((u) => `<a class="list-row" href="#" data-u="${u.id}" style="color:inherit">
        <span class="avatar">${esc(iniciais(u.nome))}</span>
        <div class="grow"><b>${esc(u.nome)}</b><br><small>${esc(u.email)} · ${u.perfil === 'master' || u.todas_unidades ? 'Todas as unidades' : esc((u.unidades || []).map(uniNome).join(', ') || 'Sem unidade')}</small></div>
        <div style="text-align:right"><span class="chip info plain">${esc(PERFIS[u.perfil])}</span>${u.ativo ? '' : '<br><span class="chip bad" style="margin-top:4px">Inativo</span>'}</div></a>`).join('')
        : '<div class="empty"><b>Nenhum usuário</b></div>';
      on($('#lu'), '[data-u]', 'click', (e) => { e.preventDefault(); formUsuario(us.find((x) => x.id === e.currentTarget.dataset.u)); });
    };
    $('#bu').addEventListener('input', pintar);
    on(view(), '[data-novo]', 'click', () => formUsuario(null));
    pintar();
  }

  // ------------------------------------------------------------------ administração: concessionárias
  async function telaUnidades() {
    if (!isMaster()) return semAcesso();
    carregando();
    await carregarCadastros();
    const { data } = await sb.from('perfis').select('id,nome,email,perfil,ativo,unidades,todas_unidades,escopo').order('nome');
    const us = data || [];
    view().innerHTML = `<div class="page" style="max-width:900px"><div class="page-head"><div><h1>Concessionárias</h1><small>${S.unidades.length} cadastrada(s)</small></div>
      <button class="btn primary" data-nova>${I.plus} Nova concessionária</button></div>
      ${S.unidades.map((u) => {
        const adms = us.filter((p) => p.perfil !== 'master' && !p.todas_unidades && (p.unidades || []).includes(u.id));
        return `<div class="card"><div class="section-title"><div><h2>${esc(u.nome)}</h2>
          <small>${[u.marca, u.cidade, u.cnpj ? 'CNPJ ' + u.cnpj : ''].filter(Boolean).map(esc).join(' · ') || '—'}</small></div>
          <div class="actions">${u.ativo ? '' : '<span class="chip bad">Inativa</span>'}<button class="btn sm" data-edit="${u.id}">Editar</button></div></div>
          ${u.gerente_nome || u.telefone || u.email ? `<p class="muted" style="margin:0 0 10px;font-size:13.5px">${[u.gerente_nome ? 'Gerente: ' + u.gerente_nome : '', u.telefone, u.email].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
          <p style="margin:0 0 10px;font-size:13.5px"><b>Aprovação:</b> ${u.aprovador_id ? esc(us.find((p) => p.id === u.aprovador_id)?.nome || u.aprovador_nome || '—') + ' <span class="muted">(diretor)</span>' : '<span class="muted">quem tem permissão de aprovar na unidade</span>'}</p>
          <div style="font-size:13px;font-weight:650;margin:6px 0 2px">Administradores e usuários da unidade</div>
          ${adms.length ? adms.map((p) => `<div class="list-row"><span class="avatar">${esc(iniciais(p.nome))}</span><div class="grow"><b>${esc(p.nome)}</b><br><small>${esc(p.email)}</small></div>
            <span class="chip info plain">${esc(PERFIS[p.perfil])}</span>${p.ativo ? '' : '<span class="chip bad">Inativo</span>'}<button class="btn sm ghost" data-eu="${p.id}">Editar</button></div>`).join('')
            : '<p class="muted" style="margin:6px 0">Nenhum usuário vinculado ainda.</p>'}
          <button class="btn sm" style="margin-top:8px" data-adm="${u.id}">${I.plus} Adicionar administrador</button></div>`;
      }).join('')}</div>`;
    on(view(), '[data-nova]', 'click', () => formUnidade(null, us));
    on(view(), '[data-edit]', 'click', (e) => formUnidade(S.unidades.find((x) => x.id === e.currentTarget.dataset.edit), us));
    on(view(), '[data-adm]', 'click', (e) => formUsuario(null, { perfil: 'aprovador', unidades: [e.currentTarget.dataset.adm], depois: telaUnidades }));
    on(view(), '[data-eu]', 'click', async (e) => {
      const { data: u } = await sb.from('perfis').select('*').eq('id', e.currentTarget.dataset.eu).single();
      formUsuario(u, { depois: telaUnidades });
    });
  }

  function formUnidade(u, us = []) {
    const d = u || { ativo: true, marca: '' };
    const diretores = us.filter((p) => p.ativo || p.id === d.aprovador_id);
    const c = (k, rot, o = {}) => `<label class="f ${o.span ? 'span-2' : ''}"><span>${esc(rot)}${o.req ? ' <em>*</em>' : ''}</span><input class="input" name="${k}" maxlength="${o.max || 150}" value="${esc(d[k] || '')}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.mode ? `inputmode="${o.mode}"` : ''}></label>`;
    const m = modal(`<h2>${u ? 'Editar concessionária' : 'Nova concessionária'}</h2><form id="f-uni" class="form-grid cols-2" novalidate>
      ${c('nome', 'Nome de exibição', { req: true, span: true, ph: 'Ex.: Royal Enfield Bravick - Rio Preto' })}
      ${c('marca', 'Marca')}${c('cidade', 'Cidade')}
      ${c('razao_social', 'Razão social', { span: true })}${c('cnpj', 'CNPJ', { max: 18, mode: 'numeric', ph: '00.000.000/0000-00' })}${c('telefone', 'Telefone', { max: 20, mode: 'tel' })}
      ${c('endereco', 'Endereço', { span: true, max: 250 })}
      ${c('gerente_nome', 'Gerente geral')}${c('email', 'E-mail da unidade', { mode: 'email' })}
      <label class="f span-2"><span>Diretor que aprova vagas e solicitações</span>
        <select class="input" name="aprovador_id"><option value="">Sem diretor definido (aprova quem tem permissão na unidade)</option>
        ${diretores.map((p) => `<option value="${p.id}" ${p.id === d.aprovador_id ? 'selected' : ''}>${esc(p.nome)} · ${esc(p.email)}</option>`).join('')}</select>
        <div class="hint">Com diretor definido, somente ele (e o Master) aprova e recebe os avisos de aprovação desta concessionária. Ex.: VW → Marcos; Royal Enfield → Matheus.</div></label>
      <div class="span-2"><label class="check"><input type="checkbox" name="ativo" ${d.ativo ? 'checked' : ''}> Concessionária ativa</label></div>
      <div class="actions span-2"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`, { wide: true });
    const f = $('#f-uni', m.el);
    f.cnpj.addEventListener('input', () => {
      const n = f.cnpj.value.replace(/\D/g, '').slice(0, 14);
      f.cnpj.value = n.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = {};
      ['nome', 'marca', 'cidade', 'razao_social', 'cnpj', 'telefone', 'endereco', 'gerente_nome', 'email'].forEach((k) => { dados[k] = f[k].value.trim() || null; });
      dados.ativo = f.ativo.checked;
      dados.aprovador_id = f.aprovador_id.value || null;
      dados.aprovador_nome = dados.aprovador_id ? us.find((p) => p.id === dados.aprovador_id)?.nome || null : null;
      if (!dados.nome) return toast('Informe o nome.', true);
      const solta = travar($('button[type=submit]', f), 'Salvando…');
      const { error } = u ? await sb.from('unidades').update(dados).eq('id', u.id) : await sb.from('unidades').insert(dados);
      solta();
      if (error) return toast(erroAmigavel(error), true);
      m.fechar(); toast('Concessionária salva.'); telaUnidades();
    });
  }

  // ------------------------------------------------------------------ administração: cadastros
  async function telaCadastros(params) {
    if (!(isMaster() || S.me.gerenciar_cadastros)) return semAcesso();
    await carregarCadastros();
    const aba = params.get('aba') || 'cargos';
    const abas = [['cargos', 'Cargos'], ['departamentos', 'Departamentos'], ['beneficios', 'Benefícios']];
    const lista = aba === 'cargos' ? S.cargos : aba === 'departamentos' ? S.departamentos : S.beneficios;
    view().innerHTML = `<div class="page" style="max-width:900px"><div class="page-head"><h1>Cadastros</h1><button class="btn primary" data-novo>${I.plus} Adicionar</button></div>
      <div class="tabs">${abas.map(([k, l]) => `<a href="#/admin/cadastros?aba=${k}" class="${aba === k ? 'on' : ''}">${l}</a>`).join('')}</div>
      <div class="card">${lista.length ? lista.map((x) => `<a class="list-row" href="#" data-i="${x.id}" style="color:inherit"><div class="grow"><b>${esc(x.nome)}</b>
        ${aba === 'cargos' ? `<br><small>${esc(depNome(x.departamento_id))} · SLA ${x.sla_dias} dias</small>` : ''}</div>
        ${x.ativo ? '' : '<span class="chip">Inativo</span>'}›</a>`).join('') : '<div class="empty"><b>Nada cadastrado</b></div>'}</div></div>`;
    const abrir = (x) => {
      const d = x || { ativo: true, sla_dias: 30 };
      const m = modal(`<h2>${x ? 'Editar' : 'Adicionar'} ${aba === 'cargos' ? 'cargo' : aba === 'departamentos' ? 'departamento' : 'benefício'}</h2>
        <form id="f-cad" class="form-grid" novalidate>
          <label class="f"><span>Nome <em>*</em></span><input class="input" name="nome" maxlength="120" value="${esc(d.nome || '')}"></label>
          ${aba === 'cargos' ? `<label class="f"><span>Departamento</span><select class="input" name="departamento_id"><option value="">—</option>${S.departamentos.map((dp) => `<option value="${dp.id}" ${dp.id === d.departamento_id ? 'selected' : ''}>${esc(dp.nome)}</option>`).join('')}</select></label>
            <label class="f"><span>Prazo para preenchimento (SLA, em dias) <em>*</em></span><input class="input" type="number" min="1" max="365" name="sla_dias" value="${esc(d.sla_dias)}"></label>
            <label class="f"><span>Descrição do cargo</span><textarea class="input" name="descricao" maxlength="2000">${esc(d.descricao || '')}</textarea></label>
            <label class="f"><span>Atividades padrão</span><textarea class="input" name="atividades" maxlength="4000">${esc(d.atividades || '')}</textarea></label>` : ''}
          <label class="check"><input type="checkbox" name="ativo" ${d.ativo ? 'checked' : ''}> Ativo</label>
          <div class="actions"><button type="button" class="btn" data-fechar>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></form>`);
      const f = $('#f-cad', m.el);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dados = { nome: f.nome.value.trim(), ativo: f.ativo.checked };
        if (!dados.nome) return toast('Informe o nome.', true);
        if (aba === 'cargos') {
          dados.departamento_id = f.departamento_id.value || null;
          dados.sla_dias = Math.min(365, Math.max(1, parseInt(f.sla_dias.value, 10) || 30));
          dados.descricao = f.descricao.value.trim() || null; dados.atividades = f.atividades.value.trim() || null;
        }
        const solta = travar($('button[type=submit]', f), 'Salvando…');
        const { error } = x ? await sb.from(aba).update(dados).eq('id', x.id) : await sb.from(aba).insert(dados);
        solta();
        if (error) return toast(/duplicate|unique/i.test(error.message) ? 'Já existe um item com esse nome.' : erroAmigavel(error), true);
        m.fechar(); toast('Salvo.'); telaCadastros(params);
      });
    };
    on(view(), '[data-novo]', 'click', () => abrir(null));
    on(view(), '[data-i]', 'click', (e) => { e.preventDefault(); abrir(lista.find((x) => x.id === e.currentTarget.dataset.i)); });
  }

  // ------------------------------------------------------------------ administração: documentos
  async function telaDocumentos(params) {
    if (!isMaster()) return semAcesso();
    carregando();
    await carregarCadastros();
    const cat = params.get('c') || '';
    let q = sb.from('vaga_anexos').select('*, vagas(numero,cargo_nome,status)');
    if (cat) q = q.eq('categoria', cat);
    const [ru, rv, rl] = await Promise.all([sb.rpc('uso_documentos'), sb.rpc('anexos_vencidos'), q.order('criado_em', { ascending: false }).limit(300)]);
    const uso = ru.data || { total: 0, qtd: 0, por_categoria: {} };
    const venc = rv.data || [];
    const docs = rl.data || [];
    const pct = Math.min(100, (Number(uso.total) / LIMITE_TOTAL) * 100);
    const pctTxt = pct < 0.1 && uso.total > 0 ? '< 0,1' : pct.toFixed(1).replace('.', ',');
    const meses = mesesRetencao();
    const auto = S.config.retencao_automatica !== false;
    const porCat = Object.entries(uso.por_categoria || {}).sort((a, b) => b[1] - a[1]);
    view().innerHTML = `<div class="page" style="max-width:900px"><div class="page-head"><div><h1>Documentos</h1><small>${uso.qtd} arquivo(s) guardado(s)</small></div></div>
      <div class="grid two" style="align-items:start">
        <div class="card"><h2 style="margin-bottom:10px">Espaço usado</h2>
          <div class="meter ${pct >= 80 ? 'alert' : ''}"><i style="width:${Math.max(pct, uso.total ? 1 : 0)}%"></i></div>
          <p style="margin:8px 0 12px"><b>${fmtTam(Number(uso.total))}</b> de 1 GB (${pctTxt}%)${pct >= 80 ? ' · <span class="overdue">perto do limite gratuito</span>' : ''}</p>
          ${porCat.length ? `<div class="bars">${porCat.map(([k, b]) => `<div class="bar-row"><span class="lbl">${esc(CATS[k]?.l || k)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${(b / Math.max(1, porCat[0][1])) * 100}%"></div></div><span class="v" style="min-width:60px">${fmtTam(b)}</span></div>`).join('')}</div>` : '<p class="muted" style="margin:0">Nenhum documento ainda.</p>'}
        </div>
        <div class="card"><h2 style="margin-bottom:10px">Retenção (LGPD)</h2>
          <form id="f-ret" class="form-grid">
            <label class="f"><span>Excluir currículos e pareceres de não contratados após</span>
              <div style="display:flex;gap:8px;align-items:center"><input class="input" type="number" name="meses" min="1" max="60" value="${meses}" style="max-width:100px" inputmode="numeric"><span>meses do encerramento da vaga</span></div></label>
            <label class="check"><input type="checkbox" name="auto" ${auto ? 'checked' : ''}> Exclusão automática (roda quando um Master abre o app)</label>
            <div class="hint" style="margin-top:-6px">Documentos marcados como do contratado (★), de admissão, descrição de cargo e outros não são excluídos.</div>
            <div class="actions" style="justify-content:flex-end"><button class="btn primary sm" type="submit">Salvar</button></div></form></div>
      </div>
      <div class="card" style="margin-top:12px"><div class="section-title"><h2>Retenção vencida</h2>
        ${venc.length ? `<button class="btn sm danger" data-purgar>Excluir agora (${venc.length})</button>` : ''}</div>
        ${venc.length ? venc.slice(0, 30).map((a) => `<div class="list-row"><span class="doc-ic">${I.doc}</span><div class="grow"><b class="doc-name">${esc(a.nome)}</b><br>
          <small>${esc(CATS[a.categoria]?.l || a.categoria)} · ${esc(a.numero)} · vaga encerrada em ${fmtData(a.encerrada_em)}</small></div></div>`).join('') + (venc.length > 30 ? `<p class="muted">+ ${venc.length - 30} documento(s)</p>` : '')
          : '<p class="muted" style="margin:0">Nenhum documento com prazo vencido.</p>'}</div>
      <div class="card"><div class="section-title"><h2>Todos os documentos</h2>
        <select class="input" id="fc" style="max-width:220px" aria-label="Filtrar tipo"><option value="">Todos os tipos</option>${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${cat === k ? 'selected' : ''}>${esc(c.l)}</option>`).join('')}</select></div>
        <input class="input" type="search" id="bd" placeholder="Buscar por arquivo, candidato ou nº da vaga" style="margin-bottom:8px" aria-label="Buscar documento">
        <div id="ld"></div></div></div>`;
    const el = view();
    const pintar = () => {
      const t = $('#bd').value.toLowerCase();
      const r = docs.filter((a) => !t || [a.nome, a.candidato, a.vagas?.numero, a.vagas?.cargo_nome].join(' ').toLowerCase().includes(t));
      $('#ld').innerHTML = r.length ? r.map((a) => `<div class="list-row doc-row"><span class="doc-ic">${I.doc}</span><div class="grow"><b class="doc-name">${esc(a.nome)}</b><br>
          <small><span class="chip ${CATS[a.categoria]?.c || ''} plain">${esc(CATS[a.categoria]?.l || a.categoria)}</span> ${a.candidato ? esc(a.candidato) + ' · ' : ''}<a href="#/vaga/${esc(a.vaga_id)}">${esc(a.vagas?.numero || 'vaga')}</a> · ${fmtTam(a.tamanho)} · ${fmtData(a.criado_em)}</small></div>
          <div class="doc-act"><button class="btn sm" data-abrir="${esc(a.id)}">Abrir</button><button class="btn sm ghost danger" data-del-anexo="${esc(a.id)}" aria-label="Excluir">✕</button></div></div>`).join('')
        : '<div class="empty"><b>Nenhum documento</b></div>';
      on($('#ld'), '[data-abrir]', 'click', (e) => abrirAnexo(docs.find((x) => x.id === e.currentTarget.dataset.abrir)));
      on($('#ld'), '[data-del-anexo]', 'click', async (e) => { if (await excluirAnexo(docs.find((x) => x.id === e.currentTarget.dataset.delAnexo))) telaDocumentos(params); });
    };
    $('#bd').addEventListener('input', pintar);
    $('#fc').addEventListener('change', (e) => { location.hash = '#/admin/documentos' + (e.target.value ? '?c=' + e.target.value : ''); });
    $('#f-ret').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fr = e.currentTarget;
      const n = parseInt(fr.meses.value, 10);
      if (!(n >= 1 && n <= 60)) return toast('Informe de 1 a 60 meses.', true);
      const solta = travar($('button[type=submit]', fr), 'Salvando…');
      const { error } = await sb.from('configuracoes').upsert([
        { chave: 'retencao_meses', valor: n, atualizado_em: new Date().toISOString() },
        { chave: 'retencao_automatica', valor: fr.auto.checked, atualizado_em: new Date().toISOString() }], { onConflict: 'chave' });
      solta();
      if (error) return toast(erroAmigavel(error), true);
      toast('Retenção atualizada.'); telaDocumentos(params);
    });
    on(el, '[data-purgar]', 'click', async () => {
      if (!(await confirmar('Excluir documentos vencidos', `${venc.length} documento(s) de candidatos não contratados serão excluídos definitivamente, conforme a política de retenção.`, 'Excluir', true))) return;
      const n = await purgarVencidos(venc);
      toast(`${n} documento(s) excluído(s).`, n < venc.length);
      telaDocumentos(params);
    });
    pintar();
  }

  // ------------------------------------------------------------------ auditoria
  async function telaAuditoria(params) {
    if (!isMaster()) return semAcesso();
    carregando();
    const tab = params.get('t') || '';
    let q = sb.from('auditoria').select('*').order('criado_em', { ascending: false }).limit(300);
    if (tab) q = q.eq('tabela', tab);
    const { data } = await q;
    const ls = data || [];
    const NOMES = { vagas: 'Vagas', vaga_remuneracao: 'Remuneração', perfis: 'Usuários', unidades: 'Concessionárias', cargos: 'Cargos', departamentos: 'Departamentos', beneficios: 'Benefícios', vaga_anexos: 'Documentos', configuracoes: 'Configurações',
      vaga_admissoes: 'Checklist de admissão', solicitacoes: 'Outras solicitações', solicitacao_salarios: 'Salários (solicitações)' };
    const ACAO = { INSERT: ['Criou', 'ok'], UPDATE: ['Alterou', 'info'], DELETE: ['Excluiu', 'bad'] };
    view().innerHTML = `<div class="page" style="max-width:900px"><div class="page-head"><div><h1>Auditoria</h1><small>Registro permanente de alterações (últimos 300)</small></div>
      <select class="input" id="ft" style="max-width:220px" aria-label="Filtrar"><option value="">Tudo</option>${Object.entries(NOMES).map(([k, l]) => `<option value="${k}" ${tab === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="card">${ls.length ? ls.map((a, i) => `<a class="list-row" href="#" data-a="${i}" style="color:inherit"><div class="grow">
        <span class="chip ${ACAO[a.acao]?.[1] || ''}">${ACAO[a.acao]?.[0] || esc(a.acao)}</span> <b>${esc(NOMES[a.tabela] || a.tabela)}</b>
        ${a.dados?.numero || a.dados?.depois?.numero ? ' · ' + esc(a.dados.numero || a.dados.depois.numero) : a.dados?.nome || a.dados?.depois?.nome ? ' · ' + esc(a.dados.nome || a.dados.depois.nome) : ''}
        <br><small>${fmtDH(a.criado_em)} · ${esc(a.usuario_nome || 'Sistema')}</small></div>›</a>`).join('') : '<div class="empty"><b>Nenhum registro</b></div>'}</div></div>`;
    $('#ft').addEventListener('change', (e) => { location.hash = '#/auditoria' + (e.target.value ? '?t=' + e.target.value : ''); });
    on(view(), '[data-a]', 'click', (e) => {
      e.preventDefault();
      const a = ls[+e.currentTarget.dataset.a];
      let corpo;
      if (a.acao === 'UPDATE' && a.dados?.antes) {
        const mud = Object.keys(a.dados.depois || {}).filter((k) => JSON.stringify(a.dados.antes[k]) !== JSON.stringify(a.dados.depois[k]) && k !== 'atualizado_em');
        corpo = mud.length ? `<table style="width:100%;font-size:13px;border-collapse:collapse">${mud.map((k) => `<tr><td style="padding:6px 4px;border-bottom:1px solid var(--line);font-weight:600;vertical-align:top">${esc(k)}</td>
          <td style="padding:6px 4px;border-bottom:1px solid var(--line);color:var(--bad);word-break:break-word">${esc(JSON.stringify(a.dados.antes[k]))}</td>
          <td style="padding:6px 4px;border-bottom:1px solid var(--line);color:var(--ok);word-break:break-word">${esc(JSON.stringify(a.dados.depois[k]))}</td></tr>`).join('')}</table>` : '<p class="muted">Sem diferenças relevantes.</p>';
      } else corpo = `<pre class="json">${esc(JSON.stringify(a.dados, null, 2))}</pre>`;
      modal(`<h2>${esc(ACAO[a.acao]?.[0] || a.acao)} · ${esc(NOMES[a.tabela] || a.tabela)}</h2><p class="muted" style="margin-top:0">${fmtDH(a.criado_em)} · ${esc(a.usuario_nome || 'Sistema')}</p>${corpo}
        <div class="actions"><button class="btn primary" data-fechar>Fechar</button></div>`, { wide: true });
    });
  }

  iniciar();
})();
