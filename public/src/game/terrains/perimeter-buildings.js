import * as THREE from 'three';

/**
 * Procedural catalog of 12 distinct perimeter buildings:
 * - 5 apartment building variants
 * - 7 civic / commercial / industrial buildings (office, factory, hospital, warehouse, substation, radar hub, fire station)
 */

function makeCanvasTex(w, h, drawFn, configureColorTexture) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  drawFn(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (configureColorTexture) configureColorTexture(tex);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function drawWindowGrid(ctx, w, h, { bg, trim, cols, rows, litChance = 0.35, litColor = '#fde047', darkColor = '#17202b', sillColor = null }) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = trim;
  const rowH = h / rows;
  const colW = w / cols;
  for (let r = 0; r < rows; r++) {
    ctx.fillRect(0, r * rowH, w, 2);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = c * colW + colW * 0.22;
      const wy = r * rowH + rowH * 0.22;
      const ww = colW * 0.56;
      const wh = rowH * 0.54;
      const hash = ((r * 37 + c * 17 + cols * 13) % 100) / 100;
      ctx.fillStyle = hash < litChance ? litColor : darkColor;
      ctx.fillRect(wx, wy, ww, wh);
      if (sillColor) {
        ctx.fillStyle = sillColor;
        ctx.fillRect(wx - 1, wy + wh, ww + 2, 2);
      }
    }
  }
}

export class PerimeterBuildingCatalog {
  constructor(sharedGeometry, configureColorTexture) {
    this.sharedGeometry = sharedGeometry;
    this.configureColorTexture = configureColorTexture;
    this.mats = null;
  }

  ensureMaterials() {
    if (this.mats) return this.mats;
    const cfg = this.configureColorTexture;

    const brickAptTex = makeCanvasTex(128, 128, (ctx, w, h) => {
      drawWindowGrid(ctx, w, h, {
        bg: '#8c4a38',
        trim: '#723a2b',
        cols: 5,
        rows: 5,
        litChance: 0.4,
        sillColor: '#d6d3d1',
      });
    }, cfg);

    const panelAptTex = makeCanvasTex(128, 128, (ctx, w, h) => {
      drawWindowGrid(ctx, w, h, {
        bg: '#64748b',
        trim: '#475569',
        cols: 6,
        rows: 7,
        litChance: 0.3,
        litColor: '#fef08a',
      });
      ctx.fillStyle = '#38bdf844';
      ctx.fillRect(w * 0.44, 0, w * 0.12, h);
    }, cfg);

    const stuccoAptTex = makeCanvasTex(128, 128, (ctx, w, h) => {
      drawWindowGrid(ctx, w, h, {
        bg: '#9a8c7a',
        trim: '#7e7161',
        cols: 4,
        rows: 4,
        litChance: 0.42,
        sillColor: '#57534e',
      });
    }, cfg);

    const modernAptTex = makeCanvasTex(128, 128, (ctx, w, h) => {
      drawWindowGrid(ctx, w, h, {
        bg: '#475569',
        trim: '#334155',
        cols: 5,
        rows: 6,
        litChance: 0.45,
        litColor: '#fed7aa',
      });
    }, cfg);

    const cornerAptTex = makeCanvasTex(128, 128, (ctx, w, h) => {
      drawWindowGrid(ctx, w, h, {
        bg: '#7c5c4b',
        trim: '#5c4234',
        cols: 5,
        rows: 4,
        litChance: 0.38,
        sillColor: '#e7e5e4',
      });
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, h * 0.78, w, h * 0.22);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, h * 0.76, w, 4);
    }, cfg);

    const officeGlassTex = makeCanvasTex(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#132a46';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        for (let x = 0; x < w; x += 16) {
          const bright = ((x * 5 + y * 11) % 7) < 3;
          ctx.fillStyle = bright ? '#38bdf8' : '#1e4672';
          ctx.fillRect(x + 2, y + 2, 12, 12);
        }
      }
      ctx.fillStyle = '#64748b';
      for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 2, h);
      for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 2);
    }, cfg);

    const factoryTex = makeCanvasTex(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#374151';
      for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 4, h);
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(10, 24, w - 20, 18);
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(22, 68, 34, 60);
      ctx.fillRect(72, 68, 34, 60);
    }, cfg);

    const hospitalTex = makeCanvasTex(128, 128, (ctx, w, h) => {
      drawWindowGrid(ctx, w, h, {
        bg: '#e2e8f0',
        trim: '#cbd5e1',
        cols: 6,
        rows: 5,
        litChance: 0.55,
        litColor: '#bae6fd',
        darkColor: '#334155',
      });
    }, cfg);

    const warehouseTex = makeCanvasTex(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#52525b';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3f3f46';
      for (let x = 0; x < w; x += 12) ctx.fillRect(x, 0, 3, h);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(0, h - 18, w, 10);
      ctx.fillStyle = '#18181b';
      for (let x = 0; x < w; x += 20) ctx.fillRect(x, h - 18, 10, 10);
    }, cfg);

    const fireStationTex = makeCanvasTex(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, h * 0.45, w, 6);
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(16, h * 0.55, 36, h * 0.45);
      ctx.fillRect(76, h * 0.55, 36, h * 0.45);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(20, 18, 22, 20);
      ctx.fillRect(84, 18, 22, 20);
    }, cfg);

    this.mats = {
      brickApt: new THREE.MeshStandardMaterial({ map: brickAptTex, roughness: 0.84 }),
      panelApt: new THREE.MeshStandardMaterial({ map: panelAptTex, roughness: 0.82 }),
      stuccoApt: new THREE.MeshStandardMaterial({ map: stuccoAptTex, roughness: 0.86 }),
      modernApt: new THREE.MeshStandardMaterial({ map: modernAptTex, roughness: 0.78 }),
      cornerApt: new THREE.MeshStandardMaterial({ map: cornerAptTex, roughness: 0.82 }),
      officeGlass: new THREE.MeshStandardMaterial({ map: officeGlassTex, roughness: 0.25, metalness: 0.65 }),
      factory: new THREE.MeshStandardMaterial({ map: factoryTex, roughness: 0.72, metalness: 0.35 }),
      hospital: new THREE.MeshStandardMaterial({ map: hospitalTex, roughness: 0.65 }),
      warehouse: new THREE.MeshStandardMaterial({ map: warehouseTex, roughness: 0.7, metalness: 0.45 }),
      fireStation: new THREE.MeshStandardMaterial({ map: fireStationTex, roughness: 0.78 }),
      roofDark: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 }),
      roofTile: new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.85 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.86 }),
      balcony: new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.75 }),
      redCross: new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x991b1b, emissiveIntensity: 0.35 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.7 }),
      cyanGlow: new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.7 }),
      beaconRed: new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.8 }),
    };
    return this.mats;
  }

  build(kind) {
    const m = this.ensureMaterials();
    const g = new THREE.Group();
    const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(this.sharedGeometry('BoxGeometry', w, h, d), mat);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    const cyl = (rt, rb, h, seg, mat, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(this.sharedGeometry('CylinderGeometry', rt, rb, h, seg), mat);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };

    switch (kind) {
      // --- 5 DISTINCT APARTMENT BUILDINGS ---
      case 'apt_brick_midrise': {
        box(3.8, 3.6, 3.4, m.brickApt, 0, 1.8, 0);
        box(4.0, 0.24, 3.6, m.roofTile, 0, 3.72, 0);
        box(0.5, 0.7, 0.5, m.concrete, -1.1, 4.1, -0.8);
        break;
      }
      case 'apt_panel_tower': {
        box(3.4, 5.6, 3.2, m.panelApt, 0, 2.8, 0);
        box(3.55, 0.2, 3.35, m.roofDark, 0, 5.7, 0);
        box(1.4, 0.7, 1.2, m.concrete, 0, 6.1, 0);
        break;
      }
      case 'apt_l_courtyard': {
        box(4.2, 2.8, 2.0, m.stuccoApt, 0, 1.4, -0.9);
        box(2.0, 2.8, 2.4, m.stuccoApt, -1.1, 1.4, 1.0);
        box(4.35, 0.22, 2.15, m.roofTile, 0, 2.9, -0.9);
        box(2.15, 0.22, 2.55, m.roofTile, -1.1, 2.9, 1.0);
        cyl(0.45, 0.45, 0.7, 10, m.steel, 1.2, 3.35, -0.9);
        break;
      }
      case 'apt_stepped_modern': {
        box(4.2, 2.6, 3.6, m.modernApt, 0, 1.3, 0);
        box(3.0, 2.2, 2.8, m.modernApt, -0.4, 3.7, -0.2);
        box(4.3, 0.14, 0.5, m.balcony, 0, 2.65, 1.7);
        box(3.15, 0.18, 2.95, m.roofDark, -0.4, 4.88, -0.2);
        break;
      }
      case 'apt_corner_block': {
        box(4.4, 3.0, 3.4, m.cornerApt, 0, 1.5, 0);
        box(4.6, 0.26, 3.6, m.roofDark, 0, 3.12, 0);
        box(1.1, 0.45, 1.1, m.steel, 0.9, 3.45, 0.5);
        break;
      }

      // --- 7 OTHER DISTINCT BUILDINGS ---
      case 'office_glass': {
        box(3.6, 6.2, 3.6, m.officeGlass, 0, 3.1, 0);
        box(3.8, 0.22, 3.8, m.steel, 0, 6.3, 0);
        cyl(0.08, 0.14, 1.6, 6, m.steel, 0, 7.1, 0);
        cyl(0.11, 0.11, 0.22, 6, m.beaconRed, 0, 7.95, 0);
        break;
      }
      case 'factory_sawtooth': {
        box(5.0, 2.2, 3.6, m.factory, 0, 1.1, 0);
        for (const sx of [-1.4, 0, 1.4]) {
          box(1.1, 0.55, 3.4, m.roofDark, sx, 2.45, 0);
        }
        cyl(0.28, 0.38, 4.4, 10, m.concrete, -1.8, 2.2, -1.3);
        cyl(0.29, 0.29, 0.3, 10, m.beaconRed, -1.8, 4.4, -1.3);
        cyl(0.28, 0.38, 3.8, 10, m.concrete, -0.9, 1.9, -1.3);
        break;
      }
      case 'hospital': {
        box(4.8, 3.2, 2.4, m.hospital, 0, 1.6, -0.4);
        box(2.2, 2.2, 2.2, m.hospital, 1.3, 1.1, 1.4);
        box(5.0, 0.2, 2.6, m.roofDark, 0, 3.3, -0.4);
        // Red cross on main roof
        box(1.4, 0.08, 0.42, m.redCross, -0.6, 3.44, -0.4);
        box(0.42, 0.08, 1.4, m.redCross, -0.6, 3.44, -0.4);
        // Red cross on front wing
        box(0.9, 0.08, 0.28, m.redCross, 1.3, 2.24, 1.4);
        box(0.28, 0.08, 0.9, m.redCross, 1.3, 2.24, 1.4);
        break;
      }
      case 'warehouse_depot': {
        box(4.8, 2.1, 3.2, m.warehouse, 0, 1.05, 0);
        box(5.0, 0.25, 3.4, m.steel, 0, 2.22, 0);
        box(1.0, 0.7, 0.9, m.balcony, 2.8, 0.35, 0.7);
        break;
      }
      case 'power_substation': {
        box(4.4, 0.35, 3.4, m.concrete, 0, 0.17, 0);
        box(1.8, 1.7, 1.8, m.steel, -0.9, 1.05, 0);
        cyl(0.22, 0.22, 1.6, 8, m.cyanGlow, 1.1, 1.0, -0.6);
        cyl(0.22, 0.22, 1.6, 8, m.cyanGlow, 1.1, 1.0, 0.6);
        break;
      }
      case 'radar_comm_hub': {
        box(3.4, 1.6, 3.4, m.concrete, 0, 0.8, 0);
        cyl(0.45, 0.7, 2.6, 8, m.steel, 0, 2.9, 0);
        const dish = cyl(0.95, 0.2, 0.45, 12, m.concrete, 0, 4.4, 0);
        dish.rotation.x = 0.55;
        break;
      }
      case 'fire_station':
      default: {
        box(4.2, 2.4, 3.2, m.fireStation, 0, 1.2, 0);
        box(4.4, 0.2, 3.4, m.roofDark, 0, 2.5, 0);
        // Hose-drying tower
        box(1.1, 4.2, 1.1, m.fireStation, -1.4, 2.1, -0.9);
        cyl(0.22, 0.22, 0.3, 8, m.beaconRed, -1.4, 4.35, -0.9);
        break;
      }
    }
    return g;
  }
}

const APARTMENT_BUILDING_KINDS = Object.freeze([
  'apt_brick_midrise',
  'apt_panel_tower',
  'apt_l_courtyard',
  'apt_stepped_modern',
  'apt_corner_block',
]);

export const CIVIC_INDUSTRIAL_BUILDING_KINDS = Object.freeze([
  'office_glass',
  'factory_sawtooth',
  'hospital',
  'warehouse_depot',
  'power_substation',
  'radar_comm_hub',
  'fire_station',
]);

export const ALL_URBAN_BUILDING_KINDS = Object.freeze([
  ...APARTMENT_BUILDING_KINDS,
  ...CIVIC_INDUSTRIAL_BUILDING_KINDS,
]);
