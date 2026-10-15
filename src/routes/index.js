const express = require('express');
const router = express.Router();

// Importamos las funciones del controlador
const {
  calcularMejorOpcion,
  getTiposCombustibles,
  getEstacionesCercanas,
} = require('../controllers/fuelController');

// 1. Health check
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// 2. Rutas del frontend
router.get('/combustibles/tipos', getTiposCombustibles);
router.get('/combustibles/estaciones-cercanas', getEstacionesCercanas);
router.post('/combustibles/calcular', calcularMejorOpcion);

module.exports = router;