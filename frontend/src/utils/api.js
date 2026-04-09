import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = "Bearer " + token;
  /* #310: 确保分页参数 page >= 0，防止后端 500 */
  if (config.params && config.params.page != null) {
    config.params.page = Math.max(0, parseInt(config.params.page, 10) || 0);
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response) {
      const status = err.response.status;
      const url = err.config?.url || "";
      const data = err.response.data;
      // Attach readable error message for consumers
      const backendMsg = data?.message || data?.error || "";
      /* #309: 检测 JSON 解析错误，显示友好提示 */
      const isJsonParseError = status === 500 && backendMsg &&
        (/parse|json|malformed|deserializ/i.test(backendMsg));
      err.displayMessage = isJsonParseError
        ? "请求格式错误，请检查输入数据"
        : backendMsg
          ? `[${status}] ${backendMsg}`
          : `请求失败 (HTTP ${status})`;
      // Don't auto-logout for auth endpoints (login/register failures return 401/400)
      const isAuthEndpoint = url.includes("/auth/login") || url.includes("/auth/register");
      if (!isAuthEndpoint && (status === 401 || (status === 403 && localStorage.getItem("token")))) {
        const { default: useAuthStore } = await import("../stores/useAuthStore");
        useAuthStore.getState().logout();
      }
    } else if (err.request) {
      err.displayMessage = "网络异常，请检查连接";
    } else {
      err.displayMessage = err.message || "未知错误";
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
  complete: (id, data) => api.post("/tasks/" + id + "/complete", data),
};

export const reportApi = {
  list: (params) => api.get("/chip-reports", { params }),
  get: (id) => api.get("/chip-reports/" + id),
  create: (data) => api.post("/chip-reports", data),
  update: (id, data) => api.put("/chip-reports/" + id, data),
  publish: (id) => api.post("/chip-reports/" + id + "/publish"),
  review: (id) => api.post("/chip-reports/" + id + "/review"),
  delete: (id) => api.delete("/chip-reports/" + id),
  stats: () => api.get("/chip-reports/stats"),
};

export const chipReportApi = {
  list: (params) => api.get("/chip-reports", { params }),
  get: (id) => api.get("/chip-reports/" + id),
  getByChip: (chipId) => api.get("/chip-reports/chip/" + chipId),
  getByPlan: (planId) => api.get("/chip-reports/plan/" + planId),
  compare: (ids) => api.get("/chip-reports/compare", { params: { ids: ids.join(",") } }),
  delete: (id) => api.delete("/chip-reports/" + id),
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

/* Agent 直连 API — K8s 集群管理（通过 agent:8090） */
const agentApi = axios.create({ baseURL: "/agent-api" });

export const k8sApi = {
  clusterInfo: () => agentApi.get("/k8s/cluster-info"),
  nodes: () => agentApi.get("/k8s/nodes"),
  validate: (kubeconfig) =>
    agentApi.post("/k8s/validate", { kubeconfig }),
  deployAgent: (data) => agentApi.post("/k8s/deploy-agent", data),
  registerNodes: (data) => agentApi.post("/k8s/register-nodes", data),
};

export const nodeApi = {
  list: (params) => api.get("/nodes", { params }),
  get: (id) => api.get("/nodes/" + id),
  register: (data) => api.post("/nodes/register", data),
  delete: (id) => api.delete("/nodes/" + id),
  update: (id, data) => api.put("/nodes/" + id, data),
};
