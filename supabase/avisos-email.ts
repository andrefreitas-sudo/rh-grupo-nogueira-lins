// RH Grupo Nogueira Lins — Edge Function "avisos-email"
// Envia o e-mail de "admissão concluída" para alimentar o organograma.
// Quem pode chamar: Master ou RH (alterar status) da unidade da vaga.
// Destinatários: configuração "emails_admissao" (editada pelo Master no app → Configurações).
// Envio: Brevo (plano gratuito, 300 e-mails/dia). Segredos necessários na função:
//   BREVO_API_KEY      — chave de API do Brevo
//   EMAIL_REMETENTE    — e-mail remetente validado no Brevo (ex.: rh@gruponogueiralins.com.br)
//   EMAIL_REMETENTE_NOME (opcional) — nome exibido; padrão "RH Grupo Nogueira Lins"
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const data = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  let service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!service) {
    try {
      const s = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
      service = s.default || Object.values(s)[0] as string || "";
    } catch { /* sem chaves */ }
  }
  if (!service) return json({ erro: "Função sem chave de servidor configurada." }, 500);
  const apiKey = Deno.env.get("BREVO_API_KEY") || "";
  const remetente = Deno.env.get("EMAIL_REMETENTE") || "";
  if (!apiKey || !remetente) return json({ erro: "Envio de e-mail ainda não configurado (Brevo)." }, 500);
  const admin = createClient(url, service, { auth: { persistSession: false } });

  // Quem está chamando?
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: quem, error: eQuem } = await admin.auth.getUser(token);
  if (eQuem || !quem?.user) return json({ erro: "Sessão inválida." }, 401);
  const { data: me } = await admin.from("perfis")
    .select("nome, perfil, ativo, pode_alterar_status, todas_unidades, unidades").eq("id", quem.user.id).single();
  if (!me || !me.ativo) return json({ erro: "Acesso negado." }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ erro: "Requisição inválida." }, 400); }
  if (body.acao !== "admissao_concluida") return json({ erro: "Ação desconhecida." }, 400);
  const vagaId = String(body.vaga_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(vagaId)) return json({ erro: "Vaga inválida." }, 400);

  const { data: v } = await admin.from("vagas").select("*").eq("id", vagaId).maybeSingle();
  if (!v) return json({ erro: "Vaga não encontrada." }, 404);
  const podeRH = me.perfil === "master" ||
    (me.pode_alterar_status && (me.todas_unidades || (me.unidades || []).includes(v.unidade_id)));
  if (!podeRH) return json({ erro: "Acesso negado." }, 403);
  if (v.status !== "concluida") return json({ erro: "A vaga ainda não foi concluída." }, 400);
  if (v.email_organograma_em && body.reenviar !== true) return json({ ok: true, ja_enviado: true });

  const [{ data: cfg }, { data: un }, { data: dep }, { data: adms }] = await Promise.all([
    admin.from("configuracoes").select("valor").eq("chave", "emails_admissao").maybeSingle(),
    admin.from("unidades").select("nome, razao_social, cnpj, cidade, marca").eq("id", v.unidade_id).maybeSingle(),
    v.departamento_id ? admin.from("departamentos").select("nome").eq("id", v.departamento_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("vaga_admissoes").select("candidato, data_admissao").eq("vaga_id", vagaId).order("criado_em"),
  ]);
  const emails = (Array.isArray(cfg?.valor) ? cfg!.valor : [])
    .map((e: unknown) => String(e).trim().toLowerCase())
    .filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 10);
  if (!emails.length) return json({ erro: "Nenhum e-mail cadastrado para o aviso de admissão (Configurações)." }, 400);

  // Pessoas admitidas: checklist de admissão; se não houver, o nome informado ao concluir
  const pessoas: { nome: string; data: string | null }[] = (adms && adms.length)
    ? adms.map((a) => ({ nome: a.candidato, data: a.data_admissao || v.data_admissao }))
    : String(v.contratado_nome || "").split(/[,;\n]/).map((n) => n.trim()).filter(Boolean)
        .map((n) => ({ nome: n, data: v.data_admissao }));

  const linha = (a: string, b: unknown) =>
    `<tr><td style="padding:6px 10px;color:#5b6573;border-bottom:1px solid #eef0f3;width:190px">${esc(a)}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eef0f3"><b>${esc(b || "—")}</b></td></tr>`;
  const blocoPessoa = (p: { nome: string; data: string | null }) => `
    <table style="border-collapse:collapse;width:100%;max-width:620px;margin:0 0 18px;font-size:14px;border:1px solid #e3e6ea;border-radius:8px">
      ${linha("Colaborador", p.nome)}
      ${linha("Cargo", v.cargo_nome)}
      ${linha("Data de admissão", data(p.data))}
      ${linha("Concessionária", un?.nome)}
      ${linha("Empresa / CNPJ", [un?.razao_social, un?.cnpj].filter(Boolean).join(" · "))}
      ${linha("Departamento", dep?.nome)}
      ${linha("Centro de custo", v.centro_custo)}
      ${linha("Gestor imediato (solicitante)", v.solicitante_nome)}
      ${linha("Tipo de contratação", v.tipo_contratacao)}
      ${linha("Jornada", v.jornada)}
    </table>`;
  const assunto = `Admissão concluída — ${pessoas.map((p) => p.nome).join(", ").slice(0, 80) || v.cargo_nome} (${v.numero})`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1d2530">
    <h2 style="margin:0 0 4px;color:#1b5e84">Admissão concluída</h2>
    <p style="margin:0 0 16px;color:#5b6573">Vaga ${esc(v.numero)} · concluída por ${esc(me.nome)}. Dados para atualização do organograma.</p>
    ${pessoas.map(blocoPessoa).join("")}
    <p style="font-size:12px;color:#8a93a0">E-mail automático do sistema RH Grupo Nogueira Lins. Não responda esta mensagem.</p></div>`;

  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: remetente, name: Deno.env.get("EMAIL_REMETENTE_NOME") || "RH Grupo Nogueira Lins" },
      to: emails.map((email: string) => ({ email })),
      subject: assunto,
      htmlContent: html,
    }),
  });
  if (!r.ok) {
    console.error("Brevo", r.status, await r.text());
    return json({ erro: "O serviço de e-mail recusou o envio. Verifique a configuração do Brevo." }, 502);
  }
  await admin.from("vagas").update({ email_organograma_em: new Date().toISOString() }).eq("id", vagaId);
  return json({ ok: true, enviados: emails.length });
});
