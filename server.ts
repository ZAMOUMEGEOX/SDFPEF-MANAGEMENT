import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import nodemailer from 'nodemailer';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// ── Nodemailer Helper ──────────────────────────────────────────
async function sendAdminEmail(params: {
  user_name: string; user_email: string; user_grade: string;
  user_service: string; user_motif: string; user_date: string;
  approve_url: string; reject_url: string;
}) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'sdfpeftth@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: '"AtlasForest 🌿" <sdfpeftth@gmail.com>',
      to: 'sdfpeftth@gmail.com',
      subject: `🌳 AtlasForest — Nouvelle demande : ${params.user_name}`,
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body{margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif}
.wrap{max-width:600px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.hdr{background:#1a3a2a;padding:24px 32px}
.hdr h1{margin:0;color:#4ade80;font-size:18px;font-weight:800;letter-spacing:2px}
.hdr p{margin:4px 0 0;color:#86efac;font-size:12px}
.body{padding:32px}
.body h2{color:#1a3a2a;font-size:20px;margin:0 0 20px}
table{width:100%;border-collapse:collapse;margin-bottom:28px}
td{padding:12px 16px;font-size:14px;border-bottom:1px solid #e5e7eb}
td:first-child{color:#666;font-weight:600;width:40%;background:#f9fafb}
td:last-child{color:#111;font-weight:500}
.actions{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px}
.actions p{margin:0 0 16px;font-size:14px;font-weight:700;color:#166534}
.btn{display:inline-block;padding:14px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;margin:0 8px}
.approve{background:#16a34a;color:#fff}
.reject{background:#dc2626;color:#fff}
.warn{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:12px;color:#92400e;margin-bottom:20px}
.foot{text-align:center;padding:16px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb}
</style></head><body>
<div class="wrap">
  <div class="hdr"><h1>🌿 AtlasForest</h1><p>Système de Gestion Forestière · ANEF Tétouan</p></div>
  <div class="body">
    <h2>Nouvelle demande d'accès agent</h2>
    <table>
      <tr><td>Nom complet</td><td>${params.user_name}</td></tr>
      <tr><td>Email</td><td>${params.user_email}</td></tr>
      <tr><td>Grade / Poste</td><td>${params.user_grade}</td></tr>
      <tr><td>Service</td><td>${params.user_service}</td></tr>
      <tr><td>Motif</td><td>${params.user_motif}</td></tr>
      <tr><td>Date</td><td>${params.user_date}</td></tr>
    </table>
    <div class="actions">
      <p>Action requise — Approuver ou rejeter la demande :</p>
      <a href="${params.approve_url}" class="btn approve">✅ Approuver l'accès</a>
      <a href="${params.reject_url}" class="btn reject">❌ Rejeter la demande</a>
    </div>
    <div class="warn">⚠️ Ces liens sont sécurisés et à usage unique. Ne les partagez pas.</div>
  </div>
  <div class="foot">AtlasForest · ANEF Tétouan · Système automatique</div>
</div></body></html>`,
    });
    console.log('✅ Email admin envoyé via Nodemailer');
  } catch (err) {
    console.error('❌ Nodemailer error:', err);
  }
}
// ───────────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // API Routes
  app.post("/api/chat", async (req, res) => {
    try {
      const { message } = req.body;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are AtlasIA, an intelligent assistant for the "Agence Nationale des Eaux et Forêts" (ANEF) in Morocco. 
        You help agents navigate the system. The system has the following views:
        - dashboard
        - domaine (Domaine forestier, maps, SIG)
        - contentieux (Legal cases, violations, disputes)
        - police (Police forestière, patrols)
        - biodiversite (Flora, fauna, parks)
        - teledetection (Satellite, drones, fire tracking)
        
        Analyze the user's message and respond in French or Arabic (matching the user's language). 
        You must return a JSON response with two fields:
        - "reply": Your conversational response.
        - "actionView": The view key (dashboard, domaine, contentieux, police, biodiversite, teledetection) to navigate to, or null if not applicable.
        - "actionLabel": A short button label for the action if actionView is provided, e.g., "Ouvrir la Carte", or null.
        
        Example JSON:
        {
          "reply": "D'accord, je vous ouvre la carte du domaine forestier.",
          "actionView": "domaine",
          "actionLabel": "Ouvrir la carte"
        }
        
        User message: ${message}`,
        config: {
          responseMimeType: "application/json",
        }
      });
      
      const responseText = response.text || "{}";
      // Ensure we extract JSON in case of markdown blocks
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
         res.json(JSON.parse(jsonMatch[0]));
      } else {
         res.json(JSON.parse(responseText));
      }
    } catch (error) {
      console.error('Chat API Error:', error);
      res.status(500).json({ reply: "Désolé, une erreur technique est survenue.", actionView: null, actionLabel: null });
    }
  });

  app.post("/api/analyze-cases", async (req, res) => {
    try {
      const { cases } = req.body;
      const prompt = `Voici une liste de dossiers contentieux (format JSON):\n${JSON.stringify(cases, null, 2)}\n\nTon rôle est d'analyser ces dossiers et de fournir un bref résumé managérial (en français) des points d'attention (par ex: taux d'exécution, dossiers en retard, types d'infractions les plus courantes). Présente ta réponse en HTML formaté (sans balises <html> ni <body>, juste le contenu). Pas besoin d'être trop long, sois clair et professionnel.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
      
      res.json({ analysis: response.text });
    } catch (error) {
      console.error('Analyze API Error:', error);
      res.status(500).json({ error: "Erreur lors de l'analyse IA." });
    }
  });

  // ─── Helper: Supabase Service Client ────────────────────────────────────────
const getSupabaseAdmin = () =>
  createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

// ─── POST /api/login ─────────────────────────────────────────────────────────
app.post("/api/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password)
      return res.status(400).json({ error: "Champs obligatoires manquants" });

    // Compte admin permanent (changer le mot de passe en production)
    if (
      (identifier === "zamoume" || identifier === "zamoume@anef.gov.ma") &&
      password === "zamoume2026"
    ) {
      res.cookie("atlasforest-session", "admin", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 86_400_000,
        path: "/",
      });
      return res.json({
        success: true,
        user: { id: "admin", prenom: "Ahmed", nom: "ZAMOUME",
          grade: "Administrateur Système", email: "zamoume@anef.gov.ma", role: "admin" },
      });
    }

    const supabase = getSupabaseAdmin();
    const { data: user, error } = await supabase
      .from("users_requests")
      .select("id, prenom, nom, email, grade, password, statut")
      .or(`email.eq.${identifier},nom.ilike.${identifier}`)
      .single();

    if (error || !user)
      return res.status(401).json({ error: "Identifiant ou mot de passe incorrect" });

    if (user.statut === "pending")
      return res.status(403).json({ error: "Votre demande est en cours de traitement. Vous serez contacté sous 48h." });
    if (user.statut === "rejected")
      return res.status(403).json({ error: "Votre demande a été refusée. Contactez l'administrateur." });
    if (user.statut !== "approved")
      return res.status(403).json({ error: "Compte non activé." });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ error: "Identifiant ou mot de passe incorrect" });

    res.cookie("atlasforest-session", String(user.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 86_400_000,
      path: "/",
    });

    return res.json({
      success: true,
      user: { id: user.id, prenom: user.prenom, nom: user.nom,
        grade: user.grade, email: user.email, role: "agent" },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Erreur serveur inattendue" });
  }
});

// ─── POST /api/register ──────────────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  try {
    const { prenom, nom, email, grade, service, motif, password } = req.body;
    if (!prenom || !nom || !email || !grade || !password)
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    if (password.length < 8)
      return res.status(400).json({ error: "Mot de passe trop court (8 caractères minimum)" });

    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from("users_requests").select("id, statut").eq("email", email).single();

    if (existing) {
      const msg = existing.statut === "approved"
        ? "Ce compte est déjà actif. Connectez-vous directement."
        : existing.statut === "pending"
        ? "Une demande est déjà en cours pour cet email."
        : "Cet email a été refusé. Contactez l'administrateur.";
      return res.status(409).json({ error: msg });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const { data, error } = await supabase
      .from("users_requests")
      .insert([{ prenom, nom, email, grade,
        service: service || null, motif: motif || null,
        password: passwordHash, statut: "pending" }])
      .select("id").single();

    if (error) return res.status(500).json({ error: "Erreur base de données: " + error.message });

    // Liens d'approbation (admin les voit dans les logs serveur)
    const secret  = process.env.APPROVAL_SECRET || "atlasforest_secret_2025";
    const baseUrl = process.env.VITE_APP_URL || "http://localhost:3000";
    console.log(`\n✅ NOUVELLE DEMANDE: ${prenom} ${nom} (${email})`);
    console.log(`👍 Approuver: ${baseUrl}/api/approve?id=${data.id}&action=approve&secret=${secret}`);
    console.log(`👎 Rejeter:   ${baseUrl}/api/approve?id=${data.id}&action=reject&secret=${secret}\n`);
await sendAdminEmail({
  user_name:    `${prenom} ${nom}`,
  user_email:   email,
  user_grade:   grade   || 'Non précisé',
  user_service: service || 'Non précisé',
  user_motif:   motif   || 'Non précisé',
  user_date:    new Date().toLocaleDateString('fr-FR'),
  approve_url:  `${baseUrl}/api/approve?id=${data.id}&action=approve&secret=${secret}`,
  reject_url:   `${baseUrl}/api/approve?id=${data.id}&action=reject&secret=${secret}`,
});
    return res.json({ success: true, message: "Demande enregistrée. Vous serez notifié sous 48h." });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Erreur serveur inattendue" });
  }
});

// ─── GET /api/approve ────────────────────────────────────────────────────────
app.get("/api/approve", async (req, res) => {
  const { id, action, secret } = req.query as Record<string, string>;
  const validSecret = process.env.APPROVAL_SECRET || "atlasforest_secret_2025";

  const html = (ok: boolean, name: string, msg: string) => `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"/><title>AtlasForest</title>
<style>body{min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#060f08;font-family:system-ui}
.card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
border-radius:20px;padding:48px 56px;text-align:center;max-width:460px;width:90%}
h1{color:${ok ? "#22c55e" : "#f43f5e"};font-size:24px;margin:16px 0}
p{color:rgba(255,255,255,.5);font-size:13px;line-height:1.7}</style></head>
<body><div class="card"><div style="font-size:48px">${ok ? "✅" : "❌"}</div>
<h1>${ok ? "Approuvé" : "Rejeté"}</h1><p>${name}</p><p>${msg}</p></div></body></html>`;

  if (!secret || secret !== validSecret)
    return res.status(401).send(html(false, "Accès refusé", "Secret invalide."));
  if (!id || !["approve", "reject"].includes(action))
    return res.status(400).send(html(false, "Erreur", "Paramètres invalides."));

  const supabase = getSupabaseAdmin();
  const { data: user } = await supabase
    .from("users_requests").select("prenom, nom, statut").eq("id", id).single();

  if (!user) return res.status(404).send(html(false, "Introuvable", "Utilisateur introuvable."));

  if (user.statut !== "pending")
    return res.send(html(user.statut === "approved", `${user.prenom} ${user.nom}`, "Déjà traité."));

  await supabase.from("users_requests")
    .update({ statut: action === "approve" ? "approved" : "rejected", approved_at: new Date().toISOString() })
    .eq("id", id);

  return res.send(html(action === "approve", `${user.prenom} ${user.nom}`,
    action === "approve" ? "L'utilisateur peut maintenant se connecter." : "La demande a été rejetée."));
});
// ═══════════════════════════════════════════════════════════════
// أضف هذا الكود في server.ts بعد endpoint /api/approve مباشرة
// ═══════════════════════════════════════════════════════════════

app.post('/api/save-pv', async (req, res) => {
  try {
    const f = req.body
    const supabase = getSupabaseAdmin()

    const pvOrdre   = String(f.numero_pv_ordre || '').trim()
    const pvCarnet  = String(f.numero_carnet   || '').trim()
    const pvBrigade = String(f.brigade_code    || 'BM').trim()
    const numero_pv = [pvOrdre, pvCarnet, pvBrigade].filter(Boolean).join('/')

    const type_infraction_legacy =
      Array.isArray(f.infraction_types) && f.infraction_types.length > 0
        ? f.infraction_types.join(', ')
        : (f.infraction_free || null)

    const payload: Record<string, unknown> = {
      numero_pv,
      numero_pv_ordre:  parseInt(f.numero_pv_ordre) || null,
      numero_carnet:    f.numero_carnet    || null,
      brigade_code:     f.brigade_code     || 'BM',
      date_redaction:   f.date_redaction   || null,
      heure_constat:    f.heure_constat    || null,
      agent_1_nom:        f.agent_1_nom        || null,
      agent_1_grade:      f.agent_1_grade      || null,
      agent_1_residence:  f.agent_1_residence  || null,
      agent_2_nom:        f.nb_agents >= 2 ? (f.agent_2_nom       || null) : null,
      agent_2_grade:      f.nb_agents >= 2 ? (f.agent_2_grade     || null) : null,
      agent_2_residence:  f.nb_agents >= 2 ? (f.agent_2_residence || null) : null,
      agent_3_nom:        f.nb_agents >= 3 ? (f.agent_3_nom       || null) : null,
      agent_3_grade:      f.nb_agents >= 3 ? (f.agent_3_grade     || null) : null,
      agent_3_residence:  f.nb_agents >= 3 ? (f.agent_3_residence || null) : null,
      foret_nom:        f.foret_nom        || null,
      foret_nom_ar:     f.foret_nom_ar     || null,
      foret_section:    f.foret_section    || null,
      decret_num:       f.decret_num       || null,
      decret_date:      f.decret_date      || null,
      lieu_dit:         f.lieu_dit         || null,
      commune:          f.commune          || null,
      qiada:            f.qiada || f.commune || null,
      imaala:           f.imaala           || null,
      province:         f.imaala?.includes('الفنيدق') ? 'المضيق الفنيدق' : 'تطوان',
      coordonnees_lat:  parseFloat(f.coord_y) || null,
      coordonnees_lng:  parseFloat(f.coord_x) || null,
      coord_x:          parseFloat(f.coord_x) || null,
      coord_y:          parseFloat(f.coord_y) || null,
      infraction_types:   f.infraction_types || [],
      infraction_details: JSON.stringify(f.infraction_details || {}),
      infraction_free:    f.infraction_free  || null,
      surface_hectares:   parseInt(f.surface_hectares)  || 0,
      surface_ares:       parseInt(f.surface_ares)      || 0,
      surface_centiares:  parseInt(f.surface_centiares) || 0,
      degats: Array.isArray(f.degats) ? f.degats : [],
      contrevenant_nom:         f.contrevenant_nom         || null,
      contrevenant_prenom:      f.contrevenant_prenom      || null,
      contrevenant_nasab:       f.contrevenant_nasab       || null,
      contrevenant_mere:        f.contrevenant_mere        || null,
      contrevenant_ddn:         f.contrevenant_ddn         || null,
      contrevenant_lieu_naiss:  f.contrevenant_lieu_naiss  || null,
      contrevenant_situation:   f.contrevenant_situation   || null,
      contrevenant_profession:  f.contrevenant_profession  || null,
      contrevenant_cin:         f.contrevenant_cin         || null,
      contrevenant_adresse:     f.contrevenant_adresse     || null,
      contrevenant_hors_maroc:  f.contrevenant_hors_maroc  || false,
      description_juridique:    f.description_juridique    || null,
      transmis_parquet:          false,
      date_transmission_parquet: null,
      photos_urls: [],
      statut: f.statut || 'nouveau',
      // legacy
      pv_number:       numero_pv,
      date_infraction: f.date_redaction || new Date().toISOString().split('T')[0],
      lieu:            f.lieu_dit || f.commune || 'غير محدد',
      type_infraction: type_infraction_legacy || 'غير محدد',
      surface_ha:      (parseFloat(f.surface_hectares) || 0) + (parseFloat(f.surface_ares) || 0) / 100,
      description:     f.description_juridique || type_infraction_legacy || 'غير محدد',
      latitude:        parseFloat(f.coord_y) || 0,
      longitude:       parseFloat(f.coord_x) || 0,
    }

    Object.keys(payload).forEach(k => { if (payload[k] === undefined) delete payload[k] })

    const { data, error } = await supabase.from('infractions').insert([payload]).select('id').single()

    if (!error) {
      console.log(`✅ PV sauvegardé: ${numero_pv} (ID: ${data.id})`)
      return res.json({ success: true, id: data.id, numero_pv })
    }

    // Fallback sans colonnes legacy
    if (error.code === '42703' || error.message?.includes('column')) {
      console.warn('[save-pv] Fallback sans colonnes legacy')
      const LEGACY = new Set(['pv_number','date_infraction','lieu','type_infraction','surface_ha','description','latitude','longitude'])
      const core = Object.fromEntries(Object.entries(payload).filter(([k]) => !LEGACY.has(k)))
      const { data: d2, error: e2 } = await supabase.from('infractions').insert([core]).select('id').single()
      if (!e2) return res.json({ success: true, id: d2.id, numero_pv, degraded: true })
      return res.status(500).json({ success: false, error: e2.message })
    }

    console.error('[save-pv] Erreur:', error.message)
    return res.status(500).json({ success: false, error: error.message })
  } catch (err) {
    console.error('[save-pv] Exception:', err)
    return res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) })
  }
})
// ─── GEE PROXY (PythonAnywhere → Flask) ──────────────────────────────────────
// أضف هذا الـ block في server.ts قبل سطر: app.post("/api/logout", ...)
//
// الراوتنج:
//   /api/gee/health              → https://ZAMOUMEGEO.pythonanywhere.com/health
//   /api/gee/gee/analyze         → .../gee/analyze
//   /api/gee/gee/alerts          → .../gee/alerts
//   /api/gee/ndvi/latest         → .../ndvi/latest
//   /api/gee/domaine/stats       → .../domaine/stats
//   ... etc (strip /api/gee prefix → Flask path)
// ─────────────────────────────────────────────────────────────────────────────
app.all("/api/gee/*", async (req: any, res: any) => {
  const GEE_BASE =
    process.env.PYTHONANYWHERE_URL || "https://ZAMOUMEGEO.pythonanywhere.com";

  try {
    // Strip /api/gee → Flask path
    const flaskPath = req.path.replace("/api/gee", "");

    // Build query string for GET requests
    const queryEntries = Object.entries(req.query as Record<string, string>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    const qs =
      req.method === "GET" && queryEntries.length > 0
        ? "?" + queryEntries.join("&")
        : "";

    const targetUrl = `${GEE_BASE}${flaskPath}${qs}`;
    console.log(`[GEE Proxy] ${req.method} ${targetUrl}`);

    const fetchOptions: RequestInit = {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    // Add body for POST / PUT
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.method !== "OPTIONS" &&
      req.body &&
      Object.keys(req.body).length > 0
    ) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const flaskRes = await fetch(targetUrl, fetchOptions);

    // Forward headers
    const contentType =
      flaskRes.headers.get("content-type") || "application/json";
    const disposition = flaskRes.headers.get("content-disposition");
    const featureCount = flaskRes.headers.get("x-feature-count");

    res.status(flaskRes.status).setHeader("Content-Type", contentType);
    if (disposition) res.setHeader("Content-Disposition", disposition);
    if (featureCount) res.setHeader("X-Feature-Count", featureCount);
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Stream as buffer (handles JSON + binary/download responses)
    const buffer = await flaskRes.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error("[GEE Proxy Error]", err.message);
    res.status(502).json({
      success: false,
      gee: false,
      error: `Flask proxy indisponible: ${err.message}`,
    });
  }
});
// ─── FIN GEE PROXY ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
// أضف هذا الـ endpoint في server.ts قبل: app.post("/api/logout", ...)
// ═══════════════════════════════════════════════════════════════════════

// ── POST /api/change-password ─────────────────────────────────────────────────
app.post("/api/change-password", async (req: any, res: any) => {
  const sessionId = req.cookies?.["atlasforest-session"];
  if (!sessionId) return res.status(401).json({ error: "Non authentifié" });

  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: "Champs manquants" });
  if (newPassword.length < 8) return res.status(400).json({ error: "Minimum 8 caractères" });

  try {
    const supabase = getSupabaseAdmin();

    // Récupérer l'utilisateur par session (email stocké dans le cookie)
    // Pour admin hardcodé
    if (sessionId === "admin") {
      return res.status(400).json({ error: "Le compte admin ne peut pas changer de mot de passe ici." });
    }

    // Récupérer l'email depuis la session (stored as email in cookie OR lookup)
    // On suppose que sessionId === email de l'utilisateur
    const { data: userRow, error: fetchErr } = await supabase
      .from("users_requests")
      .select("id, password, email")
      .eq("email", sessionId)
      .single();

    if (fetchErr || !userRow) {
      // Essai avec sessionId comme id
      const { data: byId } = await supabase
        .from("users_requests")
        .select("id, password, email")
        .eq("id", sessionId)
        .single();

      if (!byId) return res.status(404).json({ error: "Utilisateur non trouvé" });

      const valid = await bcrypt.compare(oldPassword, byId.password);
      if (!valid) return res.status(401).json({ error: "Ancien mot de passe incorrect" });

      const hashed = await bcrypt.hash(newPassword, 10);
      await supabase.from("users_requests").update({ password: hashed }).eq("id", byId.id);
      return res.json({ success: true });
    }

    const valid = await bcrypt.compare(oldPassword, userRow.password);
    if (!valid) return res.status(401).json({ error: "Ancien mot de passe incorrect" });

    const hashed = await bcrypt.hash(newPassword, 10);
    const { error: updateErr } = await supabase
      .from("users_requests")
      .update({ password: hashed })
      .eq("id", userRow.id);

    if (updateErr) throw updateErr;
    res.json({ success: true, message: "Mot de passe modifié avec succès" });

  } catch (err: any) {
    console.error("[change-password]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
// ─── POST /api/logout ────────────────────────────────────────────────────────
app.post("/api/logout", (req, res) => {
  res.clearCookie("atlasforest-session", { path: "/" });
  res.json({ success: true });
});

// ─── GET /api/me (restaurer session au refresh) ──────────────────────────────
app.get("/api/me", async (req, res) => {
  const sessionId = req.cookies?.["atlasforest-session"];
  if (!sessionId) return res.status(401).json({ error: "Non authentifié" });

  if (sessionId === "admin")
    return res.json({ id: "admin", prenom: "Ahmed", nom: "ZAMOUME",
      grade: "Administrateur Système", email: "zamoume@anef.gov.ma", role: "admin" });

  try {
    const supabase = getSupabaseAdmin();
    const { data: user, error } = await supabase
      .from("users_requests")
      .select("id, prenom, nom, email, grade, statut")
      .eq("id", sessionId).single();

    if (error || !user || user.statut !== "approved")
      return res.status(401).json({ error: "Session invalide" });

    return res.json({ id: user.id, prenom: user.prenom, nom: user.nom,
      grade: user.grade, email: user.email, role: "agent" });
  } catch {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
