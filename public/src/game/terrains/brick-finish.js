/** Spatial clay and weathering variation shared by both brick render paths. */
export function applyBrickFinish(material, hp = 4) {
  const damage = (4 - Math.max(0, Math.min(4, Math.ceil(hp)))) / 4;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      varying vec3 vBrickWorld;
    `).replace('#include <worldpos_vertex>', `
      #include <worldpos_vertex>
      vec4 brickPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        brickPosition = instanceMatrix * brickPosition;
      #endif
      vBrickWorld = (modelMatrix * brickPosition).xyz;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying vec3 vBrickWorld;
      const float brickDamage = ${damage.toFixed(2)};
      float brickHash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float brickNoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(brickHash(i), brickHash(i + vec3(1,0,0)), f.x),
                       mix(brickHash(i + vec3(0,1,0)), brickHash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(brickHash(i + vec3(0,0,1)), brickHash(i + vec3(1,0,1)), f.x),
                       mix(brickHash(i + vec3(0,1,1)), brickHash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
    `).replace('#include <map_fragment>', `
      #include <map_fragment>
      // Warm fired clay, muted aged clay and occasional pale mineral deposits.
      // Keep surviving masonry stable between hits. The atlas identifies broken faces.
      vec3 finishPosition = vBrickWorld;
      float kiln = brickNoise(finishPosition * vec3(1.8, 5.0, 1.8));
      float weather = brickNoise(finishPosition * vec3(0.65, 1.1, 0.65) + 17.0);
      vec3 clayTint = mix(vec3(0.74, 0.68, 0.64), vec3(1.10, 1.03, 0.94), kiln);
      diffuseColor.rgb *= clayTint;
      float salts = smoothstep(0.66, 0.88, weather) * 0.17;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.48, 0.43, 0.34), salts);
      float damp = (1.0 - smoothstep(0.04, 0.65, vBrickWorld.y)) * (0.06 + weather * 0.13);
      diffuseColor.rgb *= 1.0 - damp;
      if (brickDamage > 0.0) {
        // A restrained dust lift preserves clay grain and mortar contrast.
        // Avoid high-frequency world-space noise, which shimmers at gameplay scale.
        float dust = smoothstep(0.35, 0.80, weather) * brickDamage * 0.08;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.92 + vec3(0.07, 0.06, 0.045), dust);
      }
    `);
  };
  material.customProgramCacheKey = () => `brick-finish-v3-${damage}`;
  material.roughness = Math.min(1, material.roughness + damage * 0.12);
  material.needsUpdate = true;
  return material;
}
