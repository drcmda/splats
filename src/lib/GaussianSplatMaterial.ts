import { shaderMaterial } from "@react-three/drei";
import { extend } from "@react-three/fiber";
import {
  CustomBlending,
  DataTexture,
  OneFactor,
  UniformsLib,
  UniformsUtils,
  Vector2,
} from "three";

export const GaussianSplatMaterial = shaderMaterial(
  {
    alphaTest: 0,
    viewport: /* @__PURE__ */ new Vector2(1920, 1080), // Dummy. will be overwritten
    focal: 1000.0,
    centerAndScaleTexture: /* @__PURE__ */ new DataTexture(),
    covAndColorTexture: /* @__PURE__ */ new DataTexture(),

    time: 0.0,
    ...UniformsUtils.clone(UniformsLib.fog),
  },
  /*glsl*/ `
    precision highp sampler2D;
    precision highp usampler2D;

    varying vec4 vColor;
    varying vec3 vPosition;

    uniform vec2 viewport;
    uniform float focal;

    attribute uint splatIndex;
    uniform sampler2D centerAndScaleTexture;
    uniform usampler2D covAndColorTexture;

    #include <fog_pars_vertex>

    vec2 unpackInt16(in uint value) {
      int v = int(value);
      int v0 = v >> 16;
      int v1 = (v & 0xFFFF);
      if((v & 0x8000) != 0)
        v1 |= 0xFFFF0000;
      return vec2(float(v1), float(v0));
    }

    void main () {
      ivec2 texSize = textureSize(centerAndScaleTexture, 0);
      ivec2 texPos = ivec2(splatIndex%uint(texSize.x), splatIndex/uint(texSize.x));
      vec4 centerAndScaleData = texelFetch(centerAndScaleTexture, texPos, 0);

      vec4 center = vec4(centerAndScaleData.xyz, 1);
      vec4 camspace = modelViewMatrix * center;
      vec4 pos2d = projectionMatrix * camspace;
      float scale = centerAndScaleData.w;

      float bounds = 1.2 * pos2d.w;
      if (pos2d.z < -pos2d.w || pos2d.x < -bounds || pos2d.x > bounds
        || pos2d.y < -bounds || pos2d.y > bounds) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
      }

      uvec4 covAndColorData = texelFetch(covAndColorTexture, texPos, 0);
      vec2 cov3D_M11_M12 = unpackInt16(covAndColorData.x) * scale;
      vec2 cov3D_M13_M22 = unpackInt16(covAndColorData.y) * scale;
      vec2 cov3D_M23_M33 = unpackInt16(covAndColorData.z) * scale;
      mat3 Vrk = mat3(
        cov3D_M11_M12.x, cov3D_M11_M12.y, cov3D_M13_M22.x,
        cov3D_M11_M12.y, cov3D_M13_M22.y, cov3D_M23_M33.x,
        cov3D_M13_M22.x, cov3D_M23_M33.x, cov3D_M23_M33.y
      );

      mat3 J = mat3(
        focal / camspace.z, 0., -(focal * camspace.x) / (camspace.z * camspace.z),
        0., focal / camspace.z, -(focal * camspace.y) / (camspace.z * camspace.z),
        0., 0., 0.
      );

      mat3 W = transpose(mat3(modelViewMatrix));
      mat3 T = W * J;
      mat3 cov = transpose(T) * Vrk * T;

      vec2 screenCenter = vec2(pos2d) / pos2d.w;

      float diagonal1 = cov[0][0] + 0.3;
      float offDiagonal = cov[0][1];
      float diagonal2 = cov[1][1] + 0.3;

      float mid = 0.5 * (diagonal1 + diagonal2);
      float radius = length(vec2((diagonal1 - diagonal2) / 2.0, offDiagonal));
      float lambda1 = mid + radius;
      float lambda2 = max(mid - radius, 0.1);
      vec2 diagonalVector = normalize(vec2(offDiagonal, lambda1 - diagonal1));
      vec2 v1 = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector;
      vec2 v2 = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x);

      uint colorUint = covAndColorData.w;
      vColor = vec4(
        float(colorUint & uint(0xFF)) / 255.0,
        float((colorUint >> uint(8)) & uint(0xFF)) / 255.0,
        float((colorUint >> uint(16)) & uint(0xFF)) / 255.0,
        float(colorUint >> uint(24)) / 255.0
      );

      vec3 transformed = position;
      vPosition = transformed.xyz;


      gl_Position = vec4(
        screenCenter
          + transformed.x * v2 / viewport * 2.0
          + transformed.y * v1 / viewport * 2.0, pos2d.z / pos2d.w, 1.0);

      #ifdef USE_FOG
        vFogDepth = -(modelViewMatrix * center).z;
      #endif
    }
    `,
  /*glsl*/ `
    varying vec4 vColor;
    varying vec3 vPosition;

    uniform float time;

    #include <alphatest_pars_fragment>
    #include <alphahash_pars_fragment>
    #include <fog_pars_fragment>

    void main () {
      float A = -dot(vPosition.xy, vPosition.xy);

      if (A < -4.0) discard;

      float B = exp(A) * vColor.a;
      vec4 diffuseColor = vec4(vColor.rgb, B);
      #include <alphahash_fragment>
      #include <alphatest_fragment>
      gl_FragColor = diffuseColor;
      #include <fog_fragment>
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
  (material) => {
    if (!material) return;
    material.extensions.derivatives = true;
    material.blending = CustomBlending;
    material.blendSrcAlpha = OneFactor;
    material.depthTest = true;
    material.depthWrite = false;
    material.transparent = true;
  }
);

extend({ GaussianSplatMaterial });
