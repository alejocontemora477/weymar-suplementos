const { passwordOk, faltaConfig } = require("./_github");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }
  const faltan = faltaConfig();
  if (faltan.length) {
    return res.status(500).json({ error: `Falta configurar en Vercel: ${faltan.join(", ")}` });
  }
  const { password } = req.body || {};
  if (!passwordOk(password)) {
    // Demora deliberada para que probar contrasenas a lo bruto sea lento.
    await new Promise((r) => setTimeout(r, 1000));
    return res.status(401).json({ error: "Contrasena incorrecta" });
  }
  return res.status(200).json({ ok: true });
};
