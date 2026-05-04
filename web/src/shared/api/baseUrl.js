const normalizeUrl = (value = "") => String(value || "").trim().replace(/\/+$/, "");

const envApiUrl = normalizeUrl(import.meta.env.VITE_API_URL);
const isProd = import.meta.env.PROD;

const fallbackApiUrl = isProd
  ? `${window.location.origin}/api`
  : "http://localhost:5000/api";

if (!envApiUrl && isProd) {
  console.warn(
    "VITE_API_URL is not set. Falling back to same-origin /api. Configure VITE_API_URL in your deployment for best reliability.",
  );
}

export const API_BASE_URL = envApiUrl || fallbackApiUrl;
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, "");
