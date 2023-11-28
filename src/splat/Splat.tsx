// Based on:
//   Kevin Kwok https://github.com/antimatter15/splat
//   Quadjr https://github.com/quadjr/aframe-gaussian-splatting

import * as THREE from 'three'
import * as React from 'react'
import { extend, useThree, useFrame } from '@react-three/fiber'
import { suspend } from 'suspend-react'
import { SplatMaterial } from './SplatMaterial'
import { createWorker } from './worker'
import { load, handleEvents, update } from './util'

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

  const [locals] = React.useState<LocalState>(() => ({
    target: ref,
    ready: false,
    pm: new THREE.Matrix4(),
    vm1: new THREE.Matrix4(),
    vm2: new THREE.Matrix4(),
    viewport: new THREE.Vector4(),
  }))
  const shared = suspend(async () => {
    return await load(
      src,
      {
        gl,
        worker: new Worker(
          URL.createObjectURL(
            new Blob(['(', createWorker.toString(), ')(self)'], {
              type: 'application/javascript',
            }),
          ),
        ),
        loaded: false,
        loadedVertexCount: 0,
        chunkSize: 25000,
        rowLength: 3 * 4 + 3 * 4 + 4 + 4,
        maxVertexes: 0,
        bufferTextureWidth: 0,
        bufferTextureHeight: 0,
        centerAndScaleData: null!,
        covAndColorData: null!,
        covAndColorTexture: null!,
        centerAndScaleTexture: null!,
      },
    )
  }, [src])

  React.useEffect(() => {
    return handleEvents(shared, locals)
  }, [src])

  useFrame(() => {
    update(gl, camera, shared, locals)
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
