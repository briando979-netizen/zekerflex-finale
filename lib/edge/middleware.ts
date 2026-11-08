import { NextRequest, NextResponse } from 'next/server';

export const edgeMiddleware = async (req: NextRequest) => {
  const url = req.nextUrl.clone();

  const geoHeaders = {
    country: req.geo?.country || 'US',
    region: req.geo?.region,
    city: req.geo?.city,
  };

  const response = NextResponse.next();
  response.headers.set('X-Geo-Country', geoHeaders.country);
  response.headers.set('X-Geo-Region', geoHeaders.region || '');
  response.headers.set('X-Geo-City', geoHeaders.city || '');

  return response;
};

export const edgeCaching = {
  rules: [
    { pattern: /^\/api\/public\//, ttl: 3600 },
    { pattern: /^\/api\/marketplace\//, ttl: 300 },
    { pattern: /\.(jpg|png|gif|css|js)$/, ttl: 31536000 },
  ],
};

export const originShielding = {
  enabled: true,
  shield: 'IAD',
};

export const edgeFiltering = {
  blockPatterns: [/\.(env|config|json)$/, /wp-admin/, /phpmyadmin/],
};

export const geoRouting = {
  regions: {
    'EU': { origin: 'https://eu.zekerflex.com', cache: true },
    'US': { origin: 'https://us.zekerflex.com', cache: true },
    'APAC': { origin: 'https://apac.zekerflex.com', cache: true },
  },
};

export const responseOptimization = {
  compress: ['gzip', 'brotli'],
  minify: true,
  removeUnused: true,
};
