import { useEffect, useRef, useState } from "react";
import {
  extend,
  ReactThreeFiber,
  useFrame,
  useThree,
} from "@react-three/fiber";
import {
  HalfFloatType,
  LinearSRGBColorSpace,
  RGBAFormat,
  WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { TAARenderPass } from "three/addons/postprocessing/TAARenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

extend({
  TAARenderPass,
  EffectComposer,
  RenderPass,
  OutputPass,
  UnrealBloomPass,
});

declare module "@react-three/fiber" {
  interface ThreeElements {
    tAARenderPass: ReactThreeFiber.Object3DNode<
      TAARenderPass,
      typeof TAARenderPass
    >;
    outputPass: ReactThreeFiber.Object3DNode<OutputPass, typeof OutputPass>;
    unrealBloomPass: ReactThreeFiber.Object3DNode<
      UnrealBloomPass,
      typeof UnrealBloomPass
    >;
  }
}

export const taaState = {
  needsUpdate: true,
};

export function TAAPass(props: { sampleLevel?: number }) {
  const { sampleLevel = 4 } = props;
  const composer = useRef<EffectComposer>(null);
  const { scene, gl, size, camera, viewport } = useThree();

  const taaPass = useRef<TAARenderPass>(null);

  const [target] = useState(() => {
    const t = new WebGLRenderTarget(size.width, size.height, {
      type: HalfFloatType,
      format: RGBAFormat,
      colorSpace: LinearSRGBColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
      anisotropy: 1,
    });
    t.samples = 2;
    return t;
  });

  useEffect(() => {
    if (!composer.current) return;
    composer.current.setSize(size.width, size.height);
    composer.current.setPixelRatio(viewport.dpr);
    taaState.needsUpdate = true;
  }, [gl, size, viewport.dpr]);

  useFrame(() => {
    if (!composer.current || !taaPass.current) return;
    composer.current?.render();
    if (taaState.needsUpdate) {
      taaPass.current.accumulate = false;
      taaPass.current.sampleLevel = 2;
      // taaState.needsUpdate = false;
    } else {
      taaPass.current.accumulate = true;
      taaPass.current.sampleLevel = sampleLevel;
    }
  }, 1);

  return (
    <>
      {/*@ts-expect-error - can't figure out how to type composer properly */}
      <effectComposer ref={composer} args={[gl, target]}>
        <tAARenderPass
          attach="passes-0"
          ref={taaPass}
          scene={scene}
          camera={camera}
          sampleLevel={sampleLevel}
          unbiased={false}
        />
        <outputPass attach="passes-1" />
      </effectComposer>
    </>
  );
}
