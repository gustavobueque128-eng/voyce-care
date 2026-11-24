/* Cliente da API. A sessão fica num cookie HttpOnly; o cabeçalho X-Requested-With protege contra CSRF. */
const listeners = new Set();
export const onUnauthorized = fn => { listeners.add(fn); return () => listeners.delete(fn); };

async function req(method, url, body) {
  let r;
  try {
    r = await fetch(url, {
      method, credentials: "same-origin",
      headers: { "X-Requested-With": "voyce", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (e) { throw new Error("Sem conexão com o servidor. Verifique se ele está ligado."); }
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (r.status === 401 && !url.includes("/auth/login")) listeners.forEach(f => f());
  if (!r.ok) { const e = new Error((data && data.error) || `Erro ${r.status}`); e.status = r.status; throw e; }
  return data;
}

export const api = {
  get: url => req("GET", url),
  post: (url, body = {}) => req("POST", url, body),
  put: (url, body = {}) => req("PUT", url, body)
};
