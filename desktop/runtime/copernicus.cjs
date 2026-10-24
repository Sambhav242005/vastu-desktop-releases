"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerrainSourceError = void 0;
exports.loadCopernicusTerrain = loadCopernicusTerrain;
const fromUrl = (...args) => Promise.resolve().then(() => __importStar(require('geotiff'))).then(module => module.fromUrl(...args));
const area_cjs_1 = require("./area.cjs");
const DEG = Math.PI / 180;
const EARTH_RADIUS_M = 6_371_000;
const TILE_HOST = 'https://copernicus-dem-30m.s3.amazonaws.com';
const SOURCE_URL = 'https://registry.opendata.aws/copernicus-dem/';
const ATTRIBUTION = '© DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved';
const MAX_TILES = 16;
class TerrainSourceError extends Error {
    code;
    constructor(message, code = 'source_unavailable') {
        super(message);
        this.code = code;
        this.name = 'TerrainSourceError';
    }
}
exports.TerrainSourceError = TerrainSourceError;
function tileCoordinate(value, direction, digits) {
    const hemisphere = value >= 0 ? (direction === 'N' ? 'N' : 'E') : (direction === 'N' ? 'S' : 'W');
    return `${hemisphere}${Math.abs(value).toString().padStart(digits, '0')}_00`;
}
function tileFor(south, west) {
    const north = tileCoordinate(south, 'N', 2);
    const east = tileCoordinate(west, 'E', 3);
    const base = `Copernicus_DSM_COG_10_${north}_${east}_DEM`;
    return { south, west, url: `${TILE_HOST}/${base}/${base}.tif` };
}
function tileList(bounds) {
    const tiles = [];
    const south = Math.floor(bounds.south);
    const north = Math.floor(bounds.north);
    const west = Math.floor(bounds.west);
    const east = Math.floor(bounds.east);
    if ((north - south + 1) * (east - west + 1) > MAX_TILES) {
        throw new TerrainSourceError('The terrain area covers too many data tiles. Reduce the plot size and retry.', 'too_large');
    }
    for (let lat = south; lat <= north; lat += 1) {
        for (let lon = west; lon <= east; lon += 1)
            tiles.push(tileFor(lat, lon));
    }
    return tiles;
}
function isMissingValue(value) {
    return !Number.isFinite(value) || value === -32767;
}
function sampleBand(band, width, height, left, top, x, y, method) {
    const px = Math.max(0, Math.min(width - 1, x - left));
    const py = Math.max(0, Math.min(height - 1, y - top));
    if (method === 'nearest') {
        const value = band[Math.round(py) * width + Math.round(px)];
        return value === undefined || isMissingValue(value) ? null : value;
    }
    const x0 = Math.floor(px), y0 = Math.floor(py);
    const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
    const v00 = band[y0 * width + x0], v10 = band[y0 * width + x1];
    const v01 = band[y1 * width + x0], v11 = band[y1 * width + x1];
    if ([v00, v10, v01, v11].some(value => value === undefined || isMissingValue(value)))
        return null;
    const fx = px - x0, fy = py - y0;
    return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
}
async function sampleTile(tile, positions, elevations, method, signal) {
    let response;
    try {
        response = await fetch(tile.url, { method: 'HEAD', cache: 'no-store', signal });
    }
    catch {
        if (signal.aborted)
            throw signal.reason ?? new Error('aborted');
        throw new TerrainSourceError('The Copernicus elevation source could not be reached. Check your connection and retry.');
    }
    if (response.status === 404)
        return null;
    if (!response.ok)
        throw new TerrainSourceError('The Copernicus elevation source is temporarily unavailable. Retry in a moment.');
    let image;
    try {
        const tiff = await fromUrl(tile.url, undefined, signal);
        image = await tiff.getImage();
    }
    catch {
        if (signal.aborted)
            throw signal.reason ?? new Error('aborted');
        throw new TerrainSourceError('The Copernicus terrain tile could not be read. Retry the terrain request.');
    }
    const width = image.getWidth(), height = image.getHeight();
    const origin = image.getOrigin(), resolution = image.getResolution();
    const geoKeys = image.getGeoKeys();
    const epsg = geoKeys?.GeographicTypeGeoKey;
    if (epsg !== 4326 || width < 2 || height < 2 || origin.length < 2 || resolution.length < 2 || resolution[0] === 0 || resolution[1] === 0) {
        throw new TerrainSourceError('The source tile has unsupported coordinate metadata.');
    }
    const pixels = positions.map(position => ({
        ...position,
        x: (position.longitude - origin[0]) / resolution[0],
        y: (position.latitude - origin[1]) / resolution[1],
    }));
    const left = Math.max(0, Math.floor(Math.min(...pixels.map(pixel => pixel.x))) - 1);
    const top = Math.max(0, Math.floor(Math.min(...pixels.map(pixel => pixel.y))) - 1);
    const right = Math.min(width, Math.ceil(Math.max(...pixels.map(pixel => pixel.x))) + 2);
    const bottom = Math.min(height, Math.ceil(Math.max(...pixels.map(pixel => pixel.y))) + 2);
    if (right <= left || bottom <= top)
        return null;
    if ((right - left) * (bottom - top) > 1_100_000) {
        throw new TerrainSourceError('The requested terrain raster window is too large to process safely. Reduce the plot size and retry.', 'too_large');
    }
    let bands;
    try {
        bands = await image.readRasters({ window: [left, top, right, bottom], samples: [0], signal });
    }
    catch {
        if (signal.aborted)
            throw signal.reason ?? new Error('aborted');
        throw new TerrainSourceError('Terrain samples could not be read from the Copernicus tile.');
    }
    const band = Array.isArray(bands) ? bands[0] : bands;
    if (!band || band.length !== (right - left) * (bottom - top)) {
        throw new TerrainSourceError('The Copernicus tile returned an incomplete raster window.');
    }
    for (const pixel of pixels) {
        elevations[pixel.index] = sampleBand(band, right - left, bottom - top, left, top, pixel.x, pixel.y, method);
    }
    const latitude = positions.reduce((sum, item) => sum + item.latitude, 0) / positions.length;
    return Math.max(Math.abs(resolution[1]) * DEG * EARTH_RADIUS_M, Math.abs(resolution[0]) * DEG * EARTH_RADIUS_M * Math.cos(latitude * DEG));
}
async function loadCopernicusTerrain(points, method, signal) {
    const area = (0, area_cjs_1.createTerrainArea)(points);
    const tiles = tileList(area.bounds);
    const positions = [];
    for (let row = 0; row < area.rows; row += 1) {
        const latitude = area.bounds.north - (area.bounds.north - area.bounds.south) * row / (area.rows - 1);
        for (let column = 0; column < area.columns; column += 1) {
            const longitude = area.bounds.west + (area.bounds.east - area.bounds.west) * column / (area.columns - 1);
            positions.push({ index: row * area.columns + column, longitude, latitude });
        }
    }
    const elevations = Array(positions.length).fill(null);
    const groups = new Map();
    for (const tile of tiles)
        groups.set(tile, []);
    for (const position of positions) {
        const tile = tiles.find(candidate => candidate.south === Math.floor(position.latitude) && candidate.west === Math.floor(position.longitude));
        if (tile)
            groups.get(tile).push(position);
    }
    const spacing = [];
    for (const [tile, group] of groups) {
        if (!group.length)
            continue;
        const tileSpacing = await sampleTile(tile, group, elevations, method, signal);
        if (tileSpacing !== null)
            spacing.push(tileSpacing);
    }
    const validCount = elevations.reduce((count, value) => count + (value === null ? 0 : 1), 0);
    if (validCount === 0)
        throw new TerrainSourceError('No Copernicus elevation samples are available for this area. Check the plot location and retry.', 'no_data');
    return {
        bounds: area.bounds,
        rows: area.rows,
        columns: area.columns,
        elevations,
        source: {
            id: 'copernicus-glo30',
            name: 'Copernicus DEM GLO-30 Public',
            spacingM: Math.max(...spacing),
            sampleMethod: method,
            verticalReference: 'EGM2008 orthometric height (EPSG:3855)',
            attribution: ATTRIBUTION,
            url: SOURCE_URL,
        },
        fetchedAt: new Date().toISOString(),
    };
}
