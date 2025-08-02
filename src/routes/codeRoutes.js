const express = require('express');
const router = express.Router();
const { getInfoByCode, validateCode } = require('../controllers/codeController');
const { verifyJWT } = require('../middlewares/auth');

/**
 * @route GET /api/code/:code
 * @desc Obtiene información detallada por código (conductor, visitante o registro)
 * @access Private
 */
router.get('/:code', verifyJWT, getInfoByCode);

/**
 * @route GET /api/code/validate/:code
 * @desc Valida si un código es válido (existe en el sistema)
 * @access Private
 */
router.get('/validate/:code', verifyJWT, validateCode);

module.exports = router;
