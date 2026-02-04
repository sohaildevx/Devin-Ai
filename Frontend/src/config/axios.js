import axios from 'axios'

const DEFAULT_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001'

const axiosInstance = axios.create({
    baseURL: DEFAULT_BASE,
    withCredentials: true, // Send cookies with requests
})

// Add request interceptor to include token from memory if available
axiosInstance.interceptors.request.use(
    (config) => {
        // Try to get token from module-level storage
        const token = typeof window !== 'undefined' && window.__appToken;
        if (token && !config.headers['Authorization']) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

export default axiosInstance