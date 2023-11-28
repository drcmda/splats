// Based on:
//   Kevin Kwok https://github.com/antimatter15/splat
//   Quadjr https://github.com/quadjr/aframe-gaussian-splatting

import * as THREE from 'three'
import * as React from 'react'
import { extend, useThree, useFrame } from '@react-three/fiber'
import { suspend } from 'suspend-react'
import { SplatMaterial } from './SplatMaterial'
import { createWorker } from './worker'
import { load, getProjectionMatrix, getModelViewMatrix } from './util'

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
  bufferTextureWidth: number
  bufferTextureHeight: number
  centerAndScaleData: Float32Array
  covAndColorData: Uint32Array
  covAndColorTexture: THREE.DataTexture
  centerAndScaleTexture: THREE.DataTexture
}

export function Splat({ src, alphaTest = 0, alphaHash = false, chunkSize = 25000, ...props }: SplatProps) {
  extend({ SplatMaterial })

  const ref = React.useRef<THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial & SplatMaterialType>>(null!)
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)

  const [locals] = React.useState(() => ({ ready: false }))
  const [shared] = suspend(async () => {
    const worker = new Worker(
      URL.createObjectURL(
        new Blob(['(', createWorker.toString(), ')(self)'], {
          type: 'application/javascript',
        }),
      ),
    )
    const shared: SharedState = {
      gl,
      worker,
      loaded: false,
      loadedVertexCount: 0,
      rowLength: 3 * 4 + 3 * 4 + 4 + 4,
      maxVertexes: 0,
      bufferTextureWidth: 0,
      bufferTextureHeight: 0,
      centerAndScaleData: null!,
      covAndColorData: null!,
      covAndColorTexture: null!,
      centerAndScaleTexture: null!,
    }
    await load(src, shared, worker, chunkSize)
    return [shared]
  }, [src])

  React.useEffect(() => {
    let splatIndexArray = new Uint32Array(shared.bufferTextureWidth * shared.bufferTextureHeight)
    const splatIndexes = new THREE.InstancedBufferAttribute(splatIndexArray, 1, false)
    splatIndexes.setUsage(THREE.DynamicDrawUsage)

    const geometry = (ref.current.geometry = new THREE.InstancedBufferGeometry())
    const positionsArray = new Float32Array(6 * 3)
    const positions = new THREE.BufferAttribute(positionsArray, 3)
    geometry.setAttribute('position', positions)
    positions.setXYZ(2, -2.0, 2.0, 0.0)
    positions.setXYZ(1, 2.0, 2.0, 0.0)
    positions.setXYZ(0, -2.0, -2.0, 0.0)
    positions.setXYZ(5, -2.0, -2.0, 0.0)
    positions.setXYZ(4, 2.0, 2.0, 0.0)
    positions.setXYZ(3, 2.0, -2.0, 0.0)
    positions.needsUpdate = true
    geometry.setAttribute('splatIndex', splatIndexes)
    geometry.instanceCount = 1

    function listener(e: { data: { key: string; indices: Uint32Array } }) {
      if (ref.current && e.data.key === ref.current.uuid) {
        let indexes = new Uint32Array(e.data.indices)
        // @ts-ignore
        geometry.attributes.splatIndex.set(indexes)
        geometry.attributes.splatIndex.needsUpdate = true
        geometry.instanceCount = indexes.length
        locals.ready = true
      }
    }
    shared.worker.addEventListener('message', listener)

    async function wait() {
      while (true) {
        const centerAndScaleTextureProperties = shared.gl.properties.get(shared.centerAndScaleTexture)
        const covAndColorTextureProperties = shared.gl.properties.get(shared.covAndColorTexture)
        if (centerAndScaleTextureProperties?.__webglTexture && covAndColorTextureProperties?.__webglTexture) break
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      locals.ready = true
    }

    wait()
    return () => shared.worker.removeEventListener('message', listener)
  }, [src])

  const pm = new THREE.Matrix4()
  let vm1 = new THREE.Matrix4()
  let vm2 = new THREE.Matrix4()
  let viewport = new THREE.Vector4()
  useFrame(() => {
    camera.updateMatrixWorld()
    let projectionMatrix = getProjectionMatrix(camera, pm)
    ref.current.material.gsProjectionMatrix = projectionMatrix
    ref.current.material.gsModelViewMatrix = getModelViewMatrix(camera, ref.current, vm1, vm2)
    gl.getCurrentViewport(viewport)
    // @ts-ignore
    ref.current.material.viewport[0] = viewport.z
    // @ts-ignore
    ref.current.material.viewport[1] = viewport.w
    ref.current.material.focal = (viewport.w / 2.0) * Math.abs(projectionMatrix.elements[5])

    if (locals.ready) {
      locals.ready = false
      let camera_mtx = getModelViewMatrix(camera, ref.current, vm1, vm2).elements
      let view = new Float32Array([camera_mtx[2], camera_mtx[6], camera_mtx[10], camera_mtx[14]])
      shared.worker.postMessage({ method: 'sort', key: ref.current.uuid, view: view.buffer }, [view.buffer])
    }
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
