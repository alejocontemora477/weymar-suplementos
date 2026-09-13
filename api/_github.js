// Helpers compartidos: acceso al repo de GitHub y verificacion de la contrasena.
const crypto = require("crypto");

const REPO = process.env.GITHUB_REPO || "alejocontemora477/weymar-suplementos";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const API = "https://api.github.com";

function faltaConfig() {
  const faltan = [];
  if (!process.env.GITHUB_TOKEN) faltan.push("GITHUB_TOKEN");
  if (!process.env.ADMIN_PASSWORD) faltan.push("ADMIN_PASSWORD");
  return faltan;
}

// Comparacion en tiempo constante: evita deducir la contrasena midiendo cuanto tarda.
function passwordOk(recibida) {
  const esperada = process.env.ADMIN_PASSWORD;
  if (!esperada || typeof recibida !== "string") return false;
  const a = Buffer.from(String(recibida));
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function gh(ruta, opciones = {}) {
  const r = await fetch(`${API}/repos/${REPO}/${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "weymar-admin",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opciones.headers || {}),
    },
  });
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = texto ? JSON.parse(texto) : null; } catch (_) { cuerpo = texto; }
  if (!r.ok) {
    const err = new Error((cuerpo && cuerpo.message) || `GitHub respondio ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return cuerpo;
}

async function leerArchivo(ruta) {
  const data = await gh(`contents/${encodeURI(ruta)}?ref=${BRANCH}`);
  return {
    sha: data.sha,
    texto: Buffer.from(data.content, "base64").toString("utf8"),
  };
}

async function escribirArchivo(ruta, contenidoBase64, mensaje, sha) {
  const cuerpo = { message: mensaje, content: contenidoBase64, branch: BRANCH };
  if (sha) cuerpo.sha = sha;
  return gh(`contents/${encodeURI(ruta)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
}

async function shaDe(ruta) {
  try {
    const data = await gh(`contents/${encodeURI(ruta)}?ref=${BRANCH}`);
    return data.sha;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

module.exports = { REPO, BRANCH, faltaConfig, passwordOk, gh, leerArchivo, escribirArchivo, shaDe };
