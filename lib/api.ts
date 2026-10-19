import axios from 'axios';

const api = axios.create({
  baseURL: '',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiGet = async (url: string, params?: Record<string, unknown>, options?: { timeout?: number; signal?: AbortSignal }) => {
  try {
    const response = await api.get(url, { params, timeout: options?.timeout, signal: options?.signal });
    return response.data;
  } catch (error) {
    const response = (error as { response?: { data?: { code?: unknown }; status?: number } }).response;
    return {
      success: false,
      code: typeof response?.data?.code === 'string' ? response.data.code : undefined,
      status: response?.status,
      error: (error as Error & { response?: { data?: { error?: string }; status?: number } }).response?.data?.error || (error as Error & { response?: { data?: { error?: string }; status?: number } }).message || 'API request failed',
    };
  }
};

export const apiPost = async (url: string, data: unknown, options?: { headers?: Record<string, string>; timeout?: number }) => {
  try {
    const response = await api.post(url, data, options);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: (error as Error & { response?: { data?: { error?: string }; status?: number } }).response?.data?.error || (error as Error & { response?: { data?: { error?: string }; status?: number } }).message || 'API request failed',
    };
  }
};

export const apiPut = async (url: string, data: unknown) => {
  try {
    const response = await api.put(url, data);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: (error as Error & { response?: { data?: { error?: string }; status?: number } }).response?.data?.error || (error as Error & { response?: { data?: { error?: string }; status?: number } }).message || 'API request failed',
    };
  }
};

export const apiDelete = async (url: string) => {
  try {
    const response = await api.delete(url);
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: (error as Error & { response?: { data?: { error?: string }; status?: number } }).response?.data?.error || (error as Error & { response?: { data?: { error?: string }; status?: number } }).message || 'API request failed',
    };
  }
};
