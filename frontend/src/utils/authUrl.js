/**
 * Build a URL with the JWT token as a query param.
 * Used for <img src>, <iframe src>, <a download> where
 * the browser can't send an Authorization header.
 */
export function authUrl(path) {
  const token = localStorage.getItem('token');
  const sep = path.includes('?') ? '&' : '?';
  return token ? `${path}${sep}token=${token}` : path;
}
