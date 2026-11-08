import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.1'],
  },
};

export default function () {
  const baseUrl = __ENV.BASE_URL || 'https://zekerflex.com';

  const dashboardRes = http.get(`${baseUrl}/dashboard`);
  check(dashboardRes, {
    'dashboard status 200': (r) => r.status === 200,
    'dashboard < 2s': (r) => r.timings.duration < 2000,
  });

  sleep(1);

  const shiftsRes = http.get(`${baseUrl}/api/shifts?page=1&limit=50`);
  check(shiftsRes, {
    'shifts status 200': (r) => r.status === 200,
    'shifts < 1s': (r) => r.timings.duration < 1000,
  });

  sleep(1);

  const profileRes = http.get(`${baseUrl}/dashboard/profile`);
  check(profileRes, {
    'profile status 200': (r) => r.status === 200,
    'profile < 1.5s': (r) => r.timings.duration < 1500,
  });

  sleep(2);
}
