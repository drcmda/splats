// Based on:
//   Kevin Kwok https://github.com/antimatter15/splat
//   Quadjr https://github.com/quadjr/aframe-gaussian-splatting

import * as THREE from 'three'
import { SharedState, LocalState } from './Splat'

export async function load(src: string, shared: SharedState, chunkSize = 25000) {
  const data = await fetch(src)
  if (data.body === null) throw new Error('Failed to fetch file')
  const reader = data.body.getReader()
  let bytesDownloaded = 0
  let bytesProcessed = 0
  let _totalDownloadBytes = data.headers.get('Content-Length')
  let totalDownloadBytes = _totalDownloadBytes ? parseInt(_totalDownloadBytes) : undefined
  if (totalDownloadBytes == undefined) throw new Error('Failed to get content length')

  let numVertices = Math.floor(totalDownloadBytes / shared.rowLength)
  const context = shared.gl.getContext()
  let mexTextureSize = context.getParameter(context.MAX_TEXTURE_SIZE)
  shared.maxVertexes = mexTextureSize * mexTextureSize

  if (numVertices > shared.maxVertexes) numVertices = shared.maxVertexes
  shared.bufferTextureWidth = mexTextureSize
  shared.bufferTextureHeight = Math.floor((numVertices - 1) / mexTextureSize) + 1

  shared.centerAndScaleData = new Float32Array(shared.bufferTextureWidth * shared.bufferTextureHeight * 4)
  shared.covAndColorData = new Uint32Array(shared.bufferTextureWidth * shared.bufferTextureHeight * 4)
  shared.centerAndScaleTexture = new THREE.DataTexture(
    shared.centerAndScaleData,
    shared.bufferTextureWidth,
    shared.bufferTextureHeight,
    THREE.RGBAFormat,
    THREE.FloatType,
  )
  shared.centerAndScaleTexture.needsUpdate = true
  shared.covAndColorTexture = new THREE.DataTexture(
    shared.covAndColorData,
    shared.bufferTextureWidth,
    shared.bufferTextureHeight,
    THREE.RGBAIntegerFormat,
    THREE.UnsignedIntType,
  )
  shared.covAndColorTexture.internalFormat = 'RGBA32UI'
  shared.covAndColorTexture.needsUpdate = true

  async function lazyLoad() {
    const chunks: Array<Uint8Array> = []
    while (true) {
      try {
        const { value, done } = await reader.read()
        if (done) break
        bytesDownloaded += value.length
        chunks.push(value)
        const bytesRemains = bytesDownloaded - bytesProcessed
        if (totalDownloadBytes != undefined && bytesRemains > shared.rowLength * chunkSize) {
          let vertexCount = Math.floor(bytesRemains / shared.rowLength)
          const concatenatedChunksbuffer = new Uint8Array(bytesRemains)
          let offset = 0
          for (const chunk of chunks) {
            concatenatedChunksbuffer.set(chunk, offset)
            offset += chunk.length
          }
          chunks.length = 0
          if (bytesRemains > vertexCount * shared.rowLength) {
            const extra_data = new Uint8Array(bytesRemains - vertexCount * shared.rowLength)
            extra_data.set(concatenatedChunksbuffer.subarray(bytesRemains - extra_data.length, bytesRemains), 0)
            chunks.push(extra_data)
          }
          const buffer = new Uint8Array(vertexCount * shared.rowLength)
          buffer.set(concatenatedChunksbuffer.subarray(0, buffer.byteLength), 0)
          const matrices = pushDataBuffer(shared, buffer.buffer, vertexCount)
          shared.worker.postMessage({ method: 'push', matrices: matrices.buffer }, [matrices.buffer])
          bytesProcessed += vertexCount * shared.rowLength
        }
      } catch (error) {
        console.error(error)
        break
      }
    }

    if (bytesDownloaded - bytesProcessed > 0) {
      // Concatenate the chunks into a single Uint8Array
      let concatenatedChunks = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0))
      let offset = 0
      for (const chunk of chunks) {
        concatenatedChunks.set(chunk, offset)
        offset += chunk.length
      }
      let numVertices = Math.floor(concatenatedChunks.byteLength / shared.rowLength)
      const matrices = pushDataBuffer(shared, concatenatedChunks.buffer, numVertices)
      shared.worker.postMessage({ method: 'push', matrices: matrices.buffer }, [matrices.buffer])
    }

    shared.loaded = true
  }
  lazyLoad()
  return shared
}

export function update(gl: THREE.WebGLRenderer, camera: THREE.Camera, shared: SharedState, locals: LocalState) {
  camera.updateMatrixWorld()
  const target = locals.target.current
  let projectionMatrix = getProjectionMatrix(camera, locals.pm)
  target.material.gsProjectionMatrix = projectionMatrix
  target.material.gsModelViewMatrix = getModelViewMatrix(camera, target, locals.vm1, locals.vm2)
  gl.getCurrentViewport(locals.viewport)
  // @ts-ignore
  target.material.viewport[0] = locals.viewport.z
  // @ts-ignore
  target.material.viewport[1] = locals.viewport.w
  target.material.focal = (locals.viewport.w / 2.0) * Math.abs(projectionMatrix.elements[5])

  if (locals.ready) {
    locals.ready = false
    let camera_mtx = getModelViewMatrix(camera, target, locals.vm1, locals.vm2).elements
    let view = new Float32Array([camera_mtx[2], camera_mtx[6], camera_mtx[10], camera_mtx[14]])
    shared.worker.postMessage({ method: 'sort', key: target.uuid, view: view.buffer }, [view.buffer])
  }
}

export function handleEvents(shared: SharedState, locals: LocalState) {
  let splatIndexArray = new Uint32Array(shared.bufferTextureWidth * shared.bufferTextureHeight)
  const splatIndexes = new THREE.InstancedBufferAttribute(splatIndexArray, 1, false)
  splatIndexes.setUsage(THREE.DynamicDrawUsage)

  const geometry = (locals.target.current.geometry = new THREE.InstancedBufferGeometry())
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
    if (locals.target.current && e.data.key === locals.target.current.uuid) {
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
}

function getProjectionMatrix(camera: THREE.Camera, pm: THREE.Matrix4) {
  let mtx = pm.copy(camera.projectionMatrix)
  mtx.elements[4] *= -1
  mtx.elements[5] *= -1
  mtx.elements[6] *= -1
  mtx.elements[7] *= -1
  return mtx
}

function getModelViewMatrix(camera: THREE.Camera, obj: THREE.Object3D, vm1: THREE.Matrix4, vm2: THREE.Matrix4) {
  const viewMatrix = vm1.copy(camera.matrixWorld)
  viewMatrix.elements[1] *= -1.0
  viewMatrix.elements[4] *= -1.0
  viewMatrix.elements[6] *= -1.0
  viewMatrix.elements[9] *= -1.0
  viewMatrix.elements[13] *= -1.0
  const mtx = vm2.copy(obj.matrixWorld)
  mtx.invert()
  mtx.elements[1] *= -1.0
  mtx.elements[4] *= -1.0
  mtx.elements[6] *= -1.0
  mtx.elements[9] *= -1.0
  mtx.elements[13] *= -1.0
  mtx.multiply(viewMatrix)
  mtx.invert()
  return mtx
}

function pushDataBuffer(shared: SharedState, buffer: ArrayBufferLike, vertexCount: number) {
  const context = shared.gl.getContext()
  if (shared.loadedVertexCount + vertexCount > shared.maxVertexes) vertexCount = shared.maxVertexes - shared.loadedVertexCount
  if (vertexCount <= 0) throw new Error('Failed to push data buffer')

  let u_buffer = new Uint8Array(buffer)
  let f_buffer = new Float32Array(buffer)
  let matrices = new Float32Array(vertexCount * 16)

  const covAndColorData_uint8 = new Uint8Array(shared.covAndColorData.buffer)
  const covAndColorData_int16 = new Int16Array(shared.covAndColorData.buffer)
  for (let i = 0; i < vertexCount; i++) {
    let quat = new THREE.Quaternion(
      (u_buffer[32 * i + 28 + 1] - 128) / 128.0,
      (u_buffer[32 * i + 28 + 2] - 128) / 128.0,
      -(u_buffer[32 * i + 28 + 3] - 128) / 128.0,
      (u_buffer[32 * i + 28 + 0] - 128) / 128.0,
    )
    let center = new THREE.Vector3(f_buffer[8 * i + 0], f_buffer[8 * i + 1], -f_buffer[8 * i + 2])
    let scale = new THREE.Vector3(f_buffer[8 * i + 3 + 0], f_buffer[8 * i + 3 + 1], f_buffer[8 * i + 3 + 2])

    let mtx = new THREE.Matrix4()
    mtx.makeRotationFromQuaternion(quat)
    mtx.transpose()
    mtx.scale(scale)
    let mtx_t = mtx.clone()
    mtx.transpose()
    mtx.premultiply(mtx_t)
    mtx.setPosition(center)

    let cov_indexes = [0, 1, 2, 5, 6, 10]
    let max_value = 0.0
    for (let j = 0; j < cov_indexes.length; j++)
      if (Math.abs(mtx.elements[cov_indexes[j]]) > max_value) max_value = Math.abs(mtx.elements[cov_indexes[j]])

    let destOffset = shared.loadedVertexCount * 4 + i * 4
    shared.centerAndScaleData[destOffset + 0] = center.x
    shared.centerAndScaleData[destOffset + 1] = center.y
    shared.centerAndScaleData[destOffset + 2] = center.z
    shared.centerAndScaleData[destOffset + 3] = max_value / 32767.0

    destOffset = shared.loadedVertexCount * 8 + i * 4 * 2
    for (let j = 0; j < cov_indexes.length; j++)
      covAndColorData_int16[destOffset + j] = (mtx.elements[cov_indexes[j]] * 32767.0) / max_value

    // RGBA
    destOffset = shared.loadedVertexCount * 16 + (i * 4 + 3) * 4
    covAndColorData_uint8[destOffset + 0] = u_buffer[32 * i + 24 + 0]
    covAndColorData_uint8[destOffset + 1] = u_buffer[32 * i + 24 + 1]
    covAndColorData_uint8[destOffset + 2] = u_buffer[32 * i + 24 + 2]
    covAndColorData_uint8[destOffset + 3] = u_buffer[32 * i + 24 + 3]

    // Store scale and transparent to remove splat in sorting process
    mtx.elements[15] = (Math.max(scale.x, scale.y, scale.z) * u_buffer[32 * i + 24 + 3]) / 255.0

    for (let j = 0; j < 16; j++) matrices[i * 16 + j] = mtx.elements[j]
  }

  while (vertexCount > 0) {
    let width = 0
    let height = 0
    let xoffset = shared.loadedVertexCount % shared.bufferTextureWidth
    let yoffset = Math.floor(shared.loadedVertexCount / shared.bufferTextureWidth)
    if (shared.loadedVertexCount % shared.bufferTextureWidth != 0) {
      width = Math.min(shared.bufferTextureWidth, xoffset + vertexCount) - xoffset
      height = 1
    } else if (Math.floor(vertexCount / shared.bufferTextureWidth) > 0) {
      width = shared.bufferTextureWidth
      height = Math.floor(vertexCount / shared.bufferTextureWidth)
    } else {
      width = vertexCount % shared.bufferTextureWidth
      height = 1
    }

    const centerAndScaleTextureProperties = shared.gl.properties.get(shared.centerAndScaleTexture)
    context.bindTexture(context.TEXTURE_2D, centerAndScaleTextureProperties.__webglTexture)
    context.texSubImage2D(
      context.TEXTURE_2D,
      0,
      xoffset,
      yoffset,
      width,
      height,
      context.RGBA,
      context.FLOAT,
      shared.centerAndScaleData,
      shared.loadedVertexCount * 4,
    )

    const covAndColorTextureProperties = shared.gl.properties.get(shared.covAndColorTexture)
    context.bindTexture(context.TEXTURE_2D, covAndColorTextureProperties.__webglTexture)
    context.texSubImage2D(
      context.TEXTURE_2D,
      0,
      xoffset,
      yoffset,
      width,
      height,
      // @ts-ignore
      context.RGBA_INTEGER,
      context.UNSIGNED_INT,
      shared.covAndColorData,
      shared.loadedVertexCount * 4,
    )

    shared.loadedVertexCount += width * height
    vertexCount -= width * height
  }
  return matrices
}
