import axios from 'axios';

const api = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiGet = async (url: string, params?: any) => {
  try {
    const response = await api.get(url, { params });
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'API request failed',
    };
  }
};

export const apiPost = async (url: string, data: any) => {
  try {
    const response = await api.post(url, data);
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'API request failed',
    };
  }
};

export const apiPut = async (url: string, data: any) => {
  try {
    const response = await api.put(url, data);
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'API request failed',
    };
  }
};

export const apiDelete = async (url: string) => {
  try {
    const response = await api.delete(url);
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'API request failed',
    };
  }
};
