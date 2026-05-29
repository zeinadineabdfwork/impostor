// src/routes/authRoutes.js
const express = require('express');
const router  = express.Router();
const rateLimit = require('express-rate-limit');
const { register, login, guestLogin, refreshToken } = require('../controllers/authController');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { error: 'Demasiadas tentativas. Tente novamente em 15 minutos.' },
});

router.post('/register',      authLimiter, register);
router.post('/login',         authLimiter, login);
router.post('/guest',         authLimiter, guestLogin);
router.post('/refresh-token', refreshToken);

module.exports = router;
