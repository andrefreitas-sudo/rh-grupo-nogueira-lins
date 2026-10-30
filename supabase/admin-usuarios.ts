// RH Grupo Nogueira Lins — Edge Function "admin-usuarios"
// Somente o Master pode chamar. Ações: criar, redefinir_senha, definir_ativo.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function senhaTemporaria(): string {
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const nums = "23456789";
  const todos = letras + nums;
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  let s = letras[buf[0] % letras.length] + nums[buf[1] % nums.length];
  for (let i = 2; i < 10; i++) s += todos[buf[i] % todos.length];
  return s;
}

const PERFIS = ["master", "rh", "aprovador", "gestor", "visualizador"];
const BOOLS = ["todas_unidades", "pode_criar", "pode_aprovar", "pode_alterar_status", "pode_comentar",
  "pode_exportar", "ver_salario", "ver_confidencial", "ver_internos", "gerenciar_cadastros"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  // Aceita a chave antiga (service_role) ou as novas chaves secretas (sb_secret_...)
  let service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!service) {
    try {
      const s = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
      service = s.default || Object.values(s)[0] as string || "";
    } catch { /* sem chaves */ }
  }
  if (!service) return json({ erro: "Função sem chave de servidor configurada." }, 500);
  const admin = createClient(url, service, { auth: { persistSession: false } });

  // Quem está chamando?
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: quem, error: eQuem } = await admin.auth.getUser(token);
  if (eQuem || !quem?.user) return json({ erro: "Sessão inválida." }, 401);
  const { data: chamador } = await admin.from("perfis").select("perfil, ativo").eq("id", quem.user.id).single();
  if (!chamador || chamador.perfil !== "master" || !chamador.ativo) return json({ erro: "Acesso negado." }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ erro: "Requisição inválida." }, 400); }
  const acao = String(body.acao || "");

  if (acao === "criar") {
    const email = String(body.email || "").trim().toLowerCase();
    const nome = String(body.nome || "").trim().slice(0, 120);
    const perfil = String(body.perfil || "gestor");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ erro: "E-mail inválido." }, 400);
    if (!nome) return json({ erro: "Informe o nome." }, 400);
    if (!PERFIS.includes(perfil)) return json({ erro: "Perfil inválido." }, 400);

    const senha = senhaTemporaria();
    const { data: novo, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (error) {
      const msg = /already/i.test(error.message) ? "Já existe um usuário com este e-mail." : "Não foi possível criar o usuário.";
      return json({ erro: msg }, 400);
    }
    const linha: Record<string, unknown> = {
      id: novo.user.id, nome, email, perfil, ativo: true, deve_trocar_senha: true,
      escopo: body.escopo === "unidade" ? "unidade" : "proprias",
      unidades: Array.isArray(body.unidades) ? (body.unidades as string[]).filter((u) => /^[0-9a-f-]{36}$/i.test(u)) : [],
    };
    for (const b of BOOLS) linha[b] = body[b] === true;
    const { error: e2 } = await admin.from("perfis").insert(linha);
    if (e2) {
      await admin.auth.admin.deleteUser(novo.user.id);
      return json({ erro: "Não foi possível gravar o perfil." }, 400);
    }
    return json({ ok: true, id: novo.user.id, senha_temporaria: senha });
  }

  if (acao === "redefinir_senha") {
    const id = String(body.id || "");
    const senha = senhaTemporaria();
    const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
    if (error) return json({ erro: "Não foi possível redefinir a senha." }, 400);
    await admin.from("perfis").update({ deve_trocar_senha: true }).eq("id", id);
    return json({ ok: true, senha_temporaria: senha });
  }

  if (acao === "definir_ativo") {
    const id = String(body.id || "");
    const ativo = body.ativo === true;
    if (id === quem.user.id && !ativo) return json({ erro: "Você não pode desativar a si mesmo." }, 400);
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: ativo ? "none" : "876000h" });
    if (error) return json({ erro: "Não foi possível alterar o acesso." }, 400);
    await admin.from("perfis").update({ ativo }).eq("id", id);
    return json({ ok: true });
  }

  return json({ erro: "Ação desconhecida." }, 400);
});
