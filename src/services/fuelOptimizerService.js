const { calcularDistanciaKm } = require('../utils/geo');

/**
 * Optimiza y clasifica bencineras según costo total (carga + viaje).
 */
function optimizarBencineras({
  usuarioLat,
  usuarioLng,
  litrosACargar,
  rendimientoKmL,
  radioMaxKm = 15,
  estaciones, // Lista de estaciones con { nombre, direccion, lat, lng, precioLitro }
  distanciasRutaKm = null, // Map id -> km por ruta real; si no viene, se usa la línea recta
}) {
  const resultados = [];

  for (const estacion of estaciones) {
    if (!estacion.lat || !estacion.lng || !estacion.precioLitro) continue;

    // 1. Distancia en línea recta entre el cliente y la estación (define el radio de búsqueda)
    const lineaRecta = calcularDistanciaKm(
      usuarioLat,
      usuarioLng,
      estacion.lat,
      estacion.lng
    );

    // Filtrar si excede el radio máximo deseado
    if (lineaRecta > radioMaxKm) continue;

    // Distancia por ruta real (Mapbox). Sin ruta hacia la estación, no es candidata válida.
    let distanciaKm = lineaRecta;
    if (distanciasRutaKm) {
      const ruta = distanciasRutaKm.get(estacion.id);
      if (ruta === undefined || ruta === null) continue;
      distanciaKm = ruta;
    }

    // 2. Costo del viaje (consideramos ida y vuelta = distancia * 2)
    const distanciaTotalViaje = distanciaKm * 2;
    const litrosConsumidosViaje = distanciaTotalViaje / rendimientoKmL;
    const costoViaje = Math.round(litrosConsumidosViaje * estacion.precioLitro);

    // 3. Costo de la bencina cargada
    const costoCarga = Math.round(litrosACargar * estacion.precioLitro);

    // 4. Costo Total Efectivo
    const costoTotal = costoCarga + costoViaje;

    resultados.push({
      id: estacion.id,
      nombre: estacion.nombre,
      direccion: estacion.direccion,
      distanciaKm: Number(distanciaKm.toFixed(2)),
      distanciaViajeTotalKm: Number(distanciaTotalViaje.toFixed(2)),
      precioLitro: estacion.precioLitro,
      costoCarga,
      costoViaje,
      costoTotal,
    });
  }

  // Ordenar por menor costo total
  resultados.sort((a, b) => a.costoTotal - b.costoTotal);

  // Calcular el ahorro comparativo frente a la estación más cercana
  if (resultados.length > 0) {
    // Buscar la estación más cercana físicamente
    const masCercana = [...resultados].sort((a, b) => a.distanciaKm - b.distanciaKm)[0];

    return resultados.map((item) => ({
      ...item,
      ahorroVsMasCercana: masCercana.costoTotal - item.costoTotal,
    }));
  }

  return [];
}

module.exports = { optimizarBencineras };