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

export type SplatMaterialType = {
  alphaTest?: number
  alphaHash?: boolean
  centerAndScaleTexture?: THREE.DataTexture
  covAndColorTexture?: THREE.DataTexture
  viewport?: Float32Array
  focal?: number
} & JSX.IntrinsicElements['shaderMaterial']

declare global {
  namespace JSX {
    interface IntrinsicElements {
      splatMaterial: SplatMaterialType
    }
  }
}

type SplatProps = {
  src: string
  alphaTest?: number
  alphaHash?: boolean
  chunkSize?: number
} & JSX.IntrinsicElements['mesh']

export type TargetMesh = THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial & SplatMaterialType> & {
  ready: boolean
  sorted: boolean
  pm: THREE.Matrix4
  vm1: THREE.Matrix4
  vm2: THREE.Matrix4
  viewport: THREE.Vector4
}

export type SharedState = {
  url: string,
  gl: THREE.WebGLRenderer
  worker: Worker
  manager: THREE.LoadingManager
  loaded: boolean
  loadedVertexCount: number
  rowLength: number
  maxVertexes: number
  chunkSize: number
  bufferTextureWidth: number
  bufferTextureHeight: number
  centerAndScaleData: Float32Array
  covAndColorData: Uint32Array
  covAndColorTexture: THREE.DataTexture
  centerAndScaleTexture: THREE.DataTexture
  connect(target: TargetMesh): () => void
  update(target: TargetMesh, camera: THREE.Camera, hashed: boolean): void
}

export function Splat({ src, alphaTest = 0, alphaHash = false, chunkSize = 25000, ...props }: SplatProps) {
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
  React.useEffect(() => shared.connect(ref.current), [src])

  // Update the worker
  useFrame(() => shared.update(ref.current, camera, alphaHash))

  return (
    <mesh ref={ref} frustumCulled={false} {...props}>
      <splatMaterial
        key={`${alphaTest}/${alphaHash}${SplatMaterial.key}`}
        transparent={!alphaHash}
        depthTest
        alphaTest={alphaHash ? 0 : alphaTest}
        centerAndScaleTexture={shared.centerAndScaleTexture}
        covAndColorTexture={shared.covAndColorTexture}
        depthWrite={alphaHash ? true : alphaTest > 0}
        blending={alphaHash ? THREE.NormalBlending : THREE.CustomBlending}
        blendSrcAlpha={THREE.OneFactor}
        alphaHash={!!alphaHash}
        toneMapped={false}
      />
    </mesh>
  )
}
