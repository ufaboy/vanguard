/**
 * World-space procedural surface grain, weathering, and micro-roughness shader
 * finish applied to the arena ground mesh so ground decorations match the
 * crispness of 3D landmarks at any camera zoom.
 */

/**
 * Injects world-space micro-grain, tonal weathering, and roughness variation
 * into a Three.js `MeshStandardMaterial` used for the arena ground plane.
 */
export function applyGroundSurfaceFinish(material) {
  if (!material || material.userData?.groundFinishApplied) return material;
  material.userData ||= {};
  material.userData.groundFinishApplied = true;
  const uniforms = {
    uDetailStrength: { value: 1.0 },
  };
  material.userData.groundFinishUniforms = uniforms;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetailStrength = uniforms.uDetailStrength;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `
      #include <common>
      varying vec3 vGroundWorld;
    `
      )
      .replace(
        '#include <worldpos_vertex>',
        `
      #include <worldpos_vertex>
      vGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
    `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `
      #include <common>
      uniform float uDetailStrength;
      varying vec3 vGroundWorld;
      float gsHash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float gsNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(gsHash(i), gsHash(i + vec2(1.0, 0.0)), f.x),
          mix(gsHash(i + vec2(0.0, 1.0)), gsHash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }
    `
      )
      .replace(
        '#include <map_fragment>',
        `
      #include <map_fragment>
      float gsFine = gsNoise(vGroundWorld.xz * 7.5) * 0.55 + gsNoise(vGroundWorld.xz * 19.0) * 0.45;
      float gsBroad = gsNoise(vGroundWorld.xz * 0.85) * 0.6 + gsNoise(vGroundWorld.xz * 2.4 + 7.3) * 0.4;
      float gsMicro = gsHash(floor(vGroundWorld.xz * 28.0));
      float gsTone = (gsFine - 0.5) * 0.11 + (gsBroad - 0.5) * 0.08 + (gsMicro - 0.5) * 0.04;
      diffuseColor.rgb *= (1.0 + gsTone * uDetailStrength);
    `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `
      #include <roughnessmap_fragment>
      float gsWet = smoothstep(0.62, 0.88, gsBroad) * 0.16 * uDetailStrength;
      float gsGrit = (gsFine - 0.5) * 0.12 * uDetailStrength;
      roughnessFactor = clamp(roughnessFactor - gsWet + gsGrit, 0.35, 1.0);
    `
      );
  };

  material.customProgramCacheKey = () => 'ground-surface-finish-v1';
  material.needsUpdate = true;
  return material;
}

/**
 * Updates shader detail intensity for the current renderer quality mode.
 */
export function updateGroundSurfaceFinish(material, { lowQuality = false } = {}) {
  const uniforms = material?.userData?.groundFinishUniforms;
  if (!uniforms) return;
  uniforms.uDetailStrength.value = lowQuality ? 0.35 : 1.0;
}
