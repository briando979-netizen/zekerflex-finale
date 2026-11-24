// Postcode to coordinates mapping for Netherlands
// Using common reference points; can be extended with PDOK API for exact coordinates

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// Key postcodes mapped to approximate city center coordinates
// Source: PDOK / Google Maps
const POSTCODE_DATABASE: Record<string, Coordinates> = {
  // Amsterdam
  "1012": { latitude: 52.3676, longitude: 4.9041 },
  "1013": { latitude: 52.3676, longitude: 4.9041 },
  "1014": { latitude: 52.3676, longitude: 4.9041 },
  "1015": { latitude: 52.3676, longitude: 4.9041 },
  "1016": { latitude: 52.3676, longitude: 4.9041 },
  "1017": { latitude: 52.3676, longitude: 4.9041 },
  "1018": { latitude: 52.3676, longitude: 4.9041 },

  // The Hague
  "2511": { latitude: 52.0796, longitude: 4.2648 },
  "2512": { latitude: 52.0796, longitude: 4.2648 },
  "2595": { latitude: 52.0796, longitude: 4.2648 },

  // Rotterdam
  "3011": { latitude: 51.9225, longitude: 4.4792 },
  "3012": { latitude: 51.9225, longitude: 4.4792 },
  "3013": { latitude: 51.9225, longitude: 4.4792 },

  // Delft
  "2611": { latitude: 52.1326, longitude: 4.3571 },
  "2612": { latitude: 52.1326, longitude: 4.3571 },

  // Leiden
  "2314": { latitude: 52.1631, longitude: 4.4983 },
  "2315": { latitude: 52.1631, longitude: 4.4983 },

  // Utrecht
  "3511": { latitude: 52.0902, longitude: 5.1211 },
  "3512": { latitude: 52.0902, longitude: 5.1211 },
  "3513": { latitude: 52.0902, longitude: 5.1211 },

  // Arnhem
  "6811": { latitude: 51.9851, longitude: 5.8987 },
  "6812": { latitude: 51.9851, longitude: 5.8987 },

  // Nijmegen
  "6511": { latitude: 51.8425, longitude: 5.8520 },
  "6512": { latitude: 51.8425, longitude: 5.8520 },

  // Groningen
  "9711": { latitude: 53.2194, longitude: 6.5665 },
  "9712": { latitude: 53.2194, longitude: 6.5665 },

  // Breda
  "4811": { latitude: 51.5897, longitude: 4.7789 },
  "4812": { latitude: 51.5897, longitude: 4.7789 },

  // Eindhoven
  "5611": { latitude: 51.4416, longitude: 5.4697 },
  "5612": { latitude: 51.4416, longitude: 5.4697 },
};

export function getCoordinatesByPostcode(postcode: string): Coordinates | null {
  if (!postcode) return null;

  // Extract first 4 digits (postcode prefix)
  const prefix = postcode.substring(0, 4).toUpperCase();
  return POSTCODE_DATABASE[prefix] ?? null;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Filter freelancers by radius around a postcode
 */
export function filterByRadius(
  freelancers: Array<{ id: string; latitude?: number; longitude?: number }>,
  centerPostcode: string,
  radiusKm: number
): string[] {
  const centerCoords = getCoordinatesByPostcode(centerPostcode);
  if (!centerCoords) return [];

  return freelancers
    .filter((f) => f.latitude !== undefined && f.longitude !== undefined)
    .filter((f) => {
      const distance = calculateDistance(
        centerCoords.latitude,
        centerCoords.longitude,
        f.latitude!,
        f.longitude!
      );
      return distance <= radiusKm;
    })
    .map((f) => f.id);
}
