const axios = require('axios');

// La API Matrix de Mapbox admite 25 coordenadas por consulta: el origen + 24 destinos
const MAX_DESTINOS = 24;

/**
 * Distancia por ruta (en auto) desde el origen hasta cada estación, en km.
 * Devuelve un Map id -> km. Si no hay ruta hacia una estación, su valor es null.
 */
async function obtenerDistanciasRutaKm(origen, estaciones) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    throw new Error('Falta MAPBOX_TOKEN en el archivo .env');
  }

  const grupos = [];
  for (let i = 0; i < estaciones.length; i += MAX_DESTINOS) {
    grupos.push(estaciones.slice(i, i + MAX_DESTINOS));
  }

  const resultados = await Promise.all(
    grupos.map(async (grupo) => {
      const coords = [origen, ...grupo].map((p) => `${p.lng},${p.lat}`).join(';');
      const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}`;
      const res = await axios.get(url, {
        params: { sources: 0, annotations: 'distance', access_token: token },
        timeout: 10000,
      });
      const fila = res.data?.distances?.[0];
      if (!fila) throw new Error('Respuesta inválida de Mapbox Matrix');
      // fila[0] es el origen consigo mismo; los destinos empiezan en el índice 1
      return grupo.map((e, i) => [e.id, fila[i + 1] == null ? null : fila[i + 1] / 1000]);
    })
  );

  return new Map(resultados.flat());
}

module.exports = { obtenerDistanciasRutaKm };
