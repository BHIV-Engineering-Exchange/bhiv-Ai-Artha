import axios from 'axios';
import toast from 'react-hot-toast';

const trimTrailingSlash = (value) => value.replace(/\/$/, '');

function resolveApiConfig() {
  const envBase = import.meta.env.VITE_API_URL?.trim();
  const envOrigin = import.meta.env.VITE_API_ORIGIN?.trim();

  if (envBase) {
    return {
      baseUrl: trimTrailingSlash(envBase),
      origin: envOrigin ? trimTrailingSlash(envOrigin) : trimTrailingSlash(envBase).replace(/\/api\/v1$/, ''),
    };
  }

  if (envOrigin) {
    const origin = trimTrailingSlash(envOrigin);
    return { baseUrl: `${origin}/api/v1`, origin };
  }

  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

    if (isLocal) {
      return { baseUrl: '/api/v1', origin: window.location.origin };
    }

    const normalizedOrigin = trimTrailingSlash(origin);
    return { baseUrl: `${normalizedOrigin}/api/v1`, origin: normalizedOrigin };
  }

  return { baseUrl: 'http://localhost:5000/api/v1', origin: 'http://localhost:5000' };
}

const { baseUrl: API_BASE_URL, origin: API_ORIGIN } = resolveApiConfig();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => {
    const contentType = response.headers?.['content-type'] || '';
    if (contentType.includes('text/html') || (typeof response.data === 'string' && response.data.trim().startsWith('<!DOCTYPE'))) {
      const error = new Error('Invalid API response: received HTML instead of JSON');
      error.response = response;
      return Promise.reject(error);
    }
    return response;
  },
  (error) => {
    const reqUrl = error.config?.url || '';
    const silent401Me = error.response?.status === 401 && reqUrl.includes('/auth/me');
    if (!silent401Me && error.response?.status !== 401) {
      const message = error.response?.data?.message || error.response?.data?.error || 'An error occurred';

      if (error.response?.status === 403) {
        if (error.response?.data?.code === 'app_not_allowed') {
          toast.error('Your account is not enabled for this app.');
        } else if (error.response?.data?.error === 'AUTHORITY_VIOLATION') {
          // Authority violation - route not mapped
        } else if (error.response?.data?.error === 'POLICY_VIOLATION') {
          // Policy violation
        } else {
          toast.error(error.response?.data?.message || 'You do not have permission to perform this action');
        }
      } else if (error.response?.status === 409) {
        toast.error(message);
      } else if (error.response?.status === 429) {
        toast.error(message);
      } else if (error.response?.status === 503) {
        toast.error(message || 'Service temporarily unavailable. Try again in a moment.');
      } else if (error.response?.status === 400) {
        const errors = error.response?.data?.errors;
        if (errors && Array.isArray(errors)) {
          errors.forEach((err) => toast.error(err.msg || err.message));
        } else {
          toast.error(message);
        }
      } else if (error.response?.status >= 500) {
        const isAuthFlowUrl = reqUrl.includes('/auth/login') || reqUrl.includes('/auth/signup');
        toast.error(isAuthFlowUrl ? message : 'Server error. Please try again later.');
      }
    }

    if (error.response?.status === 401 && !reqUrl.includes('/auth/login') && !reqUrl.includes('/auth/signup') && !reqUrl.includes('/auth/me')) {
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export { API_ORIGIN };
export { API_BASE_URL };
export default api;
