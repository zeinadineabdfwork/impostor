// src/routes/userRoutes.js
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middlewares/authMiddleware');
const { upload }      = require('../middlewares/uploadMiddleware');
const {
  getProfile, updateUsername, uploadAvatar,
  getMatchHistory, getLeaderboard,
} = require('../controllers/userController');

router.get('/leaderboard',            getLeaderboard);
router.get('/:userId/profile',        getProfile);
router.get('/:userId/match-history',  requireAuth, getMatchHistory);
router.patch('/me/username',          requireAuth, updateUsername);
router.post('/me/avatar',             requireAuth, upload.single('avatar'), uploadAvatar);

module.exports = router;
