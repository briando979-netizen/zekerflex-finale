import { z } from 'zod';

interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

interface Geofence {
  id: string;
  latitude: number;
  longitude: number;
  radius: number;
  name: string;
}

interface MapConfig {
  provider: 'mapbox' | 'google' | 'osm';
  zoom: number;
  style: string;
}

const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number(),
  altitude: z.number().nullable(),
  heading: z.number().nullable(),
  speed: z.number().nullable(),
  timestamp: z.number(),
});

export type LocationData = z.infer<typeof locationSchema>;

export async function getCurrentLocation(): Promise<Location | null> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy, altitude, heading, speed } = position.coords;
        resolve({
          latitude,
          longitude,
          accuracy,
          altitude,
          heading,
          speed,
          timestamp: position.timestamp,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

export async function watchLocation(callback: (location: Location) => void): Promise<number> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    return -1;
  }

  return navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude, accuracy, altitude, heading, speed } = position.coords;
      callback({
        latitude,
        longitude,
        accuracy,
        altitude,
        heading,
        speed,
        timestamp: position.timestamp,
      });
    },
    () => {},
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );
}

export async function checkGeofence(location: Location, geofence: Geofence): Promise<boolean> {
  const R = 6371000;
  const φ1 = (location.latitude * Math.PI) / 180;
  const φ2 = (geofence.latitude * Math.PI) / 180;
  const Δφ = ((geofence.latitude - location.latitude) * Math.PI) / 180;
  const Δλ = ((geofence.longitude - location.longitude) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance <= geofence.radius;
}

export async function calculateDistance(from: Location, to: Location): Promise<number> {
  const R = 6371000;
  const φ1 = (from.latitude * Math.PI) / 180;
  const φ2 = (to.latitude * Math.PI) / 180;
  const Δφ = ((to.latitude - from.latitude) * Math.PI) / 180;
  const Δλ = ((to.longitude - from.longitude) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round((R * c) / 1000 * 100) / 100;
}

export async function getMapConfig(): Promise<MapConfig> {
  return {
    provider: 'osm',
    zoom: 12,
    style: 'mapbox://styles/mapbox/streets-v12',
  };
}

export async function trackShiftLocation(shiftId: string, location: Location): Promise<void> {
  await fetch('/api/shifts/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shiftId, location }),
  }).catch(() => {});
}
