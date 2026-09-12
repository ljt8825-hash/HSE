import { requestClient } from '#/api/request';

export async function getDemoDataStatus() {
  return requestClient.get('/demo-data/status');
}

export async function generateDemoData(count = 50) {
  return requestClient.post('/demo-data/generate', { count });
}

export async function clearDemoData() {
  return requestClient.post('/demo-data/clear');
}
