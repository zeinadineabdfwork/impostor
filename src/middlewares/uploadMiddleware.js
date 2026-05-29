// src/middlewares/uploadMiddleware.js
// Configuração do Multer para upload de avatares em memória
const multer = require('multer');

const MAX_SIZE_MB = parseInt(process.env.MAX_AVATAR_SIZE_MB || '2', 10);
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const storage = multer.memoryStorage(); // Buffer em RAM → sharp processa e salva

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Apenas imagens JPEG, PNG, WebP e GIF são permitidas.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

module.exports = { upload };
