import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = "Bearer " + token;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response) {
      const status = err.response.status;
      // Handle both 401 (Unauthorized) and 403 (Forbidden) when token is present
      if (status === 401 || (status === 403 && localStorage.getItem("token"))) {
        // Lazy import to avoid circular dependency (store imports api)
        const { default: useAuthStore } = await import("../stores/useAuthStore");
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (data) => api.post("/auth/login", data),
  register: (data) => api.post("/auth/register", data),
  me: () => api.get("/auth/me"),
  logout: () => api.post("/auth/logout"),
  refresh: (refreshToken) => api.post("/auth/refresh", { refreshToken }),
};

export const taskApi = {
  list: (params) => api.get("/tasks", { params }),
  get: (id) => api.get("/tasks/" + id),
  create: (data) => api.post("/tasks", data),
  cancel: (id) => api.post("/tasks/" + id + "/cancel"),
  retry: (id) => api.post("/tasks/" + id + "/retry"),
};

export const reportApi = {
  list: (params) => api.get("/reports", { params }),
  get: (id) => api.get("/reports/" + id),
  create: (data) => api.post("/reports", data),
  update: (id, data) => api.put("/reports/" + id, data),
  publish: (id) => api.post("/reports/" + id + "/publish"),
  review: (id) => api.post("/reports/" + id + "/review"),
  delete: (id) => api.delete("/reports/" + id),
  stats: () => api.get("/reports/stats"),
};

export const userApi = {
  list: (params) => api.get("/users", { params }),
  create: (data) => api.post("/users", data),
  get: (id) => api.get("/users/" + id),
  updateRole: (id, role) => api.put("/users/" + id + "/role", { role }),
  updateStatus: (id, status) => api.put("/users/" + id + "/status", { status }),
  stats: () => api.get("/users/stats"),
};

export const healthApi = {
  check: () => api.get("/health"),
  ping: () => api.get("/health/ping"),
};

export default api;
