/**
 * Weighted Blended OIT for Gaussian splats (WebGL2).
 * Two MRT targets: accum (additive) + reveal (multiplicative), then composite.
 * Use ?oit=1 to enable.
 */

import * as THREE from "three";

// OIT fragment shader: same as newSplatFragment but outputs to accum + reveal
// Requires #include <splatDefines> from Spark
export const OIT_SPLAT_FRAGMENT = `
precision highp float;
precision highp int;

#include <splatDefines>

uniform float near;
uniform float far;
uniform bool encodeLinear;
uniform float time;
uniform bool debugFlag;
uniform float maxStdDev;
uniform float minAlpha;
uniform bool disableFalloff;
uniform float falloff;

layout(location = 0) out vec4 accum;
layout(location = 1) out float reveal;

in vec4 vRgba;
in vec2 vSplatUv;
in vec3 vNdc;
flat in uint vSplatIndex;
flat in float adjustedStdDev;

void main() {
    vec4 rgba = vRgba;

    float z2 = dot(vSplatUv, vSplatUv);
    if (z2 > (adjustedStdDev * adjustedStdDev)) {
        discard;
    }

    float a = rgba.a;
    float shifted = sqrt(z2) - max(0.0, a - 1.0);
    float exponent = -0.5 * max(1.0, a) * sqr(max(0.0, shifted));
    rgba.a = min(1.0, a) * exp(exponent);

    if (rgba.a < minAlpha) {
        discard;
    }
    if (encodeLinear) {
        rgba.rgb = srgbToLinear(rgba.rgb);
    }

    #ifdef PREMULTIPLIED_ALPHA
        vec4 premul = vec4(rgba.rgb * rgba.a, rgba.a);
    #else
        vec4 premul = rgba;
    #endif

    float weight = clamp(pow(min(1.0, premul.a) * 10.0 + 0.01, 3.0) * 1e8 * pow(1.0 - gl_FragCoord.z * 0.95, 3.0), 1e-2, 3e2);
    accum = vec4(premul.rgb * premul.a * weight, premul.a * weight);
    reveal = premul.a * weight;
}
`;

// Composite pass: final_color = accum / (1 - reveal)
// GLSL3-compatible (Three.js)
export const OIT_COMPOSITE_VERTEX = `
out vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const OIT_COMPOSITE_FRAGMENT = `
precision highp float;
uniform sampler2D accumTex;
uniform sampler2D revealTex;
in vec2 vUv;
out vec4 fragColor;

void main() {
    vec4 accum = texture(accumTex, vUv);
    float reveal = texture(revealTex, vUv).r;
    // Weighted blended OIT: final = accum.rgb / accum.a, alpha = 1 - reveal
    if (reveal >= 1.0 - 1e-5) {
        fragColor = vec4(accum.rgb / max(accum.a, 1e-5), 1.0);
    } else {
        float a = 1.0 - reveal;
        fragColor = vec4(accum.rgb / max(accum.a, 1e-5), a);
    }
}
`;

export function createOitPipeline(renderer, width, height) {
  // HalfFloatType is widely supported; FloatType often needs EXT_color_buffer_float and can cause black screen
  const oitRT = new THREE.WebGLRenderTarget(width, height, {
    count: 2,
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  });
  oitRT.textures[0].minFilter = THREE.LinearFilter;
  oitRT.textures[0].magFilter = THREE.LinearFilter;
  oitRT.textures[1].minFilter = THREE.LinearFilter;
  oitRT.textures[1].magFilter = THREE.LinearFilter;

  const compositeScene = new THREE.Scene();
  const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const compositeMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: OIT_COMPOSITE_VERTEX,
    fragmentShader: OIT_COMPOSITE_FRAGMENT,
    uniforms: {
      accumTex: { value: oitRT.textures[0] },
      revealTex: { value: oitRT.textures[1] },
    },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMaterial);
  compositeScene.add(quad);

  /** Clear OIT RT: accum to (0,0,0,0), reveal to (1,0,0,0) for multiplicative identity, and depth */
  function clearOitTarget(gl) {
    if (gl.clearBufferfv) {
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
      gl.clearBufferfv(gl.COLOR, 1, [1, 0, 0, 0]);
    }
    gl.clear(gl.DEPTH_BUFFER_BIT);
  }

  return {
    oitRT,
    compositeScene,
    compositeCamera,
    compositeMaterial,
    clearOitTarget,
    setSize(w, h) {
      oitRT.setSize(w, h);
    },
    dispose() {
      oitRT.dispose();
      compositeMaterial.dispose();
    },
  };
}
