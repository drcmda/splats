// Based on:
//   Kevin Kwok https://github.com/antimatter15/splat
//   Quadjr https://github.com/quadjr/aframe-gaussian-splatting
// Adapted by:
//   Paul Henschel twitter.com/0xca0a

import * as THREE from 'three'

export type SplatMaterialType = {
  alphaTest?: number
  alphaHash?: boolean
  centerAndScaleTexture?: THREE.DataTexture
  covAndColorTexture?: THREE.DataTexture
  viewport?: THREE.Vector2
  focal?: number
}

export type TargetMesh = THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial & SplatMaterialType> & {
  ready: boolean
  sorted: boolean
  pm: THREE.Matrix4
  vm1: THREE.Matrix4
  vm2: THREE.Matrix4
  viewport: THREE.Vector4
}

export type SharedState = {
  url: string
  gl: THREE.WebGLRenderer
  worker: Worker
  manager: THREE.LoadingManager
  stream: ReadableStreamDefaultReader<Uint8Array>
  loading: boolean
  loaded: boolean
  loadedVertexCount: number
  rowLength: number
  maxVertexes: number
  chunkSize: number
  totalDownloadBytes: number
  numVertices: number
  bufferTextureWidth: number
  bufferTextureHeight: number
  centerAndScaleData: Float32Array
  covAndColorData: Uint32Array
  covAndColorTexture: THREE.DataTexture
  centerAndScaleTexture: THREE.DataTexture
  connect(target: TargetMesh): () => void
  update(target: TargetMesh, camera: THREE.Camera, hashed: boolean): void
  onProgress?: (event: ProgressEvent) => void
}
