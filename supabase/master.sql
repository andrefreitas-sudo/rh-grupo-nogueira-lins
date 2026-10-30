-- Cria (ou promove) o usuário Master a partir de um usuário já criado
-- em Authentication > Users. Troque o e-mail abaixo e rode no SQL Editor.
insert into public.perfis (id, nome, email, perfil, ativo, deve_trocar_senha,
  todas_unidades, escopo, pode_criar, pode_aprovar, pode_alterar_status,
  pode_comentar, pode_exportar, ver_salario, ver_confidencial, ver_internos,
  gerenciar_cadastros)
select u.id, 'André', u.email, 'master', true, false,
  true, 'unidade', true, true, true, true, true, true, true, true, true
from auth.users u
where lower(u.email) = lower('SEU_EMAIL_AQUI')
on conflict (id) do update set perfil = 'master', ativo = true;
