// Based on:
//   Kevin Kwok https://github.com/antimatter15/splat
//   Quadjr https://github.com/quadjr/aframe-gaussian-splatting

let matrices = new Float32Array()

function sortSplats(view: Float32Array, hashed: boolean = false) {
  const vertexCount = matrices.length / 16
  const threshold = -0.0001

  let maxDepth = -Infinity
  let minDepth = Infinity
  const depthList = new Float32Array(vertexCount)
  const sizeList = new Int32Array(depthList.buffer)
  const validIndexList = new Int32Array(vertexCount)

  let validCount = 0
  for (let i = 0; i < vertexCount; i++) {
    // Sign of depth is reversed
    const depth = view[0] * matrices[i * 16 + 12] + view[1] * matrices[i * 16 + 13] + view[2] * matrices[i * 16 + 14] + view[3]
    // Skip behind of camera and small, transparent splat
    if (hashed || (depth < 0 && matrices[i * 16 + 15] > threshold * depth)) {
      depthList[validCount] = depth
      validIndexList[validCount] = i
      validCount++
      if (depth > maxDepth) maxDepth = depth
      if (depth < minDepth) minDepth = depth
    }
  }

  // This is a 16 bit single-pass counting sort
  const depthInv = (256 * 256 - 1) / (maxDepth - minDepth)
  const counts0 = new Uint32Array(256 * 256)
  for (let i = 0; i < validCount; i++) {
    sizeList[i] = ((depthList[i] - minDepth) * depthInv) | 0
    counts0[sizeList[i]]++
  }
  const starts0 = new Uint32Array(256 * 256)
  for (let i = 1; i < 256 * 256; i++) starts0[i] = starts0[i - 1] + counts0[i - 1]
  const depthIndex = new Uint32Array(validCount)
  for (let i = 0; i < validCount; i++) depthIndex[starts0[sizeList[i]]++] = validIndexList[i]
  return depthIndex
}

self.onmessage = (e: { data: { method: string; key: string; view: Float32Array; matrices: Float32Array; hashed: boolean } }) => {
  if (e.data.method == 'push') {
    const new_matrices = new Float32Array(e.data.matrices)
    if (matrices === undefined) {
      matrices = new_matrices
    } else {
      const resized = new Float32Array(matrices.length + new_matrices.length)
      resized.set(matrices)
      resized.set(new_matrices, matrices.length)
      matrices = resized
    }
  }
  if (e.data.method == 'sort') {
    if (matrices !== undefined) {
      const indices = sortSplats(new Float32Array(e.data.view), e.data.hashed)
      // @ts-ignore
      self.postMessage({ indices, key: e.data.key }, [indices.buffer])
    }
  }
}
