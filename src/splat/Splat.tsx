// Based on:
//   Kevin Kwok https://github.com/antimatter15/splat
//   Quadjr https://github.com/quadjr/aframe-gaussian-splatting

import * as THREE from 'three'
import * as React from 'react'
import { extend, useThree, useFrame, useLoader } from '@react-three/fiber'
import { SplatMaterial } from './SplatMaterial'
import { SplatLoader } from './util'

export type SplatMaterialType = {
  alphaTest?: number
  alphaHash?: boolean
  centerAndScaleTexture?: THREE.DataTexture
  covAndColorTexture?: THREE.DataTexture
  viewport?: Float32Array
  focal?: number
  gsProjectionMatrix?: THREE.Matrix4
  gsModelViewMatrix?: THREE.Matrix4
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

export type SharedState = {
  gl: THREE.WebGLRenderer
  worker: Worker
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
  connect(locals: LocalState): () => void
  update(gl: THREE.WebGLRenderer, camera: THREE.Camera, locals: LocalState): void
}

export type LocalState = {
  ready: boolean
  target: React.MutableRefObject<THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial & SplatMaterialType>>
  pm: THREE.Matrix4
  vm1: THREE.Matrix4
  vm2: THREE.Matrix4
  viewport: THREE.Vector4
}

export function Splat({ src, alphaTest = 0, alphaHash = false, chunkSize = 25000, ...props }: SplatProps) {
  extend({ SplatMaterial })

  const ref = React.useRef<THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial & SplatMaterialType>>(null!)
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)

  // Local state
  const [locals] = React.useState<LocalState>(() => ({
    target: ref,
    ready: false,
    pm: new THREE.Matrix4(),
    vm1: new THREE.Matrix4(),
    vm2: new THREE.Matrix4(),
    viewport: new THREE.Vector4(),
  }))

  // Shared state, globally memoized, the same url re-uses the same daza
  const shared = useLoader(SplatLoader, src, (loader) => {
    loader.gl = gl
    loader.chunkSize = chunkSize
  }) as SharedState

  // Listen to worker results, apply them to the target mesh
  React.useEffect(() => {
    return shared.connect(locals)
  }, [src])

  // Update the worker
  useFrame(() => {
    shared.update(gl, camera, locals)
  })

  return (
    <mesh ref={ref} frustumCulled={false} {...props}>
      <splatMaterial
        key={`${alphaTest}/${alphaHash}`}
        transparent
        depthTest
        alphaTest={alphaHash ? 0 : alphaTest}
        centerAndScaleTexture={shared.centerAndScaleTexture}
        covAndColorTexture={shared.covAndColorTexture}
        depthWrite={alphaHash ? true : alphaTest > 0}
        blending={THREE.CustomBlending}
        blendSrcAlpha={THREE.OneFactor}
        alphaHash={!!alphaHash}
      />
    </mesh>
  )
}
