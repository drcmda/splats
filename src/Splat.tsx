// Based on:
//   Kevin Kwok https://github.com/antimatter15/splat
//   Quadjr https://github.com/quadjr/aframe-gaussian-splatting
// Adapted by:
//   Paul Henschel twitter.com/0xca0a
//   Luc Palombo twitter.com/_swiftp

import * as THREE from 'three'
import * as React from 'react'
import { useThree, useLoader } from '@react-three/fiber'

import { GaussianSplatMaterial } from './lib/GaussianSplatMaterial'
import { GaussianSplatLoader } from './lib/GaussianSplatLoader'
import { GaussianSplatObject } from './lib/GaussianSplatObject'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      gaussianSplatMaterial: JSX.IntrinsicElements['shaderMaterial']
    }
  }
}

type SplatProps = {
  src: string
  alphaTest?: number
  alphaHash?: boolean
} & JSX.IntrinsicElements['group']

export function Splat({ src, alphaTest = 0.1, alphaHash = false, ...props }: SplatProps) {
  const ref = React.useRef<THREE.Group>(null!)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  const object = useLoader(GaussianSplatLoader, src, (loader) => {
    loader.assignRenderer(gl, scene);
  }) as GaussianSplatObject

  return (
    <group ref={ref} {...props}>
      {object.mesh && (
        <primitive object={object.mesh}>
          <gaussianSplatMaterial
            key={`${alphaTest}/${alphaHash}${GaussianSplatMaterial.key}`}
            depthTest
            alphaTest={alphaHash ? 0 : alphaTest}
            depthWrite={alphaHash ? true : alphaTest > 0}
            blending={alphaHash ? THREE.NormalBlending : THREE.CustomBlending}
            blendSrcAlpha={THREE.OneFactor}
            alphaHash={!!alphaHash}
            transparent={!alphaHash}
            toneMapped={false}
          />
        </primitive>
      )}
    </group>
  )
}
