// Projectie van lengte/breedte naar het vlak van de 3D-kaart (components/marketing/
// OpenShifts3D.tsx): Nederland rond (0,0), 10 eenheden per breedtegraad, oost-west
// gecorrigeerd voor de breedte zodat de vorm niet uitrekt.

const LAT0 = 52.15;
const LNG0 = 5.25;
const K = 10;
const COS = Math.cos((LAT0 * Math.PI) / 180);

export const toPlane = (lng: number, lat: number): [number, number] => [(lng - LNG0) * COS * K, (lat - LAT0) * K];
