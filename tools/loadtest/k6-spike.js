// ZekerFlex spike test for k6 (https://k6.io) — serious load with ramp/spike.
//
//   BASE_URL=https://staging.zekerflex.com k6 run tools/loadtest/k6-spike.js
//
// Models the "friday 17:00" spike: a steady base, then a sudden surge, then
// recovery. Only public, read-only endpoints. Thresholds fail the run if p95
// latency or the error rate get too high.

import http from "k6/http";
import { check, sleep } from "k6";

const BASE = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

const ENDPOINTS = ["/", "/klussen", "/api/status", "/api/ready", "/kennis/faq", "/kennis"];

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 }, // normale drukte
        { duration: "20s", target: 100 },
        { duration: "15s", target: 1500 }, // plotselinge piek (vrijdag 17:00)
        { duration: "1m", target: 1500 },
        { duration: "30s", target: 100 }, // herstel
        { duration: "20s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"], // < 2% fouten
    http_req_duration: ["p(95)<3000"], // p95 < 3s
  },
};

export default function () {
  const path = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)];
  const res = http.get(`${BASE}${path}`, { headers: { "user-agent": "zekerflex-loadtest-k6" } });
  check(res, { "status < 500": (r) => r.status < 500 });
  sleep(Math.random() * 0.5);
}
