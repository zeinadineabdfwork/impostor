require('dotenv').config();
const io = require('socket.io-client');
const jwt = require('jsonwebtoken');

const URL = process.env.TEST_SERVER_URL || 'http://localhost:3000';
const TOTAL = 3;
const clients = [];

for (let i = 0; i < TOTAL; i++) {
  const token = jwt.sign({ sub: `bot_${Math.random().toString(36).slice(2,8)}`, type: 'guest', username: `bot${i+1}` }, process.env.JWT_SECRET || 'testsecret', { expiresIn: '4h' });
  const s = io(URL, { auth: { token }, transports: ['websocket', 'polling'] });
  s.on('connect', () => {
    console.log(`C${i+1} connected`, s.id);
    s.emit('room:quickmatch', { userId: `bot_${i+1}`, username: `bot${i+1}`, avatarUrl: null });
  });
  s.on('connect_error', (err) => console.error(`C${i+1} connect_error`, err.message));
  s.on('room:created', (d) => console.log(`C${i+1} room:created`, d.roomCode));
  s.on('room:joined', (d) => console.log(`C${i+1} room:joined`, d.roomCode));
  s.on('room:player-joined', (d) => console.log(`C${i+1} player-joined count`, d.players.length));
  s.on('game:started', (d) => console.log(`C${i+1} game started`, d.currentRound, d.totalRounds));
  clients.push(s);
}

setTimeout(() => {
  clients.forEach(s => s.disconnect());
  process.exit(0);
}, 15000);
