"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerrainInputError = void 0;
exports.createTerrainArea = createTerrainArea;
const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;
class TerrainInputError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'TerrainInputError';
    }
}
exports.TerrainInputError = TerrainInputError;
function isCoordinate(value) {
    if (!value || typeof value !== 'object')
        return false;
    const point = value;
    return typeof point.lat === 'number' && Number.isFinite(point.lat) && Math.abs(point.lat) <= 85
        && typeof point.lng === 'number' && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;
}
/** Server-side duplicate of the client request-area rules; input is always revalidated at the API boundary. */
function createTerrainArea(points) {
    if (!Array.isArray(points) || points.length < 3 || points.length > 100 || !points.every(isCoordinate)) {
        throw new TerrainInputError('invalid', 'Add at least three valid plot points before loading terrain.');
    }
    const site = points;
    const longitudes = site.map(point => point.lng);
    if (Math.max(...longitudes) - Math.min(...longitudes) > 180) {
        throw new TerrainInputError('antimeridian', 'Terrain loading does not support plots crossing the 180° meridian.');
    }
    const latitude = site.reduce((sum, point) => sum + point.lat, 0) / site.length;
    const longitude = site.reduce((sum, point) => sum + point.lng, 0) / site.length;
    const longitudeScale = Math.cos(latitude * DEG);
    if (longitudeScale < 0.08)
        throw new TerrainInputError('invalid', 'Terrain loading is unavailable this close to the poles.');
    const local = site.map(point => ({
        x: EARTH_RADIUS_M * (point.lng - longitude) * DEG * longitudeScale,
        y: EARTH_RADIUS_M * (point.lat - latitude) * DEG,
    }));
    for (let left = 0; left < local.length; left += 1) {
        for (let right = left + 1; right < local.length; right += 1) {
            if (Math.hypot(local[left].x - local[right].x, local[left].y - local[right].y) < 0.5) {
                throw new TerrainInputError('invalid', 'The plot boundary has duplicate or collapsed corners.');
            }
        }
    }
    let signedArea = 0;
    for (let index = 0; index < local.length; index += 1) {
        const next = local[(index + 1) % local.length];
        signedArea += local[index].x * next.y - next.x * local[index].y;
    }
    if (Math.abs(signedArea) / 2 < 0.25)
        throw new TerrainInputError('invalid', 'The plot boundary has no measurable area.');
    const westM = Math.min(...local.map(point => point.x));
    const eastM = Math.max(...local.map(point => point.x));
    const southM = Math.min(...local.map(point => point.y));
    const northM = Math.max(...local.map(point => point.y));
    const widthM = eastM - westM;
    const heightM = northM - southM;
    if (widthM < 0.5 || heightM < 0.5)
        throw new TerrainInputError('invalid', 'The plot boundary is too small or collapsed to load terrain.');
    const longestSideM = Math.max(widthM, heightM);
    if (longestSideM > 10_000)
        throw new TerrainInputError('too_large', 'This terrain view is too large. Use a plot no more than 10 km across.');
    const marginM = Math.max(60, longestSideM * 0.25);
    const west = longitude + (westM - marginM) / (EARTH_RADIUS_M * DEG * longitudeScale);
    const east = longitude + (eastM + marginM) / (EARTH_RADIUS_M * DEG * longitudeScale);
    const south = latitude + (southM - marginM) / (EARTH_RADIUS_M * DEG);
    const north = latitude + (northM + marginM) / (EARTH_RADIUS_M * DEG);
    if (south < -85 || north > 85 || west < -180 || east > 180 || east <= west || north <= south) {
        throw new TerrainInputError('invalid', 'The padded terrain area is outside supported WGS84 bounds.');
    }
    const areaWidthM = (east - west) * DEG * EARTH_RADIUS_M * longitudeScale;
    const areaHeightM = (north - south) * DEG * EARTH_RADIUS_M;
    const columns = Math.min(128, Math.max(2, Math.ceil(areaWidthM / 30) + 1));
    const rows = Math.min(128, Math.max(2, Math.ceil(areaHeightM / 30) + 1));
    return { bounds: { west, south, east, north }, rows, columns, longestSideM };
}
