-- Cria os perfis Master a partir dos usuários já criados em
-- Authentication > Users (com "Auto Confirm User").
-- deve_trocar_senha = true: o app exige nova senha no primeiro acesso.
insert into public.perfis (id, nome, email, perfil, ativo, deve_trocar_senha,
  todas_unidades, escopo, pode_criar, pode_aprovar, pode_alterar_status,
  pode_comentar, pode_exportar, ver_salario, ver_confidencial, ver_internos,
  gerenciar_cadastros)
select u.id,
  case lower(u.email)
    when 'andre.freitas@bravick.com.br' then 'André Freitas'
    when 'isabela.moura@gruponogueiralins.com.br' then 'Isabela Moura'
  end,
  lower(u.email), 'master', true, true,
  true, 'unidade', true, true, true, true, true, true, true, true, true
from auth.users u
where lower(u.email) in ('andre.freitas@bravick.com.br', 'isabela.moura@gruponogueiralins.com.br')
on conflict (id) do update set perfil = 'master', ativo = true, todas_unidades = true,
  escopo = 'unidade', pode_criar = true, pode_aprovar = true, pode_alterar_status = true,
  pode_comentar = true, pode_exportar = true, ver_salario = true, ver_confidencial = true,
  ver_internos = true, gerenciar_cadastros = true, deve_trocar_senha = true;

select email, perfil, deve_trocar_senha from public.perfis order by email;
