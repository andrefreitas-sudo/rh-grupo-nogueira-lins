# RH Grupo Nogueira Lins — Vagas

PWA para requisição e acompanhamento de vagas das concessionárias do Grupo Nogueira Lins.

- **App:** https://andrefreitas-sudo.github.io/rh-grupo-nogueira-lins/
- **Banco e login:** Supabase (projeto `rh-grupo-nogueira-lins`, região São Paulo)

## Como funciona a segurança
- Todas as regras de acesso ficam no banco (Row Level Security). Mesmo alterando o app, ninguém lê dados que não pode.
- A chave em `config.js` é a chave **pública** do Supabase — é feita para ficar no site.
- Usuários só são criados pelo Master (função `admin-usuarios`), com senha temporária e troca obrigatória no primeiro acesso.
- Salário fica em tabela separada, visível só para quem tem permissão. Vagas confidenciais ficam ocultas para quem não tem permissão.
- Toda alteração gera registro permanente na auditoria. Sessão expira após 60 min sem uso.

## Arquivos
| Arquivo | O que é |
|---|---|
| `index.html`, `app.js`, `styles.css` | O aplicativo |
| `config.js` | URL e chave pública do Supabase |
| `sw.js`, `manifest.webmanifest`, `icons/` | Instalação no celular (PWA) |
| `vendor/supabase.js` | Biblioteca do Supabase (versão 2.118.0, hospedada aqui) |
| `supabase/schema.sql` | Banco completo — pode ser rodado de novo com segurança |
| `supabase/master.sql` | Promove um usuário a Master |
| `supabase/admin-usuarios.ts` | Função de servidor para criar usuários, gerar senha e ativar/desativar |
| `supabase/avisos-email.ts` | Função de servidor que envia o e-mail de admissão concluída (organograma) via Brevo |

## Atualizar o app
Altere os arquivos e envie para a branch `main`. Ao mudar o app, aumente `VERSAO` em `sw.js` para os celulares baixarem a versão nova.

## REV.03 (novembro/2026)
- **Aprovação pela diretoria:** cada concessionária pode ter um diretor aprovador (Concessionárias → Editar). Com diretor definido, só ele (e o Master) aprova e recebe o aviso.
- **Checklist de admissão:** na etapa “Admissão em andamento”, cada admitido tem a lista de documentos (foto, RG/CPF, CNH, comprovante, CTPS, PIS, conta BB/Bradesco, escolaridade, certidão, RG cônjuge/filhos opcionais, ASO) e adiantamento Sim/Não. Cada item aceita anexo.
- **E-mail ao organograma:** ao concluir a vaga, a função `avisos-email` envia os dados do admitido para os e-mails de Configurações. Segredos da função: `BREVO_API_KEY`, `EMAIL_REMETENTE` (e opcional `EMAIL_REMETENTE_NOME`).
- **Outras solicitações:** alteração de cargo e/ou salário (passa pela diretoria) e solicitações gerais (direto ao RH).
