const { passwordOk, faltaConfig, leerArchivo, escribirArchivo } = require("./_github");

const ARCHIVO = "productos.json";
const CATEGORIAS = ["creatina", "proteinas", "pre", "salud", "barritas"];
const MAX_PRODUCTOS = 500;
const MAX_SABORES = 12;

// Valida y normaliza lo que manda el admin. Nunca confiamos en el cliente:
// si algo no cierra, cortamos antes de escribir en el repo.
function revisar(lista) {
  if (!Array.isArray(lista)) return { error: "El cuerpo debe traer un array de productos" };
  if (lista.length === 0) return { error: "La lista no puede quedar vacia" };
  if (lista.length > MAX_PRODUCTOS) return { error: `Maximo ${MAX_PRODUCTOS} productos` };

  const vistos = new Set();
  const limpios = [];

  for (const p of lista) {
    if (!p || typeof p !== "object") return { error: "Hay un producto que no es un objeto" };

    const id = String(p.id || "").trim();
    if (!/^[a-z0-9-]{2,60}$/.test(id)) {
      return { error: `Id invalido: "${id}". Use minusculas, numeros y guiones.` };
    }
    if (vistos.has(id)) return { error: `Id repetido: "${id}"` };
    vistos.add(id);

    const cat = String(p.cat || "").trim();
    if (!CATEGORIAS.includes(cat)) return { error: `Categoria invalida en "${id}": "${cat}"` };

    const name = String(p.name || "").trim();
    if (!name || name.length > 200) return { error: `Nombre invalido en "${id}"` };

    const brand = String(p.brand || "").trim();
    if (brand.length > 100) return { error: `Marca demasiado larga en "${id}"` };

    const desc = String(p.desc == null ? "" : p.desc).trim();
    if (desc.length > 600) return { error: `Descripcion demasiado larga en "${id}"` };

    const price = Number(p.price);
    if (!Number.isFinite(price) || price < 0 || price > 100000000) {
      return { error: `Precio invalido en "${id}"` };
    }

    const stock = Number(p.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 100000) {
      return { error: `Stock invalido en "${id}": debe ser un entero de 0 en adelante` };
    }

    const image = String(p.image || "").trim();
    // Solo rutas locales dentro de img/: evita incrustar imagenes de terceros.
    if (image && !/^img\/[A-Za-z0-9._-]+$/.test(image)) {
      return { error: `Imagen invalida en "${id}": debe ser un archivo dentro de img/` };
    }

    // Variantes de sabor. Es opcional: si no viene, el producto no tiene sabores.
    let flavors = null;
    if (p.flavors != null) {
      if (!Array.isArray(p.flavors)) return { error: `Sabores invalidos en "${id}": debe ser una lista` };
      if (p.flavors.length > MAX_SABORES) {
        return { error: `Demasiados sabores en "${id}": maximo ${MAX_SABORES}` };
      }
      const vistosSabor = new Set();
      flavors = [];
      for (const s of p.flavors) {
        const sabor = String(s == null ? "" : s).trim();
        if (!sabor || sabor.length > 60) return { error: `Sabor invalido en "${id}"` };
        const clave = sabor.toLowerCase();
        if (vistosSabor.has(clave)) return { error: `Sabor repetido en "${id}": "${sabor}"` };
        vistosSabor.add(clave);
        flavors.push(sabor);
      }
    }

    const limpio = { id, cat, brand, name, desc, price: Math.round(price), stock, image };
    if (p.offer === true) limpio.offer = true;
    if (flavors && flavors.length) limpio.flavors = flavors;
    limpios.push(limpio);
  }
  return { productos: limpios };
}

module.exports = async (req, res) => {
  const faltan = faltaConfig();
  if (faltan.length) {
    return res.status(500).json({ error: `Falta configurar en Vercel: ${faltan.join(", ")}` });
  }

  // Lectura: la version del repo, sin pasar por la cache del CDN.
  if (req.method === "GET") {
    try {
      const { texto } = await leerArchivo(ARCHIVO);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(JSON.parse(texto));
    } catch (e) {
      return res.status(502).json({ error: `No pude leer productos.json: ${e.message}` });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const { password, productos } = req.body || {};
  if (!passwordOk(password)) {
    await new Promise((r) => setTimeout(r, 1000));
    return res.status(401).json({ error: "Contrasena incorrecta" });
  }

  const revisado = revisar(productos);
  if (revisado.error) return res.status(400).json({ error: revisado.error });

  try {
    // Leemos el sha actual para que GitHub rechace la escritura si alguien
    // guardo algo en el medio, en vez de pisarlo en silencio.
    const { sha } = await leerArchivo(ARCHIVO);
    const json = JSON.stringify({ productos: revisado.productos }, null, 2) + "\n";
    await escribirArchivo(
      ARCHIVO,
      Buffer.from(json, "utf8").toString("base64"),
      `Actualizo el catalogo desde el panel admin (${revisado.productos.length} productos)`,
      sha
    );
    return res.status(200).json({ ok: true, total: revisado.productos.length });
  } catch (e) {
    if (e.status === 409) {
      return res.status(409).json({ error: "Alguien guardo cambios mientras editabas. Recarga y volve a intentar." });
    }
    return res.status(502).json({ error: `No pude guardar: ${e.message}` });
  }
};
