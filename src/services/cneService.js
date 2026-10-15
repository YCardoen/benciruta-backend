const axios = require('axios');

let tokenGuardado = null;
let tokenExpiracion = null;

let estacionesCache = null;
let ultimaDescarga = null;
const CACHE_MS = 1000 * 60 * 60; // 1 hora de memoria

const TIPOS_COMBUSTIBLES = [
  { id: 'gasolina 93', nombre: 'Gasolina 93 Octanos' },
  { id: 'gasolina 95', nombre: 'Gasolina 95 Octanos' },
  { id: 'gasolina 97', nombre: 'Gasolina 97 Octanos' },
  { id: 'diesel', nombre: 'Petróleo Diésel' },
  { id: 'glp', nombre: 'Gas Licuado de Petróleo (GLP)' }
];

async function obtenerTokenCNE() {
  const ahora = Date.now();

  if (tokenGuardado && (!tokenExpiracion || ahora < tokenExpiracion - 120000)) {
    return tokenGuardado;
  }

  const email = process.env.CNE_EMAIL;
  const password = process.env.CNE_PASSWORD;

  if (!email || !password) {
    throw new Error('Faltan CNE_EMAIL o CNE_PASSWORD en el archivo .env');
  }

  const url = `https://api.cne.cl/api/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
  // Timeout ampliado a 20s para el login
  const res = await axios.post(url, null, { timeout: 20000 });
  const token = res.data?.token || res.data?.data?.token;

  if (!token) {
    throw new Error('No se recibió token desde api.cne.cl');
  }

  tokenGuardado = token;
  tokenExpiracion = ahora + (1000 * 60 * 55);
  return tokenGuardado;
}

async function obtenerCatalogoCrudo() {
  const ahora = Date.now();

  if (estacionesCache && ultimaDescarga && (ahora - ultimaDescarga < CACHE_MS)) {
    return estacionesCache;
  }

  try {
    const token = await obtenerTokenCNE();
    console.log('🌐 Actualizando catálogo desde CNE...');

    // Timeout ampliado a 30s para la descarga de estaciones
    const response = await axios.get('https://api.cne.cl/api/v4/estaciones', {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    });

    const rawList = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    if (rawList.length > 0) {
      estacionesCache = rawList;
      ultimaDescarga = ahora;
      console.log(`⛽ CNE: ${estacionesCache.length} estaciones en memoria.`);
      return estacionesCache;
    }
  } catch (error) {
    console.error('⚠️ Problema al descargar de la CNE:', error.message);
    if (estacionesCache && estacionesCache.length > 0) {
      console.warn('Reutilizando catálogo previo en memoria.');
      return estacionesCache;
    }
  }

  return estacionesCache || [];
}

async function obtenerEstacionesCNE(tipoCombustible = 'gasolina 95', usuarioLat = null, usuarioLng = null, radioMaxKm = null) {
  const rawList = await obtenerCatalogoCrudo();
  const tipoNorm = (tipoCombustible || 'gasolina 95').toLowerCase();

  return rawList
    .map((e) => {
      const lat = parseFloat(e.ubicacion?.latitud || e.latitud || 0);
      const lng = parseFloat(e.ubicacion?.longitud || e.longitud || 0);

      const marca = e.distribuidor?.marca || e.distribuidor || 'Bencinera';
      const razon = e.razon_social || '';
      const nombre = razon ? `${marca} - ${razon}` : marca;

      const direccion = e.ubicacion?.direccion || e.direccion || 'Dirección no especificada';
      const comuna = e.ubicacion?.nombre_comuna || e.comuna || '';

      let precio = 0;
      if (e.precios && typeof e.precios === 'object') {
        for (const [nombreCombustible, datos] of Object.entries(e.precios)) {
          const n = nombreCombustible.toLowerCase();

          const match =
            (tipoNorm.includes('93') && n.includes('93')) ||
            (tipoNorm.includes('95') && n.includes('95')) ||
            (tipoNorm.includes('97') && n.includes('97')) ||
            (tipoNorm.includes('diesel') && (n.includes('diesel') || n.includes('diésel'))) ||
            (tipoNorm.includes('glp') && n.includes('glp'));

          if (match && datos?.precio) {
            precio = parseFloat(String(datos.precio).replace(',', '.'));
            break;
          }
        }
      }

      return {
        id: e.codigo || `${lat},${lng}`,
        nombre,
        marca,
        direccion,
        comuna,
        lat,
        lng,
        precioLitro: precio,
      };
    })
    .filter((e) => {
      if (isNaN(e.lat) || isNaN(e.lng) || e.lat === 0 || e.precioLitro <= 0) return false;

      if (usuarioLat !== null && usuarioLng !== null && radioMaxKm !== null) {
        const deltaGrados = (radioMaxKm + 5) / 111;
        if (Math.abs(e.lat - usuarioLat) > deltaGrados || Math.abs(e.lng - usuarioLng) > deltaGrados) {
          return false;
        }
      }

      return true;
    });
}

function listarTiposCombustibles() {
  return TIPOS_COMBUSTIBLES;
}

module.exports = {
  obtenerEstacionesCNE,
  listarTiposCombustibles,
};