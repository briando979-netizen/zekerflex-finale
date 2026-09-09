// Optional richer load profile — needs the k6 binary (https://k6.io), not npm.
//
//   k6 run perf/k6-load.js
//   k6 run -e BASE_URL=https://staging.zekerflex.nl perf/k6-load.js
//
// Ramps to 50 VUs, holds, ramps down. Thresholds mirror docs/PERFORMANCE.md;
// k6 exits non-zero if one is breached. For the quick Node-only check use
// `npm run loadtest` instead.

import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

export const options = {
  scenarios: {
    public_traffic: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },
        { duration: "1m", target: 50 },
        { duration: "2m", target: 50 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800", "p(99)<1500"],
  },
};

const PATHS = ["/", "/voor-bedrijven", "/voor-freelancers", "/status", "/api/status"];

export default function () {
  for (const path of PATHS) {
    const res = http.get(`${BASE_URL}${path}`);
    check(res, {
      "status is 2xx": (r) => r.status >= 200 && r.status < 300,
    });
    sleep(0.5 + Math.random());
  }
}
