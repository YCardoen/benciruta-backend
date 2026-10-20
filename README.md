# BenciRuta – Backend

API REST en Node.js (Express) que ayuda a elegir la bencinera más conveniente. Obtiene estaciones y precios desde la **CNE** (Comisión Nacional de Energía), mide la distancia real por calles con **Mapbox** y calcula el **costo total** de cargar en cada estación: combustible + traslado hasta ella.

## ¿Qué hace?

1. Descarga el catálogo de estaciones de servicio de Chile desde `api.cne.cl` y lo guarda en memoria.
2. Filtra las estaciones que están dentro del radio pedido y que tienen precio para el combustible elegido.
3. Consulta a Mapbox la distancia por ruta (en auto) desde el origen hasta cada estación.
4. Calcula el costo de cada alternativa y las ordena de la más barata a la más cara.
5. Informa cuánto se ahorra frente a ir a la estación más cercana.

## Requisitos

- Node.js 18 o superior
- Una cuenta en la API de la CNE (https://api.cne.cl)
- Un token público de Mapbox (https://account.mapbox.com)

## Instalación y ejecución

```bash
npm install
cp .env.example .env     # en Windows: Copy-Item .env.example .env
# edita .env con tus credenciales
npm run dev              # desarrollo, se reinicia al guardar cambios
# o
npm start                # producción
```

El servidor queda en `http://localhost:4000`. Nodemon no relee el `.env` al guardar cambios: si lo modificas, reinicia el servidor.

### Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `PORT` | No | Puerto del servidor. Por defecto `4000`. |
| `CNE_EMAIL` | Sí | Correo con el que te registraste en api.cne.cl. |
| `CNE_PASSWORD` | Sí | Contraseña de esa cuenta. |
| `MAPBOX_TOKEN` | Recomendada | Token público de Mapbox (`pk...`). Sin él se usa la distancia en línea recta. |

El archivo `.env` está en `.gitignore`: nunca lo subas al repositorio.

## Endpoints

Todas las rutas empiezan con `/api`.

### `GET /api/health`
Comprueba que el servidor está vivo.

```json
{ "status": "ok", "uptime": 1242.7 }
```

### `GET /api/combustibles/tipos`
Lista de combustibles disponibles. Los `id` son los valores válidos para `tipoCombustible`.

```json
{
  "tipos": [
    { "id": "gasolina 93", "nombre": "Gasolina 93 Octanos" },
    { "id": "gasolina 95", "nombre": "Gasolina 95 Octanos" },
    { "id": "gasolina 97", "nombre": "Gasolina 97 Octanos" },
    { "id": "diesel", "nombre": "Petróleo Diésel" },
    { "id": "glp", "nombre": "Gas Licuado de Petróleo (GLP)" }
  ]
}
```

### `GET /api/combustibles/estaciones-cercanas`
Estaciones dentro de un radio, ordenadas de la más cercana a la más lejana. Pensado para dibujar el mapa.

| Parámetro | Obligatorio | Por defecto | Descripción |
|---|---|---|---|
| `lat` | Sí | – | Latitud del origen |
| `lng` | Sí | – | Longitud del origen |
| `radioKm` | No | `10` | Radio de búsqueda en km |
| `tipoCombustible` | No | `gasolina 95` | Uno de los `id` de `/tipos` |

```
GET /api/combustibles/estaciones-cercanas?lat=-33.45&lng=-70.60&radioKm=5&tipoCombustible=gasolina 95
```

```json
{
  "tipoCombustible": "gasolina 95",
  "total": 14,
  "estaciones": [
    {
      "id": "co01007",
      "nombre": "COPEC - Administradora de Ventas al Detalle",
      "marca": "COPEC",
      "direccion": "Lord Cochrane 152",
      "comuna": "Santiago Centro",
      "lat": -33.4477,
      "lng": -70.6546,
      "precioLitro": 1544,
      "distanciaKm": 0.55
    }
  ]
}
```

Aquí `distanciaKm` es **en línea recta**. Si falta `lat` o `lng`, responde `400`.

### `POST /api/combustibles/calcular`
Calcula la mejor opción y devuelve el ranking completo.

**Body (JSON):**

| Campo | Obligatorio | Por defecto | Descripción |
|---|---|---|---|
| `lat` | Sí | – | Latitud del origen |
| `lng` | Sí | – | Longitud del origen |
| `litrosACargar` | No | `40` | Litros que se quieren cargar |
| `rendimientoKmL` | No | `12` | Rendimiento del vehículo en km/L |
| `radioMaxKm` | No | `10` | Radio máximo de búsqueda en km |
| `tipoCombustible` | No | `gasolina 95` | Uno de los `id` de `/tipos` |

```json
{
  "lat": -33.4549,
  "lng": -70.5958,
  "litrosACargar": 30,
  "rendimientoKmL": 10,
  "radioMaxKm": 5,
  "tipoCombustible": "gasolina 95"
}
```

**Respuesta:**

```json
{
  "tipoCombustible": "gasolina 95",
  "parametrosConsulta": {
    "ubicacion": { "lat": -33.4549, "lng": -70.5958 },
    "litrosACargar": 30,
    "rendimientoKmL": 10,
    "radioMaxKm": 5
  },
  "totalOpcionesEncontradas": 37,
  "mejorOpcion": { "...": "primer elemento del ranking" },
  "ranking": [
    {
      "id": "co01007",
      "nombre": "GO! - Comercializadora LF",
      "direccion": "…",
      "distanciaKm": 1.39,
      "distanciaViajeTotalKm": 2.78,
      "precioLitro": 1449,
      "costoCarga": 43350,
      "costoViaje": 401,
      "costoTotal": 43751,
      "ahorroVsMasCercana": 2234
    }
  ]
}
```

Si `lat`/`lng` no son numéricos, o `litrosACargar`/`rendimientoKmL` son menores o iguales a 0, responde `400`. Si no hay estaciones válidas, `ranking` viene vacío y `mejorOpcion` es `null`.

Esta respuesta **no incluye** `lat`, `lng`, `marca` ni `comuna` de cada estación. Si las necesitas (por ejemplo, para el mapa), cruza por `id` con `/estaciones-cercanas`.

## Cómo se calcula el costo

Para cada estación dentro del radio:

```
distanciaViajeTotalKm = distanciaKm × 2                 (ida y vuelta)
costoViaje   = (distanciaViajeTotalKm ÷ rendimientoKmL) × precioLitro
costoCarga   = litrosACargar × precioLitro
costoTotal   = costoCarga + costoViaje
ahorroVsMasCercana = costoTotal de la estación más cercana − costoTotal de esta
```

- `distanciaKm` es la distancia **por ruta real** de Mapbox. Una estación sin ruta posible se descarta.
- El radio se mide en **línea recta**; el costo usa la distancia por ruta.
- Los importes se redondean a pesos (CLP).
- Un `ahorroVsMasCercana` positivo significa que conviene más que la más cercana; negativo, que conviene menos.

## Fuentes de datos

### CNE (`cneService.js`)
- Inicia sesión en `api.cne.cl` y guarda el token unos 55 minutos.
- Descarga todas las estaciones (`/api/v4/estaciones`) y las mantiene **1 hora en memoria**. Si la descarga falla, reutiliza la copia anterior.
- Normaliza cada estación y descarta las que no tienen coordenadas o precio para el combustible pedido.
- Aplica un filtro rápido por recuadro de coordenadas alrededor del usuario.

### Mapbox (`mapboxService.js`)
- Usa la API **Matrix** (`driving`) para obtener la distancia del origen a muchas estaciones en una sola consulta (hasta 24 destinos por llamada).
- Calcula rutas para como máximo las **96 estaciones más cercanas** en línea recta.
- Si Mapbox falla o falta `MAPBOX_TOKEN`, el servidor **usa la línea recta** y lo avisa en consola, para no dejar al usuario sin resultados.

## Estructura del proyecto

```
src/
├── index.js                       # Arranca el servidor
├── app.js                         # Express: CORS, JSON, rutas, errores 404/500
├── routes/index.js                # Define los endpoints bajo /api
├── controllers/fuelController.js  # Valida la petición y arma la respuesta
├── services/
│   ├── cneService.js              # Conexión a la CNE, caché y normalización
│   ├── mapboxService.js           # Distancias por ruta (Mapbox Matrix)
│   └── fuelOptimizerService.js    # Costos, ranking y ahorro
└── utils/geo.js                   # Distancia en línea recta (Haversine)
```

## Errores

| Código | Cuándo |
|---|---|
| `400` | Faltan parámetros obligatorios o tienen valores inválidos |
| `404` | La ruta no existe (`{ "error": "Ruta no encontrada" }`) |
| `500` | Error interno (`{ "error": "…" }`) |

Si la CNE no responde y no hay catálogo en memoria, las rutas de estaciones devuelven una lista vacía en vez de un error. Revisa la consola del servidor para ver el motivo.

## Limitaciones conocidas

- El costo de traslado considera **ida y vuelta** (×2).
- El backend no limita la búsqueda a una comuna: busca en todo Chile.
- La primera consulta tras arrancar es más lenta, porque descarga el catálogo completo de la CNE.
- El catálogo se actualiza cada hora; los precios pueden estar desfasados hasta ese tiempo.
