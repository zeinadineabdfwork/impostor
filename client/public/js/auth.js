// client/public/js/auth.js
// Persistência de sessão no localStorage e chamadas à API de autenticação

const Auth = (() => {
  const KEYS = { token: 'id_token', refresh: 'id_refresh', user: 'id_user' };

  function saveSession({ accessToken, refreshToken, user }) {
    localStorage.setItem(KEYS.token,   accessToken);
    if (refreshToken) localStorage.setItem(KEYS.refresh, refreshToken);
    localStorage.setItem(KEYS.user,    JSON.stringify(user));
  }

  function getToken()   { return localStorage.getItem(KEYS.token); }
  function getUser()    {
    try { return JSON.parse(localStorage.getItem(KEYS.user)); }
    catch { return null; }
  }
  function isLoggedIn() { return !!getToken(); }
  function logout()     { Object.values(KEYS).forEach(k => localStorage.removeItem(k)); }

  async function register(username, email, password) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro no registo.');
    saveSession(data);
    return data;
  }

  async function login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro no login.');
    saveSession(data);
    return data;
  }

  async function guestLogin(username) {
    const res = await fetch('/api/auth/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro no acesso como visitante.');
    saveSession({ accessToken: data.accessToken, user: data.user });
    return data;
  }

  async function uploadAvatar(file) {
    const form = new FormData();
    form.append('avatar', file);
    const res = await fetch('/api/users/me/avatar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro no upload.');
    // Actualizar user em cache
    const user = getUser();
    if (user) { user.avatar_url = data.avatar_url; localStorage.setItem(KEYS.user, JSON.stringify(user)); }
    return data;
  }

  async function getLeaderboard() {
    const res = await fetch('/api/users/leaderboard');
    if (!res.ok) throw new Error('Erro ao carregar leaderboard.');
    return res.json();
  }

  return { saveSession, getToken, getUser, isLoggedIn, logout, register, login, guestLogin, uploadAvatar, getLeaderboard };
})();
