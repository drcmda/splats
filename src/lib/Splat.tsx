// Based on:
//   Kevin Kwok https://github.com/antimatter15/splat
//   Quadjr https://github.com/quadjr/aframe-gaussian-splatting
// Adapted by:
//   Paul Henschel twitter.com/0xca0a

import * as THREE from 'three'
import * as React from 'react'
import { extend, useThree, useFrame, useLoader } from '@react-three/fiber'
import { SplatMaterial } from './SplatMaterial'
import { SplatLoader } from './SplatLoader'
import type { TargetMesh, SplatMaterialType, SharedState } from './types'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      splatMaterial: SplatMaterialType & JSX.IntrinsicElements['shaderMaterial']
    }
  }
}

type SplatProps = {
  src: string
  toneMapped?: boolean
  alphaTest?: number
  alphaHash?: boolean
  chunkSize?: number
} & JSX.IntrinsicElements['mesh']

export function Splat({ src, toneMapped = false, alphaTest = 0, alphaHash = false, chunkSize = 25000, ...props }: SplatProps) {
  extend({ SplatMaterial })

  const ref = React.useRef<TargetMesh>(null!)
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)

  // Shared state, globally memoized, the same url re-uses the same daza
  const shared = useLoader(SplatLoader, src, (loader) => {
    loader.gl = gl
    loader.chunkSize = chunkSize
  }) as SharedState

  // Listen to worker results, apply them to the target mesh
  React.useLayoutEffect(() => shared.connect(ref.current), [src])
  // Update the worker
  useFrame(() => shared.update(ref.current, camera, alphaHash))

  return (
    <mesh ref={ref} frustumCulled={false} {...props}>
      <splatMaterial
        key={`${src}/${alphaTest}/${alphaHash}${SplatMaterial.key}`}
        transparent={!alphaHash}
        depthTest
        alphaTest={alphaHash ? 0 : alphaTest}
        centerAndScaleTexture={shared.centerAndScaleTexture}
        covAndColorTexture={shared.covAndColorTexture}
        depthWrite={alphaHash ? true : alphaTest > 0}
        blending={alphaHash ? THREE.NormalBlending : THREE.CustomBlending}
        blendSrcAlpha={THREE.OneFactor}
        alphaHash={!!alphaHash}
        toneMapped={toneMapped}
      />
    </mesh>
  )
}
