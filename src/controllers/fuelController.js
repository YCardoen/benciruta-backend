const { optimizarBencineras } = require('../services/fuelOptimizerService');
const { obtenerEstacionesCNE, listarTiposCombustibles } = require('../services/cneService');
const { calcularDistanciaKm } = require('../utils/geo');
const { obtenerDistanciasRutaKm } = require('../services/mapboxService');

// Máximo de estaciones a las que se les calcula ruta (24 por consulta a Mapbox)
const MAX_CANDIDATAS = 96;

// 1. Catálogo de combustibles (GET /api/combustibles/tipos)
function getTiposCombustibles(req, res) {
  return res.status(200).json({
    tipos: listarTiposCombustibles(),
  });
}

// 2. Estaciones cercanas para el mapa (GET /api/combustibles/estaciones-cercanas)
async function getEstacionesCercanas(req, res, next) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const radioKm = parseFloat(req.query.radioKm) || 10;
    const tipoCombustible = req.query.tipoCombustible || 'gasolina 95';

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Parámetros "lat" y "lng" son obligatorios y numéricos.' });
    }

    const estaciones = await obtenerEstacionesCNE(tipoCombustible, lat, lng, radioKm);

    const enRadio = estaciones
      .map((e) => {
        const distanciaKm = calcularDistanciaKm(lat, lng, e.lat, e.lng);
        return {
          ...e,
          distanciaKm: Number(distanciaKm.toFixed(2)),
        };
      })
      .filter((e) => e.distanciaKm <= radioKm)
      .sort((a, b) => a.distanciaKm - b.distanciaKm);

    return res.status(200).json({
      tipoCombustible,
      total: enRadio.length,
      estaciones: enRadio,
    });
  } catch (error) {
    return next(error);
  }
}

// 3. Cálculo de optimización (POST /api/combustibles/calcular)
async function calcularMejorOpcion(req, res, next) {
  try {
    const {
      lat,
      lng,
      litrosACargar = 40,
      rendimientoKmL = 12,
      radioMaxKm = 10,
      tipoCombustible = 'gasolina 95',
    } = req.body;

    const uLat = parseFloat(lat);
    const uLng = parseFloat(lng);
    const litros = parseFloat(litrosACargar);
    const rendimiento = parseFloat(rendimientoKmL);
    const radio = parseFloat(radioMaxKm);

    if (isNaN(uLat) || isNaN(uLng)) {
      return res.status(400).json({ error: 'Latitud y longitud son requeridas.' });
    }
    if (litros <= 0 || rendimiento <= 0) {
      return res.status(400).json({ error: 'Litros a cargar y rendimiento deben ser mayores a 0.' });
    }

    const estaciones = await obtenerEstacionesCNE(tipoCombustible, uLat, uLng, radio);

    // Distancia por ruta real hacia las estaciones dentro del radio (las más cercanas primero)
    const dentroDelRadio = estaciones
      .map((e) => ({ ...e, lineaRecta: calcularDistanciaKm(uLat, uLng, e.lat, e.lng) }))
      .filter((e) => e.lineaRecta <= radio)
      .sort((a, b) => a.lineaRecta - b.lineaRecta)
      .slice(0, MAX_CANDIDATAS);

    let distanciasRutaKm = null;
    try {
      distanciasRutaKm = await obtenerDistanciasRutaKm({ lat: uLat, lng: uLng }, dentroDelRadio);
    } catch (error) {
      // Si Mapbox no responde, se calcula con la línea recta en vez de dejar al usuario sin resultados
      console.warn('⚠️ No se pudieron obtener rutas de Mapbox, se usa línea recta:', error.message);
    }

    const ranking = optimizarBencineras({
      usuarioLat: uLat,
      usuarioLng: uLng,
      litrosACargar: litros,
      rendimientoKmL: rendimiento,
      radioMaxKm: radio,
      estaciones: dentroDelRadio,
      distanciasRutaKm,
    });

    const mejorOpcion = ranking[0] || null;

    return res.status(200).json({
      tipoCombustible,
      parametrosConsulta: {
        ubicacion: { lat: uLat, lng: uLng },
        litrosACargar: litros,
        rendimientoKmL: rendimiento,
        radioMaxKm: radio,
      },
      totalOpcionesEncontradas: ranking.length,
      mejorOpcion,
      ranking,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getTiposCombustibles,
  getEstacionesCercanas,
  calcularMejorOpcion,
};