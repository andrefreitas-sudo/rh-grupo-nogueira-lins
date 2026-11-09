-- =====================================================================
-- RH Grupo Nogueira Lins — Módulo de Vagas
-- Script completo do banco (Supabase / Postgres)
-- Rodar inteiro no SQL Editor do Supabase. Pode ser executado de novo
-- com segurança (usa IF NOT EXISTS / OR REPLACE onde possível).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. CADASTROS
-- ---------------------------------------------------------------------
create table if not exists public.unidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade text,
  marca text,
  razao_social text,
  cnpj text,
  endereco text,
  telefone text,
  gerente_nome text,
  email text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.unidades add column if not exists razao_social text;
alter table public.unidades add column if not exists cnpj text;
alter table public.unidades add column if not exists endereco text;
alter table public.unidades add column if not exists telefone text;
alter table public.unidades add column if not exists gerente_nome text;
alter table public.unidades add column if not exists email text;

create table if not exists public.departamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true
);

create table if not exists public.cargos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  departamento_id uuid references public.departamentos(id),
  descricao text,
  atividades text,
  sla_dias int not null default 30 check (sla_dias between 1 and 365),
  ativo boolean not null default true
);

create table if not exists public.beneficios (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true
);

-- ---------------------------------------------------------------------
-- 2. USUÁRIOS E PERMISSÕES
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete restrict,
  nome text not null,
  email text not null,
  perfil text not null default 'gestor'
    check (perfil in ('master','rh','aprovador','gestor','visualizador')),
  ativo boolean not null default true,
  deve_trocar_senha boolean not null default true,
  todas_unidades boolean not null default false,
  unidades uuid[] not null default '{}',
  escopo text not null default 'proprias' check (escopo in ('proprias','unidade')),
  pode_criar boolean not null default false,
  pode_aprovar boolean not null default false,
  pode_alterar_status boolean not null default false,
  pode_comentar boolean not null default true,
  pode_exportar boolean not null default false,
  ver_salario boolean not null default false,
  ver_confidencial boolean not null default false,
  ver_internos boolean not null default false,
  ver_sensiveis boolean not null default false,
  gerenciar_cadastros boolean not null default false,
  ultimo_acesso timestamptz,
  criado_em timestamptz not null default now()
);

alter table public.perfis add column if not exists ver_sensiveis boolean not null default false;

-- Diretor responsável pela aprovação de cada concessionária (REV.03)
alter table public.unidades add column if not exists aprovador_id uuid references public.perfis(id) on delete set null;
alter table public.unidades add column if not exists aprovador_nome text;

-- Configurações gerais (retenção de documentos etc.)
create table if not exists public.configuracoes (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);
insert into public.configuracoes (chave, valor) values
  ('retencao_meses', '6'::jsonb), ('retencao_automatica', 'true'::jsonb)
on conflict (chave) do nothing;

-- Usuário logado (ativo). Security definer para não depender do RLS.
create or replace function public.eu()
returns public.perfis
language sql stable security definer set search_path = public as $$
  select p.* from public.perfis p where p.id = auth.uid() and p.ativo
$$;

create or replace function public.e_master()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select perfil = 'master' from public.perfis where id = auth.uid() and ativo), false)
$$;

create or replace function public.acessa_unidade(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select perfil = 'master' or todas_unidades or u = any(unidades)
    from public.perfis where id = auth.uid() and ativo
  ), false)
$$;

-- ---------------------------------------------------------------------
-- 3. VAGAS
-- ---------------------------------------------------------------------
create table if not exists public.contadores (
  ano int primary key,
  ultimo int not null default 0
);

create table if not exists public.vagas (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  status text not null default 'rascunho' check (status in (
    'rascunho','aguardando_aprovacao','aprovada','devolvida','reprovada',
    'em_divulgacao','triagem','entrevistas','proposta_enviada','admissao',
    'concluida','suspensa','cancelada')),
  solicitante_id uuid not null references public.perfis(id),
  solicitante_nome text,
  -- Identificação
  unidade_id uuid not null references public.unidades(id),
  departamento_id uuid references public.departamentos(id),
  centro_custo text,
  -- Cargo
  cargo_id uuid references public.cargos(id),
  cargo_nome text not null,
  nivel text check (nivel in ('Júnior','Pleno','Sênior','Não se aplica')),
  quantidade int not null default 1 check (quantidade between 1 and 50),
  tipo_contratacao text check (tipo_contratacao in ('CLT','Estágio','Aprendiz','Temporário')),
  jornada text,
  trabalha_sabado boolean default false,
  -- Motivo
  motivo text check (motivo in ('aumento_quadro','substituicao','afastamento','nova_unidade')),
  justificativa text,
  previsto_orcamento boolean,
  substituido_nome text,
  motivo_desligamento text,
  data_saida date,
  afastamento_inicio date,
  afastamento_fim date,
  confidencial boolean not null default false,
  -- Perfil
  escolaridade text,
  cursos text,
  cnh_obrigatoria boolean default false,
  cnh_categoria text,
  experiencia_anos numeric(4,1),
  experiencia_segmento text,
  conhecimentos text,
  competencias text,
  atividades text,
  -- Processo
  data_inicio_ideal date,
  urgencia text not null default 'normal' check (urgencia in ('normal','alta','critica')),
  recrutamento_interno boolean default false,
  indicacoes text,
  entrevistadores text,
  observacoes text,
  -- Controle
  sla_dias int,
  prazo_sla date,
  enviado_em timestamptz,
  aprovador_id uuid references public.perfis(id),
  aprovador_nome text,
  aprovado_em timestamptz,
  contratado_nome text,
  data_admissao date,
  concluido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- limites de tamanho (anti-abuso)
  constraint vagas_textos_ck check (
    coalesce(length(justificativa),0) <= 2000 and coalesce(length(atividades),0) <= 4000 and
    coalesce(length(observacoes),0) <= 2000 and coalesce(length(conhecimentos),0) <= 2000 and
    coalesce(length(competencias),0) <= 2000 and coalesce(length(cursos),0) <= 1000 and
    coalesce(length(indicacoes),0) <= 1000 and coalesce(length(entrevistadores),0) <= 500)
);
alter table public.vagas add column if not exists email_organograma_em timestamptz;
create index if not exists vagas_unidade_idx on public.vagas(unidade_id);
create index if not exists vagas_status_idx on public.vagas(status);
create index if not exists vagas_solic_idx on public.vagas(solicitante_id);

-- Remuneração em tabela separada: só quem tem "ver_salario" enxerga.
create table if not exists public.vaga_remuneracao (
  vaga_id uuid primary key references public.vagas(id) on delete cascade,
  salario_min numeric(12,2),
  salario_max numeric(12,2),
  tem_variavel boolean default false,
  regra_variavel text check (coalesce(length(regra_variavel),0) <= 1000),
  beneficios text[] default '{}',
  beneficios_outros text check (coalesce(length(beneficios_outros),0) <= 500)
);

create table if not exists public.vaga_historico (
  id bigint generated always as identity primary key,
  vaga_id uuid not null references public.vagas(id) on delete cascade,
  status_de text,
  status_para text not null,
  comentario text,
  autor_id uuid references public.perfis(id),
  autor_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists hist_vaga_idx on public.vaga_historico(vaga_id);

create table if not exists public.vaga_comentarios (
  id bigint generated always as identity primary key,
  vaga_id uuid not null references public.vagas(id) on delete cascade,
  autor_id uuid not null references public.perfis(id) default auth.uid(),
  autor_nome text,
  texto text not null check (length(texto) between 1 and 2000),
  interno boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists com_vaga_idx on public.vaga_comentarios(vaga_id);

create table if not exists public.vaga_anexos (
  id uuid primary key default gen_random_uuid(),
  vaga_id uuid not null references public.vagas(id) on delete cascade,
  caminho text not null,
  nome text not null,
  tamanho int,
  categoria text not null default 'outro',
  candidato text,
  contratado boolean not null default false,
  autor_id uuid references public.perfis(id) default auth.uid(),
  autor_nome text,
  criado_em timestamptz not null default now()
);
alter table public.vaga_anexos add column if not exists categoria text not null default 'outro';
alter table public.vaga_anexos add column if not exists candidato text;
alter table public.vaga_anexos add column if not exists contratado boolean not null default false;
alter table public.vaga_anexos add column if not exists autor_nome text;
do $$ begin
  alter table public.vaga_anexos add constraint vaga_anexos_cat_ck
    check (categoria in ('curriculo','parecer_psicologico','admissao','descricao_cargo','outro'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.vaga_anexos add constraint vaga_anexos_tam_ck
    check (coalesce(length(candidato),0) <= 120 and length(nome) <= 200 and coalesce(tamanho,0) between 0 and 5242880);
exception when duplicate_object then null; end $$;
create unique index if not exists anexos_caminho_uk on public.vaga_anexos(caminho);
create index if not exists anexos_vaga_idx on public.vaga_anexos(vaga_id);

create table if not exists public.notificacoes (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.perfis(id) on delete cascade,
  vaga_id uuid references public.vagas(id) on delete cascade,
  texto text not null,
  lida boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists notif_user_idx on public.notificacoes(usuario_id, lida);

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text,
  acao text not null,
  usuario_id uuid,
  usuario_nome text,
  dados jsonb,
  criado_em timestamptz not null default now()
);

-- Checklist de documentos da admissão (um registro por pessoa admitida) — REV.03
create table if not exists public.vaga_admissoes (
  id uuid primary key default gen_random_uuid(),
  vaga_id uuid not null references public.vagas(id) on delete cascade,
  candidato text not null check (length(trim(candidato)) between 1 and 120),
  itens jsonb not null default '{}'::jsonb check (jsonb_typeof(itens) = 'object' and pg_column_size(itens) < 4000),
  adiantamento boolean,
  data_admissao date,
  atualizado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists admissoes_vaga_idx on public.vaga_admissoes(vaga_id);

-- Documento anexado a partir de um item do checklist
alter table public.vaga_anexos add column if not exists admissao_id uuid references public.vaga_admissoes(id) on delete set null;
alter table public.vaga_anexos add column if not exists item_admissao text check (coalesce(length(item_admissao),0) <= 40);

-- Outras solicitações (alteração de cargo/salário e solicitações gerais) — REV.03
create table if not exists public.contadores_sol (
  ano int primary key,
  ultimo int not null default 0
);

create table if not exists public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  tipo text not null check (tipo in ('alteracao_cargo','geral')),
  status text not null default 'aguardando_aprovacao' check (status in (
    'aguardando_aprovacao','devolvida','reprovada','pendente_rh','em_andamento','concluida','cancelada')),
  solicitante_id uuid not null references public.perfis(id),
  solicitante_nome text,
  unidade_id uuid not null references public.unidades(id),
  -- Alteração de cargo e/ou salário
  colaborador_nome text,
  cargo_atual text,
  cargo_novo text,
  altera_centro_custo boolean,
  centro_custo_novo text,
  -- Solicitação geral
  titulo text,
  -- Comum
  motivo text,
  aprovador_id uuid references public.perfis(id),
  aprovador_nome text,
  aprovado_em timestamptz,
  concluido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint solicitacoes_textos_ck check (
    coalesce(length(colaborador_nome),0) <= 120 and coalesce(length(cargo_atual),0) <= 120 and
    coalesce(length(cargo_novo),0) <= 120 and coalesce(length(centro_custo_novo),0) <= 60 and
    coalesce(length(titulo),0) <= 150 and coalesce(length(motivo),0) <= 2000)
);
create index if not exists sol_unidade_idx on public.solicitacoes(unidade_id);
create index if not exists sol_status_idx on public.solicitacoes(status);

-- Salários da alteração: tabela separada, como na vaga
create table if not exists public.solicitacao_salarios (
  solicitacao_id uuid primary key references public.solicitacoes(id) on delete cascade,
  salario_atual numeric(12,2) check (salario_atual is null or salario_atual >= 0),
  salario_novo numeric(12,2) check (salario_novo is null or salario_novo >= 0)
);

create table if not exists public.solicitacao_historico (
  id bigint generated always as identity primary key,
  solicitacao_id uuid not null references public.solicitacoes(id) on delete cascade,
  status_de text,
  status_para text not null,
  comentario text,
  autor_id uuid references public.perfis(id),
  autor_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists solhist_idx on public.solicitacao_historico(solicitacao_id);

alter table public.notificacoes add column if not exists solicitacao_id uuid references public.solicitacoes(id) on delete cascade;

-- ---------------------------------------------------------------------
-- 4. REGRA CENTRAL DE VISIBILIDADE
-- ---------------------------------------------------------------------
-- Regra aplicada sobre os dados da própria linha (funciona também no INSERT ... RETURNING)
create or replace function public.pode_ver(p_unidade uuid, p_conf boolean, p_status text, p_solic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select
      me.perfil = 'master'
      or p_solic = me.id
      or (
        (me.todas_unidades or p_unidade = any(me.unidades))
        and (me.escopo = 'unidade' or me.pode_aprovar or me.pode_alterar_status)
        and (not coalesce(p_conf, false) or me.ver_confidencial)
        and (p_status <> 'rascunho')
      )
      -- Diretor aprovador da concessionária enxerga as vagas dela (REV.03)
      or (p_status <> 'rascunho' and exists (
        select 1 from public.unidades un where un.id = p_unidade and un.aprovador_id = me.id))
    from public.perfis me
    where me.id = auth.uid() and me.ativo
  ), false)
$$;

-- Quem aprova na concessionária: o diretor definido no cadastro dela; se não houver
-- diretor definido, quem tem "pode_aprovar" na unidade. Master sempre pode.
create or replace function public.pode_aprovar_unidade(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select me.perfil = 'master' or case
      when un.aprovador_id is not null then un.aprovador_id = me.id
      else me.pode_aprovar and (me.todas_unidades or u = any(me.unidades)) end
    from public.perfis me, public.unidades un
    where me.id = auth.uid() and me.ativo and un.id = u
  ), false)
$$;

-- RH que conduz a vaga (checklist de admissão)
create or replace function public.pode_conduzir_vaga(v_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.pode_ver_vaga(v.id) and (me.perfil = 'master'
      or (me.pode_alterar_status and (me.todas_unidades or v.unidade_id = any(me.unidades))))
    from public.vagas v, public.perfis me
    where v.id = v_id and me.id = auth.uid() and me.ativo), false)
$$;

-- Mesma regra a partir do id (usada por histórico, comentários, anexos, remuneração)
create or replace function public.pode_ver_vaga(v_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.pode_ver(v.unidade_id, v.confidencial, v.status, v.solicitante_id)
                   from public.vagas v where v.id = v_id), false)
$$;

-- Documentos sensíveis (parecer psicológico): só Master ou quem tem "ver_sensiveis"
create or replace function public.ve_sensiveis()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select perfil = 'master' or ver_sensiveis from public.perfis where id = auth.uid() and ativo), false)
$$;

-- Quem pode anexar: solicitante, RH/aprovador da unidade, Master
create or replace function public.pode_anexar(v_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.pode_ver_vaga(v.id) and (
      me.perfil = 'master' or v.solicitante_id = me.id
      or ((me.pode_alterar_status or me.pode_aprovar) and (me.todas_unidades or v.unidade_id = any(me.unidades))))
    from public.vagas v, public.perfis me
    where v.id = v_id and me.id = auth.uid() and me.ativo), false)
$$;

-- Leitura do arquivo segue a regra do registro do documento (vaga + categoria)
create or replace function public.pode_ver_anexo(p_caminho text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.pode_ver_vaga(a.vaga_id)
                          and (a.categoria <> 'parecer_psicologico' or public.ve_sensiveis())
                   from public.vaga_anexos a where a.caminho = p_caminho), false)
$$;

-- Envio só para um caminho registrado antes pelo próprio usuário
create or replace function public.anexo_registrado(p_caminho text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vaga_anexos a where a.caminho = p_caminho and a.autor_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- 5. GATILHOS
-- ---------------------------------------------------------------------
-- Numeração, solicitante, SLA e proteção de campos
create or replace function public.vagas_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; a int; me public.perfis;
begin
  if tg_op = 'INSERT' then
    select * into me from public.perfis where id = auth.uid();
    a := extract(year from now())::int;
    insert into public.contadores(ano, ultimo) values (a, 1)
      on conflict (ano) do update set ultimo = contadores.ultimo + 1
      returning ultimo into n;
    new.numero := 'VAG-' || a || '-' || lpad(n::text, 4, '0');
    new.solicitante_id := auth.uid();
    new.solicitante_nome := me.nome;
    new.status := 'rascunho';
    new.aprovador_id := null; new.aprovado_em := null; new.enviado_em := null;
    new.concluido_em := null; new.prazo_sla := null;
    select sla_dias into new.sla_dias from public.cargos where id = new.cargo_id;
    if new.sla_dias is null then new.sla_dias := 30; end if;
    return new;
  end if;

  -- UPDATE
  if coalesce(current_setting('app.via_rpc', true), '') <> '1' then
    if new.status is distinct from old.status
       or new.numero is distinct from old.numero
       or new.solicitante_id is distinct from old.solicitante_id
       or new.aprovador_id is distinct from old.aprovador_id
       or new.aprovado_em is distinct from old.aprovado_em
       or new.prazo_sla is distinct from old.prazo_sla
       or new.concluido_em is distinct from old.concluido_em
       or new.enviado_em is distinct from old.enviado_em
       or new.sla_dias is distinct from old.sla_dias then
      raise exception 'Alteração não permitida por esta via.';
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists trg_vagas_before on public.vagas;
create trigger trg_vagas_before before insert or update on public.vagas
  for each row execute function public.vagas_before();

-- Nome do autor em comentários
create or replace function public.comentario_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.autor_id := auth.uid();
  select nome into new.autor_nome from public.perfis where id = auth.uid();
  new.criado_em := now();
  return new;
end $$;
drop trigger if exists trg_com_before on public.vaga_comentarios;
create trigger trg_com_before before insert on public.vaga_comentarios
  for each row execute function public.comentario_before();

-- Anexos: autor automático, caminho preso à pasta da vaga, campos-chave imutáveis
create or replace function public.anexo_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.autor_id := auth.uid();
    select nome into new.autor_nome from public.perfis where id = auth.uid();
    new.criado_em := now();
    if new.caminho is null or position(new.vaga_id::text || '/' in new.caminho) <> 1
       or new.caminho like '%..%' or new.caminho !~ '^[0-9a-f-]+/[0-9a-f-]+\.[a-z0-9]{1,5}$' then
      raise exception 'Caminho de arquivo inválido.';
    end if;
  else
    if new.caminho <> old.caminho or new.vaga_id <> old.vaga_id
       or new.autor_id is distinct from old.autor_id or new.tamanho is distinct from old.tamanho then
      raise exception 'Alteração não permitida.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_anexo_before on public.vaga_anexos;
create trigger trg_anexo_before before insert or update on public.vaga_anexos
  for each row execute function public.anexo_before();

-- Auditoria genérica (insert-only)
create or replace function public.auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare reg jsonb; rid text;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'perfis'
     and (to_jsonb(new) - 'ultimo_acesso') = (to_jsonb(old) - 'ultimo_acesso') then
    return null; -- registro de acesso não polui a auditoria
  end if;
  if tg_op = 'DELETE' then reg := to_jsonb(old); else reg := to_jsonb(new); end if;
  rid := coalesce(reg->>'id', reg->>'vaga_id', reg->>'solicitacao_id', reg->>'chave');
  insert into public.auditoria(tabela, registro_id, acao, usuario_id, usuario_nome, dados)
  values (tg_table_name, rid, tg_op, auth.uid(),
          (select nome from public.perfis where id = auth.uid()),
          case when tg_op = 'UPDATE'
               then jsonb_build_object('antes', to_jsonb(old), 'depois', to_jsonb(new))
               else reg end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['vagas','vaga_remuneracao','perfis','unidades','departamentos','cargos','beneficios','vaga_anexos','configuracoes']
  loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I
                    for each row execute function public.auditar()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6. NOTIFICAÇÕES (interno)
-- ---------------------------------------------------------------------
create or replace function public.notificar(p_vaga uuid, p_texto text, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.vagas;
begin
  select * into v from public.vagas where id = p_vaga;
  if p_tipo = 'solicitante' then
    if v.solicitante_id is distinct from auth.uid() then
      insert into public.notificacoes(usuario_id, vaga_id, texto) values (v.solicitante_id, v.id, p_texto);
    end if;
  else
    insert into public.notificacoes(usuario_id, vaga_id, texto)
    select p.id, v.id, p_texto from public.perfis p
    where p.ativo and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')
      and (p.perfil = 'master' or p.todas_unidades or v.unidade_id = any(p.unidades))
      and (not v.confidencial or p.ver_confidencial or p.perfil = 'master')
      and p_tipo = 'rh' and p.pode_alterar_status;
    -- Aprovação: só o diretor da concessionária; sem diretor definido, quem tem "pode_aprovar"
    if p_tipo = 'aprovadores' then
      insert into public.notificacoes(usuario_id, vaga_id, texto)
      select p.id, v.id, p_texto from public.perfis p, public.unidades un
      where un.id = v.unidade_id and p.ativo
        and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')
        and case when un.aprovador_id is not null then p.id = un.aprovador_id
                 else (p.pode_aprovar or p.perfil = 'master')
                      and (p.perfil = 'master' or p.todas_unidades or v.unidade_id = any(p.unidades))
                      and (not v.confidencial or p.ver_confidencial or p.perfil = 'master') end;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7. MUDANÇA DE STATUS (única porta de entrada)
-- ---------------------------------------------------------------------
create or replace function public.mudar_status(
  p_vaga uuid, p_status text, p_comentario text default null,
  p_contratado text default null, p_data_admissao date default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.vagas; me public.perfis;
  etapas_rh text[] := array['em_divulgacao','triagem','entrevistas','proposta_enviada','admissao','concluida','suspensa'];
  ok boolean := false;
  rotulo text;
begin
  select * into me from public.perfis where id = auth.uid() and ativo;
  if me.id is null then raise exception 'Sessão inválida.'; end if;
  select * into v from public.vagas where id = p_vaga for update;
  if v.id is null or not public.pode_ver_vaga(p_vaga) then raise exception 'Vaga não encontrada.'; end if;
  if p_status = v.status then raise exception 'A vaga já está neste status.'; end if;
  if v.status in ('concluida','cancelada','reprovada') then
    raise exception 'Vaga encerrada não pode mudar de status.';
  end if;

  if p_status = 'aguardando_aprovacao' then
    ok := v.status in ('rascunho','devolvida') and (v.solicitante_id = me.id or me.perfil = 'master');
  elsif p_status in ('aprovada','devolvida','reprovada') then
    ok := v.status = 'aguardando_aprovacao' and public.pode_aprovar_unidade(v.unidade_id);
  elsif p_status = any(etapas_rh) then
    ok := (v.status = 'aprovada' or v.status = any(etapas_rh))
          and (me.perfil = 'master' or (me.pode_alterar_status and public.acessa_unidade(v.unidade_id)));
  elsif p_status = 'cancelada' then
    ok := me.perfil = 'master'
          or (me.pode_alterar_status and public.acessa_unidade(v.unidade_id))
          or (v.solicitante_id = me.id and v.status in ('rascunho','aguardando_aprovacao','devolvida'));
  end if;
  if not ok then raise exception 'Você não tem permissão para esta mudança de status.'; end if;

  if p_status in ('devolvida','reprovada','suspensa','cancelada') and coalesce(trim(p_comentario),'') = '' then
    raise exception 'Informe o motivo.';
  end if;
  if p_status = 'concluida' and coalesce(trim(p_contratado),'') = '' then
    raise exception 'Informe o nome do(s) contratado(s).';
  end if;

  perform set_config('app.via_rpc', '1', true);
  update public.vagas set
    status = p_status,
    enviado_em = case when p_status = 'aguardando_aprovacao' then now() else enviado_em end,
    aprovador_id = case when p_status in ('aprovada','reprovada','devolvida') then me.id else aprovador_id end,
    aprovador_nome = case when p_status in ('aprovada','reprovada','devolvida') then me.nome else aprovador_nome end,
    aprovado_em = case when p_status = 'aprovada' then now() else aprovado_em end,
    prazo_sla = case when p_status = 'aprovada' then (now() + make_interval(days => coalesce(sla_dias,30)))::date else prazo_sla end,
    contratado_nome = case when p_status = 'concluida' then left(p_contratado, 300) else contratado_nome end,
    data_admissao = case when p_status = 'concluida' then p_data_admissao else data_admissao end,
    concluido_em = case when p_status in ('concluida','cancelada','reprovada') then now() else concluido_em end
  where id = p_vaga;
  perform set_config('app.via_rpc', '', true);

  -- Documentos do(s) contratado(s) ficam protegidos da retenção
  if p_status = 'concluida' then
    update public.vaga_anexos set contratado = true
     where vaga_id = p_vaga and coalesce(trim(candidato), '') <> ''
       and position(lower(trim(candidato)) in lower(p_contratado)) > 0;
  end if;

  insert into public.vaga_historico(vaga_id, status_de, status_para, comentario, autor_id, autor_nome)
  values (p_vaga, v.status, p_status, nullif(left(trim(coalesce(p_comentario,'')), 2000), ''), me.id, me.nome);

  rotulo := v.numero || ' · ' || v.cargo_nome;
  if p_status = 'aguardando_aprovacao' then
    perform public.notificar(p_vaga, 'Vaga aguardando sua aprovação: ' || rotulo, 'aprovadores');
  elsif p_status = 'aprovada' then
    perform public.notificar(p_vaga, 'Vaga aprovada: ' || rotulo, 'solicitante');
    perform public.notificar(p_vaga, 'Nova vaga aprovada para conduzir: ' || rotulo, 'rh');
  else
    perform public.notificar(p_vaga, case p_status
      when 'devolvida' then 'Vaga devolvida para ajuste: '
      when 'reprovada' then 'Vaga reprovada: '
      when 'em_divulgacao' then 'Vaga em divulgação: '
      when 'triagem' then 'Vaga em triagem de candidatos: '
      when 'entrevistas' then 'Vaga em fase de entrevistas: '
      when 'proposta_enviada' then 'Proposta enviada ao candidato: '
      when 'admissao' then 'Admissão em andamento: '
      when 'concluida' then 'Vaga concluída: '
      when 'suspensa' then 'Vaga suspensa: '
      when 'cancelada' then 'Vaga cancelada: '
      else 'Status atualizado: ' end || rotulo, 'solicitante');
  end if;
end $$;

-- Marca troca de senha concluída e registra acesso
create or replace function public.senha_trocada()
returns void language sql security definer set search_path = public as $$
  update public.perfis set deve_trocar_senha = false where id = auth.uid();
$$;
create or replace function public.registrar_acesso()
returns void language sql security definer set search_path = public as $$
  update public.perfis set ultimo_acesso = now() where id = auth.uid();
$$;

-- Retenção (LGPD): currículos e pareceres de não contratados, X meses após o encerramento
create or replace function public.anexos_vencidos()
returns table(id uuid, caminho text, nome text, categoria text, numero text, encerrada_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare meses int;
begin
  if not public.e_master() then raise exception 'Acesso negado.'; end if;
  select (c.valor #>> '{}')::int into meses from public.configuracoes c where c.chave = 'retencao_meses';
  meses := greatest(1, least(coalesce(meses, 6), 120));
  return query
    select a.id, a.caminho, a.nome, a.categoria, v.numero, v.concluido_em
    from public.vaga_anexos a join public.vagas v on v.id = a.vaga_id
    where a.categoria in ('curriculo', 'parecer_psicologico') and not a.contratado
      and v.status in ('concluida', 'cancelada', 'reprovada') and v.concluido_em is not null
      and v.concluido_em < now() - make_interval(months => meses)
    order by v.concluido_em;
end $$;

-- Espaço usado pelos documentos (somente Master)
create or replace function public.uso_documentos()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.e_master() then raise exception 'Acesso negado.'; end if;
  return (select jsonb_build_object(
    'total', coalesce(sum(a.tamanho), 0), 'qtd', count(*),
    'por_categoria', coalesce((select jsonb_object_agg(x.categoria, x.s) from
       (select b.categoria, sum(b.tamanho) s from public.vaga_anexos b group by b.categoria) x), '{}'::jsonb))
    from public.vaga_anexos a);
end $$;

-- Usuário só altera estes campos próprios via RPC; bloqueia o resto
revoke all on function public.notificar(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.unidades enable row level security;
alter table public.departamentos enable row level security;
alter table public.cargos enable row level security;
alter table public.beneficios enable row level security;
alter table public.perfis enable row level security;
alter table public.contadores enable row level security;
alter table public.vagas enable row level security;
alter table public.vaga_remuneracao enable row level security;
alter table public.vaga_historico enable row level security;
alter table public.vaga_comentarios enable row level security;
alter table public.vaga_anexos enable row level security;
alter table public.notificacoes enable row level security;
alter table public.auditoria enable row level security;
alter table public.configuracoes enable row level security;

-- Limpa políticas antigas (permite rodar o script de novo)
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Cadastros: leitura para usuários ativos; escrita para master ou gerenciar_cadastros
do $$
declare t text;
begin
  foreach t in array array['unidades','departamentos','cargos','beneficios'] loop
    execute format('create policy ler on public.%I for select to authenticated using ((select public.eu()).id is not null)', t);
    execute format('create policy gravar on public.%I for all to authenticated
      using (public.e_master() or coalesce((select public.eu()).gerenciar_cadastros,false))
      with check (public.e_master() or coalesce((select public.eu()).gerenciar_cadastros,false))', t);
  end loop;
end $$;

-- Perfis: cada um lê o seu; master lê e altera todos (criação via função de servidor)
create policy ler_proprio on public.perfis for select to authenticated
  using (id = auth.uid() or public.e_master());
create policy master_altera on public.perfis for update to authenticated
  using (public.e_master()) with check (public.e_master());

-- Vagas
create policy ver on public.vagas for select to authenticated
  using (public.pode_ver(unidade_id, confidencial, status, solicitante_id));
create policy criar on public.vagas for insert to authenticated
  with check (
    coalesce((select public.eu()).pode_criar, false) or public.e_master()
  ) ;
create policy editar on public.vagas for update to authenticated
  using (
    (solicitante_id = auth.uid() and status in ('rascunho','devolvida'))
    or public.e_master()
  )
  with check (public.acessa_unidade(unidade_id) or public.e_master());
create policy excluir_rascunho on public.vagas for delete to authenticated
  using (solicitante_id = auth.uid() and status = 'rascunho');

-- Unidade da vaga precisa estar no escopo de quem cria (checado também no insert)
create or replace function public.vagas_check_unidade()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.acessa_unidade(new.unidade_id) then
    raise exception 'Você não tem acesso a esta unidade.';
  end if;
  return new;
end $$;
drop trigger if exists trg_vagas_unidade on public.vagas;
create trigger trg_vagas_unidade before insert on public.vagas
  for each row execute function public.vagas_check_unidade();

-- Remuneração: só com ver_salario (ou o próprio solicitante)
create policy ver on public.vaga_remuneracao for select to authenticated
  using (public.pode_ver_vaga(vaga_id) and (
    public.e_master() or coalesce((select public.eu()).ver_salario,false)
    or exists (select 1 from public.vagas v where v.id = vaga_id and v.solicitante_id = auth.uid())
    or exists (select 1 from public.vagas v join public.unidades un on un.id = v.unidade_id
               where v.id = vaga_id and un.aprovador_id = auth.uid())));
create policy gravar on public.vaga_remuneracao for insert to authenticated
  with check (exists (select 1 from public.vagas v where v.id = vaga_id
    and (v.solicitante_id = auth.uid() or public.e_master()) and v.status in ('rascunho','devolvida')));
create policy alterar on public.vaga_remuneracao for update to authenticated
  using (exists (select 1 from public.vagas v where v.id = vaga_id
    and (v.solicitante_id = auth.uid() or public.e_master()) and v.status in ('rascunho','devolvida')));

-- Histórico: leitura de quem vê a vaga; escrita só pela função mudar_status
create policy ver on public.vaga_historico for select to authenticated
  using (public.pode_ver_vaga(vaga_id));

-- Comentários
create policy ver on public.vaga_comentarios for select to authenticated
  using (public.pode_ver_vaga(vaga_id) and (
    not interno or public.e_master() or coalesce((select public.eu()).ver_internos,false)));
create policy criar on public.vaga_comentarios for insert to authenticated
  with check (public.pode_ver_vaga(vaga_id)
    and (public.e_master() or coalesce((select public.eu()).pode_comentar,false))
    and (not interno or public.e_master() or coalesce((select public.eu()).ver_internos,false)));

-- Anexos: parecer psicológico só para quem tem permissão de documentos sensíveis
create policy ver on public.vaga_anexos for select to authenticated
  using (public.pode_ver_vaga(vaga_id) and (categoria <> 'parecer_psicologico' or public.ve_sensiveis()));
create policy criar on public.vaga_anexos for insert to authenticated
  with check (public.pode_anexar(vaga_id) and (categoria <> 'parecer_psicologico' or public.ve_sensiveis()));
create policy alterar on public.vaga_anexos for update to authenticated
  using (public.pode_anexar(vaga_id) and (categoria <> 'parecer_psicologico' or public.ve_sensiveis()))
  with check (public.pode_anexar(vaga_id) and (categoria <> 'parecer_psicologico' or public.ve_sensiveis()));
create policy excluir on public.vaga_anexos for delete to authenticated
  using ((autor_id = auth.uid() or public.e_master()) and public.pode_ver_vaga(vaga_id)
         and (categoria <> 'parecer_psicologico' or public.ve_sensiveis()));

-- Configurações: todos leem, só Master altera
create policy ler on public.configuracoes for select to authenticated
  using ((select public.eu()).id is not null);
create policy gravar on public.configuracoes for all to authenticated
  using (public.e_master()) with check (public.e_master());

-- Notificações: cada um só as suas
create policy ver on public.notificacoes for select to authenticated using (usuario_id = auth.uid());
create policy marcar on public.notificacoes for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Auditoria: somente master lê; ninguém altera
create policy ver on public.auditoria for select to authenticated using (public.e_master());

-- Nenhum acesso anônimo
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;

-- ---------------------------------------------------------------------
-- 9. ARMAZENAMENTO DE ANEXOS (bucket privado)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 5242880,
        array['application/pdf','image/jpeg','image/png','image/webp','application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp','application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

drop policy if exists "anexos_ler" on storage.objects;
drop policy if exists "anexos_enviar" on storage.objects;
drop policy if exists "anexos_excluir" on storage.objects;
create policy "anexos_ler" on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and public.pode_ver_anexo(name));
create policy "anexos_enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and public.anexo_registrado(name));
create policy "anexos_excluir" on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and (owner_id = (auth.uid())::text or public.e_master()));

-- ---------------------------------------------------------------------
-- 10. DADOS INICIAIS
-- ---------------------------------------------------------------------
insert into public.unidades (nome, cidade, marca)
select * from (values
  ('Royal Enfield Bravick - Rio Preto', 'São José do Rio Preto', 'Royal Enfield'),
  ('Royal Enfield Bravick - Presidente Prudente', 'Presidente Prudente', 'Royal Enfield'),
  ('Royal Enfield Bravick - Araçatuba', 'Araçatuba', 'Royal Enfield')
) v(nome, cidade, marca)
where not exists (select 1 from public.unidades);

insert into public.departamentos (nome) values
  ('Vendas'),('Pós-vendas / Oficina'),('Peças e Acessórios'),('F&I'),
  ('Administrativo / Financeiro'),('Marketing / CRM'),('Recepção'),
  ('Preparação / Lavagem'),('Gerência')
on conflict (nome) do nothing;

insert into public.cargos (nome, departamento_id, sla_dias, descricao, atividades)
select c.nome, d.id, c.sla, c.descr, c.ativ from (values
  ('Consultor de Vendas','Vendas',30,'Atendimento e venda de motocicletas novas e seminovas.','Prospecção e atendimento de clientes; test-ride; negociação e fechamento; follow-up pós-venda; atualização do CRM.'),
  ('Gerente de Vendas','Vendas',45,'Gestão da equipe comercial e das metas de vendas.','Gestão de metas e funil; treinamento da equipe; avaliação de usados; relacionamento com fábrica.'),
  ('Consultor Técnico (Serviços)','Pós-vendas / Oficina',30,'Recepção técnica de clientes da oficina.','Abertura de OS; diagnóstico inicial com o cliente; orçamentos; acompanhamento e entrega dos serviços.'),
  ('Mecânico de Motocicletas','Pós-vendas / Oficina',45,'Execução de revisões, diagnósticos e reparos.','Revisões programadas; diagnóstico eletrônico; reparos mecânicos e elétricos; garantia conforme padrão da fábrica.'),
  ('Auxiliar de Mecânico','Pós-vendas / Oficina',30,'Apoio às atividades da oficina.','Apoio em revisões; organização de ferramentas e boxes; movimentação de motos.'),
  ('Chefe de Oficina','Pós-vendas / Oficina',45,'Coordenação técnica da oficina.','Distribuição de serviços; controle de qualidade; produtividade; garantia.'),
  ('Vendedor de Peças e Acessórios','Peças e Acessórios',30,'Venda de peças, acessórios e vestuário.','Atendimento no balcão; vendas para oficina; exposição de produtos; controle de pedidos.'),
  ('Estoquista','Peças e Acessórios',30,'Controle e organização do estoque.','Recebimento e conferência; armazenagem; inventários; separação para oficina.'),
  ('Recepcionista','Recepção',20,'Primeiro atendimento ao cliente na loja.','Recepção de clientes; atendimento telefônico e WhatsApp; agendamentos; apoio administrativo.'),
  ('Preparador / Lavador','Preparação / Lavagem',20,'Preparação e lavagem de motocicletas.','Lavagem; preparação para entrega; organização do pátio.'),
  ('Assistente Administrativo','Administrativo / Financeiro',30,'Rotinas administrativas e financeiras.','Contas a pagar e receber; notas fiscais; documentação de veículos; conciliação.'),
  ('Analista de F&I','F&I',30,'Financiamentos, seguros e produtos financeiros.','Simulações e aprovações de crédito; consórcio; seguros; documentação de venda.'),
  ('Analista de Marketing / CRM','Marketing / CRM',30,'Marketing local e relacionamento com clientes.','Redes sociais; eventos; campanhas; pesquisas de satisfação; gestão de leads.'),
  ('Gerente de Pós-vendas','Gerência',60,'Gestão de oficina, peças e satisfação no pós-vendas.','Indicadores de pós-vendas; equipe técnica; rentabilidade; padrões da fábrica.')
) c(nome, dep, sla, descr, ativ)
join public.departamentos d on d.nome = c.dep
on conflict (nome) do nothing;

insert into public.beneficios (nome) values
  ('Vale-transporte'),('Vale-refeição'),('Vale-alimentação'),('Plano de saúde'),
  ('Plano odontológico'),('Seguro de vida'),('Ajuda de custo'),('Desconto em produtos/serviços')
on conflict (nome) do nothing;

-- =====================================================================
-- FIM. Para criar o primeiro Master, use o script master.sql
-- =====================================================================

-- Masters enxergam documentos sensíveis
update public.perfis set ver_sensiveis = true where perfil = 'master' and not ver_sensiveis;

-- =====================================================================
-- 11. REV.03 — CHECKLIST DE ADMISSÃO E OUTRAS SOLICITAÇÕES
-- (fica no fim porque a seção 8 recria todas as políticas)
-- =====================================================================

-- ---------- Checklist de admissão
create or replace function public.admissao_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.vaga_id <> old.vaga_id then
    raise exception 'Alteração não permitida.';
  end if;
  new.candidato := left(trim(new.candidato), 120);
  new.atualizado_por := (select nome from public.perfis where id = auth.uid());
  new.atualizado_em := now();
  if tg_op = 'INSERT' then new.criado_em := now(); end if;
  return new;
end $$;
drop trigger if exists trg_admissao_before on public.vaga_admissoes;
create trigger trg_admissao_before before insert or update on public.vaga_admissoes
  for each row execute function public.admissao_before();

alter table public.vaga_admissoes enable row level security;
create policy ver on public.vaga_admissoes for select to authenticated
  using (public.pode_ver_vaga(vaga_id));
create policy criar on public.vaga_admissoes for insert to authenticated
  with check (public.pode_conduzir_vaga(vaga_id));
create policy alterar on public.vaga_admissoes for update to authenticated
  using (public.pode_conduzir_vaga(vaga_id)) with check (public.pode_conduzir_vaga(vaga_id));
create policy excluir on public.vaga_admissoes for delete to authenticated
  using (public.pode_conduzir_vaga(vaga_id));

-- Documento ligado a um item do checklist precisa ser da mesma vaga
create or replace function public.anexo_admissao_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.admissao_id is not null and not exists (
    select 1 from public.vaga_admissoes a where a.id = new.admissao_id and a.vaga_id = new.vaga_id) then
    raise exception 'Admissão inválida para esta vaga.';
  end if;
  return new;
end $$;
drop trigger if exists trg_anexo_adm on public.vaga_anexos;
create trigger trg_anexo_adm before insert or update on public.vaga_anexos
  for each row execute function public.anexo_admissao_check();

-- ---------- Outras solicitações: visibilidade
create or replace function public.pode_ver_sol(p_unidade uuid, p_solic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select me.perfil = 'master' or p_solic = me.id
      or exists (select 1 from public.unidades un where un.id = p_unidade and un.aprovador_id = me.id)
      or ((me.todas_unidades or p_unidade = any(me.unidades))
          and (me.escopo = 'unidade' or me.pode_aprovar or me.pode_alterar_status))
    from public.perfis me where me.id = auth.uid() and me.ativo), false)
$$;

create or replace function public.pode_ver_sol_id(s_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.pode_ver_sol(s.unidade_id, s.solicitante_id)
                   from public.solicitacoes s where s.id = s_id), false)
$$;

-- ---------- Notificações das solicitações
create or replace function public.notificar_sol(p_id uuid, p_texto text, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.solicitacoes; un public.unidades;
begin
  select * into s from public.solicitacoes where id = p_id;
  select * into un from public.unidades where id = s.unidade_id;
  if p_tipo = 'solicitante' then
    if s.solicitante_id is distinct from auth.uid() then
      insert into public.notificacoes(usuario_id, solicitacao_id, texto) values (s.solicitante_id, s.id, p_texto);
    end if;
  elsif p_tipo = 'aprovadores' then
    insert into public.notificacoes(usuario_id, solicitacao_id, texto)
    select p.id, s.id, p_texto from public.perfis p
    where p.ativo and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')
      and case when un.aprovador_id is not null then p.id = un.aprovador_id
               else (p.pode_aprovar or p.perfil = 'master')
                    and (p.perfil = 'master' or p.todas_unidades or s.unidade_id = any(p.unidades)) end;
  elsif p_tipo = 'rh' then
    insert into public.notificacoes(usuario_id, solicitacao_id, texto)
    select p.id, s.id, p_texto from public.perfis p
    where p.ativo and p.pode_alterar_status
      and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')
      and (p.perfil = 'master' or p.todas_unidades or s.unidade_id = any(p.unidades));
  end if;
end $$;
revoke all on function public.notificar_sol(uuid, text, text) from public, anon, authenticated;

-- ---------- Numeração, solicitante, status inicial e proteção de campos
create or replace function public.solicitacoes_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; a int; me public.perfis;
begin
  if tg_op = 'INSERT' then
    select * into me from public.perfis where id = auth.uid();
    if not public.acessa_unidade(new.unidade_id) then
      raise exception 'Você não tem acesso a esta unidade.';
    end if;
    a := extract(year from now())::int;
    insert into public.contadores_sol(ano, ultimo) values (a, 1)
      on conflict (ano) do update set ultimo = contadores_sol.ultimo + 1
      returning ultimo into n;
    new.numero := 'SOL-' || a || '-' || lpad(n::text, 4, '0');
    new.solicitante_id := auth.uid();
    new.solicitante_nome := me.nome;
    -- Alteração de cargo/salário passa pela diretoria; solicitação geral vai direto ao RH
    new.status := case when new.tipo = 'geral' then 'pendente_rh' else 'aguardando_aprovacao' end;
    new.aprovador_id := null; new.aprovador_nome := null; new.aprovado_em := null; new.concluido_em := null;
    new.criado_em := now(); new.atualizado_em := now();
    if new.tipo = 'alteracao_cargo' then
      if coalesce(trim(new.colaborador_nome),'') = '' or coalesce(trim(new.motivo),'') = ''
         or coalesce(trim(new.cargo_atual),'') = '' or new.altera_centro_custo is null then
        raise exception 'Preencha colaborador, motivo, cargo atual e centro de custo.';
      end if;
    elsif coalesce(trim(new.titulo),'') = '' or coalesce(trim(new.motivo),'') = '' then
      raise exception 'Preencha o título e o motivo.';
    end if;
    return new;
  end if;

  if coalesce(current_setting('app.via_rpc', true), '') <> '1' then
    if new.status is distinct from old.status or new.numero is distinct from old.numero
       or new.tipo is distinct from old.tipo
       or new.solicitante_id is distinct from old.solicitante_id or new.unidade_id is distinct from old.unidade_id
       or new.aprovador_id is distinct from old.aprovador_id or new.aprovado_em is distinct from old.aprovado_em
       or new.concluido_em is distinct from old.concluido_em then
      raise exception 'Alteração não permitida por esta via.';
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists trg_sol_before on public.solicitacoes;
create trigger trg_sol_before before insert or update on public.solicitacoes
  for each row execute function public.solicitacoes_before();

-- Histórico e aviso na criação
create or replace function public.solicitacoes_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare rotulo text;
begin
  insert into public.solicitacao_historico(solicitacao_id, status_de, status_para, comentario, autor_id, autor_nome)
  values (new.id, null, new.status, null, new.solicitante_id, new.solicitante_nome);
  rotulo := new.numero || ' · ' || case when new.tipo = 'geral' then coalesce(new.titulo, 'Solicitação')
            else 'Alteração de cargo/salário — ' || coalesce(new.colaborador_nome, '') end;
  if new.status = 'aguardando_aprovacao' then
    perform public.notificar_sol(new.id, 'Solicitação aguardando sua aprovação: ' || rotulo, 'aprovadores');
  else
    perform public.notificar_sol(new.id, 'Nova solicitação para o RH: ' || rotulo, 'rh');
  end if;
  return null;
end $$;
drop trigger if exists trg_sol_after on public.solicitacoes;
create trigger trg_sol_after after insert on public.solicitacoes
  for each row execute function public.solicitacoes_after();

-- ---------- Mudança de status (única porta de entrada)
create or replace function public.mudar_status_solicitacao(p_id uuid, p_status text, p_comentario text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.solicitacoes; me public.perfis; ok boolean := false; rotulo text;
  rh boolean;
begin
  select * into me from public.perfis where id = auth.uid() and ativo;
  if me.id is null then raise exception 'Sessão inválida.'; end if;
  select * into s from public.solicitacoes where id = p_id for update;
  if s.id is null or not public.pode_ver_sol(s.unidade_id, s.solicitante_id) then raise exception 'Solicitação não encontrada.'; end if;
  if p_status = s.status then raise exception 'A solicitação já está neste status.'; end if;
  if s.status in ('concluida','cancelada','reprovada') then raise exception 'Solicitação encerrada não pode mudar de status.'; end if;
  rh := me.perfil = 'master' or (me.pode_alterar_status and public.acessa_unidade(s.unidade_id));

  if p_status = 'aguardando_aprovacao' then
    ok := s.status = 'devolvida' and s.tipo = 'alteracao_cargo' and (s.solicitante_id = me.id or me.perfil = 'master');
  elsif p_status in ('pendente_rh','devolvida','reprovada') and s.status = 'aguardando_aprovacao' then
    ok := public.pode_aprovar_unidade(s.unidade_id);
  elsif p_status = 'devolvida' and s.status in ('pendente_rh','em_andamento') then
    ok := rh;  -- RH pode devolver para complementar informações
  elsif p_status = 'pendente_rh' and s.status = 'devolvida' then
    ok := s.tipo = 'geral' and (s.solicitante_id = me.id or me.perfil = 'master');
  elsif p_status in ('em_andamento','concluida') then
    ok := s.status in ('pendente_rh','em_andamento') and rh;
  elsif p_status = 'cancelada' then
    ok := rh or (s.solicitante_id = me.id and s.status in ('aguardando_aprovacao','devolvida','pendente_rh'));
  end if;
  if not ok then raise exception 'Você não tem permissão para esta mudança de status.'; end if;
  if p_status in ('devolvida','reprovada','cancelada') and coalesce(trim(p_comentario),'') = '' then
    raise exception 'Informe o motivo.';
  end if;

  perform set_config('app.via_rpc', '1', true);
  update public.solicitacoes set
    status = p_status,
    aprovador_id = case when s.status = 'aguardando_aprovacao' and p_status in ('pendente_rh','reprovada','devolvida') then me.id else aprovador_id end,
    aprovador_nome = case when s.status = 'aguardando_aprovacao' and p_status in ('pendente_rh','reprovada','devolvida') then me.nome else aprovador_nome end,
    aprovado_em = case when s.status = 'aguardando_aprovacao' and p_status = 'pendente_rh' then now() else aprovado_em end,
    concluido_em = case when p_status in ('concluida','cancelada','reprovada') then now() else concluido_em end
  where id = p_id;
  perform set_config('app.via_rpc', '', true);

  insert into public.solicitacao_historico(solicitacao_id, status_de, status_para, comentario, autor_id, autor_nome)
  values (p_id, s.status, p_status, nullif(left(trim(coalesce(p_comentario,'')), 2000), ''), me.id, me.nome);

  rotulo := s.numero || ' · ' || case when s.tipo = 'geral' then coalesce(s.titulo, 'Solicitação')
            else 'Alteração de cargo/salário — ' || coalesce(s.colaborador_nome, '') end;
  if p_status = 'aguardando_aprovacao' then
    perform public.notificar_sol(p_id, 'Solicitação reenviada para sua aprovação: ' || rotulo, 'aprovadores');
  elsif p_status = 'pendente_rh' then
    perform public.notificar_sol(p_id, case when s.status = 'aguardando_aprovacao' then 'Solicitação aprovada: ' else 'Solicitação reenviada ao RH: ' end || rotulo, 'solicitante');
    perform public.notificar_sol(p_id, case when s.status = 'aguardando_aprovacao' then 'Solicitação aprovada para o RH executar: ' else 'Solicitação reenviada ao RH: ' end || rotulo, 'rh');
  else
    perform public.notificar_sol(p_id, case p_status
      when 'devolvida' then 'Solicitação devolvida para ajuste: '
      when 'reprovada' then 'Solicitação reprovada: '
      when 'em_andamento' then 'Solicitação em andamento no RH: '
      when 'concluida' then 'Solicitação concluída: '
      when 'cancelada' then 'Solicitação cancelada: '
      else 'Status atualizado: ' end || rotulo, 'solicitante');
  end if;
end $$;

-- ---------- RLS das solicitações
alter table public.contadores_sol enable row level security;
alter table public.solicitacoes enable row level security;
alter table public.solicitacao_salarios enable row level security;
alter table public.solicitacao_historico enable row level security;

create policy ver on public.solicitacoes for select to authenticated
  using (public.pode_ver_sol(unidade_id, solicitante_id));
create policy criar on public.solicitacoes for insert to authenticated
  with check (coalesce((select public.eu()).pode_criar, false) or public.e_master());
create policy editar on public.solicitacoes for update to authenticated
  using ((solicitante_id = auth.uid() and status = 'devolvida') or public.e_master())
  with check (public.acessa_unidade(unidade_id) or public.e_master());

create policy ver on public.solicitacao_salarios for select to authenticated
  using (public.pode_ver_sol_id(solicitacao_id) and (
    public.e_master() or coalesce((select public.eu()).ver_salario, false)
    or exists (select 1 from public.solicitacoes s where s.id = solicitacao_id and s.solicitante_id = auth.uid())
    or exists (select 1 from public.solicitacoes s join public.unidades un on un.id = s.unidade_id
               where s.id = solicitacao_id and un.aprovador_id = auth.uid())));
create policy gravar on public.solicitacao_salarios for insert to authenticated
  with check (exists (select 1 from public.solicitacoes s where s.id = solicitacao_id
    and (s.solicitante_id = auth.uid() or public.e_master()) and s.status in ('aguardando_aprovacao','devolvida')));
create policy alterar on public.solicitacao_salarios for update to authenticated
  using (exists (select 1 from public.solicitacoes s where s.id = solicitacao_id
    and (s.solicitante_id = auth.uid() or public.e_master()) and s.status in ('aguardando_aprovacao','devolvida')));

create policy ver on public.solicitacao_historico for select to authenticated
  using (public.pode_ver_sol_id(solicitacao_id));

-- ---------- Auditoria das tabelas novas
do $$
declare t text;
begin
  foreach t in array array['vaga_admissoes','solicitacoes','solicitacao_salarios'] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I
                    for each row execute function public.auditar()', t);
  end loop;
end $$;

-- E-mails que recebem o aviso de admissão concluída (organograma). Editável pelo Master no app.
insert into public.configuracoes (chave, valor) values ('emails_admissao', '[]'::jsonb)
on conflict (chave) do nothing;

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;
