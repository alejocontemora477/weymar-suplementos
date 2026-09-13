const { passwordOk, faltaConfig, escribirArchivo, shaDe } = require("./_github");

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB ya convertida: de sobra para una foto de catalogo

// Aceptamos los dos formatos que un navegador puede generar desde un canvas.
// Safari en iPhone no siempre sabe exportar WebP, asi que JPEG es el plan B.
const FORMATOS = {
  webp: {
    ext: "webp",
    firma: (b) => b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP",
  },
  jpeg: {
    ext: "jpg",
    firma: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }
  const faltan = faltaConfig();
  if (faltan.length) {
    return res.status(500).json({ error: `Falta configurar en Vercel: ${faltan.join(", ")}` });
  }

  const { password, id, dataUrl } = req.body || {};
  if (!passwordOk(password)) {
    await new Promise((r) => setTimeout(r, 1000));
    return res.status(401).json({ error: "Contrasena incorrecta" });
  }

  if (!/^[a-z0-9-]{2,60}$/.test(String(id || ""))) {
    return res.status(400).json({ error: "Id invalido" });
  }

  const m = /^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) return res.status(400).json({ error: "La imagen debe llegar como WebP o JPEG en base64" });
  const formato = FORMATOS[m[1]];

  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length === 0) return res.status(400).json({ error: "La imagen llego vacia" });
  if (bytes.length > MAX_BYTES) {
    return res.status(413).json({ error: `La imagen pesa ${Math.round(bytes.length / 1024)} KB y el maximo es 3072 KB` });
  }
  // Comprobamos la firma real del archivo, no solo lo que dice el encabezado.
  if (!formato.firma(bytes)) {
    return res.status(400).json({ error: `El archivo no es un ${m[1].toUpperCase()} valido` });
  }

  const ruta = `img/${id}.${formato.ext}`;
  try {
    const sha = await shaDe(ruta); // si ya existe, lo reemplazamos
    await escribirArchivo(ruta, bytes.toString("base64"), `Subo la foto de ${id} desde el panel admin`, sha);
    return res.status(200).json({ ok: true, image: ruta, bytes: bytes.length });
  } catch (e) {
    return res.status(502).json({ error: `No pude subir la imagen: ${e.message}` });
  }
};
