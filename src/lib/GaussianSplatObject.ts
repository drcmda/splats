import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DynamicDrawUsage,
  FloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Mesh,
  Object3DEventMap,
  Quaternion,
  RGBAFormat,
  RGBAIntegerFormat,
  ShaderMaterial,
  UnsignedIntType,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";

import { GaussianSplatMaterial } from "./GaussianSplatMaterial";

const viewport = /* @__PURE__ */ new Vector4();

export class GaussianSplatObject {
  public worker: Worker;
  public mesh: Mesh<InstancedBufferGeometry, ShaderMaterial, Object3DEventMap>;
  public sortReady: boolean = false;
  public centerAndScaleTexture: DataTexture;
  public covAndColorTexture: DataTexture;
  public url: string;

  private bufferTextureWidth: number;
  private maxVertexCount: number;
  private bufferTextureHeight: number;

  private centerAndScaleData?: Float32Array;
  private covAndColorData?: Uint32Array;

  private loadedVertexCount: number = 0;

  constructor(
    bufferTextureWidth: number,
    bufferTextureHeight: number,
    url: string
  ) {
    this.worker = new Worker(
      new URL("./worker/GaussianSplatLoader.worker.ts", import.meta.url),
      {
        type: "module",
      }
    );
    this.worker.postMessage({ method: "clear" });

    this.bufferTextureWidth = bufferTextureWidth;
    this.maxVertexCount = bufferTextureWidth * bufferTextureWidth;
    this.bufferTextureHeight = bufferTextureHeight;
    this.url = url;

    this.centerAndScaleData = new Float32Array(
      this.bufferTextureWidth * this.bufferTextureHeight * 4
    );
    this.covAndColorData = new Uint32Array(
      this.bufferTextureWidth * this.bufferTextureHeight * 4
    );

    this.centerAndScaleTexture = new DataTexture(
      this.centerAndScaleData,
      this.bufferTextureWidth,
      this.bufferTextureHeight,
      RGBAFormat,
      FloatType
    );
    this.centerAndScaleTexture.needsUpdate = true;
    this.covAndColorTexture = new DataTexture(
      this.covAndColorData,
      this.bufferTextureWidth,
      this.bufferTextureHeight,
      RGBAIntegerFormat,
      UnsignedIntType
    );
    this.covAndColorTexture.internalFormat = "RGBA32UI";
    this.covAndColorTexture.needsUpdate = true;

    const splatIndexArray = new Uint32Array(
      this.bufferTextureWidth * this.bufferTextureHeight
    );
    const splatIndexes = new InstancedBufferAttribute(
      splatIndexArray,
      1,
      false
    );
    splatIndexes.setUsage(DynamicDrawUsage);

    const baseGeometry = new BufferGeometry();
    const positionsArray = new Float32Array(6 * 3);
    const positions = new BufferAttribute(positionsArray, 3);
    baseGeometry.setAttribute("position", positions);
    positions.setXYZ(2, -2.0, 2.0, 0.0);
    positions.setXYZ(1, 2.0, 2.0, 0.0);
    positions.setXYZ(0, -2.0, -2.0, 0.0);
    positions.setXYZ(5, -2.0, -2.0, 0.0);
    positions.setXYZ(4, 2.0, 2.0, 0.0);
    positions.setXYZ(3, 2.0, -2.0, 0.0);
    positions.needsUpdate = true;

    const geometry = new InstancedBufferGeometry();
    //@ts-expect-error - needs to copy base quad
    geometry.copy(baseGeometry);

    geometry.setAttribute("splatIndex", splatIndexes);
    geometry.instanceCount = 1;

    const material = new GaussianSplatMaterial();
    material.uniforms.covAndColorTexture.value = this.covAndColorTexture;
    material.uniforms.centerAndScaleTexture.value = this.centerAndScaleTexture;

    const mesh = new Mesh(geometry, material);
    mesh.name = "GaussianSplat";
    // mesh.frustumCulled = false;
    mesh.frustumCulled = true;
    this.mesh = mesh;
    let firstSort = false;

    this.worker.onmessage = (e) => {
      const indexes = new Uint32Array(e.data.sortedIndexes);
      (
        this.mesh.geometry.attributes.splatIndex as InstancedBufferAttribute
      ).set(indexes);
      this.mesh.material.uniforms.covAndColorTexture.value =
        this.covAndColorTexture;
      this.mesh.material.uniforms.centerAndScaleTexture.value =
        this.centerAndScaleTexture;
      this.mesh.geometry.attributes.splatIndex.needsUpdate = true;
      this.mesh.geometry.instanceCount = indexes.length;
      this.sortReady = true;
      firstSort = true;
    };

    this.mesh.onBeforeRender = (renderer, _scene, camera) => {
      if (
        !this.mesh.material.uniforms.viewport ||
        !this.mesh.material.uniforms.focal
      )
        return;

      renderer.getCurrentViewport(viewport);
      const focal =
        (viewport.w / 2.0) * Math.abs(camera.projectionMatrix.elements[5]);
      this.mesh.material.uniforms.viewport.value.x = viewport.z;
      this.mesh.material.uniforms.viewport.value.y = viewport.w;
      this.mesh.material.uniforms.focal.value = focal;
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.mesh.onAfterRender = (renderer, scene, camera) => {
      if (!this.sortReady) return;

      if (firstSort && this.mesh.material.alphaHash) return;

      this.sortReady = false;
      this.mesh.updateMatrix();
      const view = new Float32Array([
        this.mesh.modelViewMatrix.elements[2],
        -this.mesh.modelViewMatrix.elements[6],
        this.mesh.modelViewMatrix.elements[10],
        this.mesh.modelViewMatrix.elements[14],
      ]);
      // TODO: Cutoouts
      // let worldToCutout = new THREE.Matrix4();
      // if (this.cutout) {
      //   worldToCutout.copy(this.cutout.matrixWorld);
      //   worldToCutout.invert();
      //   worldToCutout.multiply(this.object.matrixWorld);
      // }
      this.worker.postMessage(
        {
          method: "sort",
          view: view.buffer,
          cutout: undefined,
          // cutout: this.cutout ? new Float32Array(worldToCutout.elements) : undefined
        },
        [view.buffer]
      );
    };
  }

  pushDataBuffer(
    renderer: WebGLRenderer,
    buffer: ArrayBufferLike,
    vertexCount: number
  ) {
    if (!this.covAndColorData || !this.centerAndScaleData) {
      throw new Error("Data buffer is not initialized");
    }

    if (this.loadedVertexCount + vertexCount > this.maxVertexCount) {
      console.log("vertexCount limited to ", this.maxVertexCount, vertexCount);
      vertexCount = this.maxVertexCount - this.loadedVertexCount;
    }
    if (vertexCount <= 0) {
      return;
    }

    const u_buffer = new Uint8Array(buffer);
    const f_buffer = new Float32Array(buffer);
    const matrices = new Float32Array(vertexCount * 16);

    const covAndColorData_uint8 = new Uint8Array(this.covAndColorData.buffer);
    const covAndColorData_int16 = new Int16Array(this.covAndColorData.buffer);

    for (let i = 0; i < vertexCount; i++) {
      const quat = new Quaternion(
        -(u_buffer[32 * i + 28 + 1] - 128) / 128.0,
        (u_buffer[32 * i + 28 + 2] - 128) / 128.0,
        (u_buffer[32 * i + 28 + 3] - 128) / 128.0,
        -(u_buffer[32 * i + 28 + 0] - 128) / 128.0
      );

      quat.invert();

      const center = new Vector3(
        f_buffer[8 * i + 0],
        f_buffer[8 * i + 1],
        -f_buffer[8 * i + 2]
      );
      const scale = new Vector3(
        f_buffer[8 * i + 3 + 0],
        f_buffer[8 * i + 3 + 1],
        f_buffer[8 * i + 3 + 2]
      );

      const mtx = new Matrix4();
      mtx.makeRotationFromQuaternion(quat);
      mtx.transpose();
      mtx.scale(scale);
      const mtx_t = mtx.clone();
      mtx.transpose();
      mtx.premultiply(mtx_t);
      mtx.setPosition(center);

      const cov_indexes = [0, 1, 2, 5, 6, 10];
      let max_value = 0.0;
      for (let j = 0; j < cov_indexes.length; j++) {
        if (Math.abs(mtx.elements[cov_indexes[j]]) > max_value) {
          max_value = Math.abs(mtx.elements[cov_indexes[j]]);
        }
      }

      let destOffset = this.loadedVertexCount * 4 + i * 4;
      this.centerAndScaleData[destOffset + 0] = center.x;
      this.centerAndScaleData[destOffset + 1] = -center.y;
      this.centerAndScaleData[destOffset + 2] = center.z;
      this.centerAndScaleData[destOffset + 3] = max_value / 32767.0;

      destOffset = this.loadedVertexCount * 8 + i * 4 * 2;
      for (let j = 0; j < cov_indexes.length; j++) {
        covAndColorData_int16[destOffset + j] =
          ((mtx.elements[cov_indexes[j]] * 32767.0) / max_value) | 0;
      }

      // RGBA
      destOffset = this.loadedVertexCount * 16 + (i * 4 + 3) * 4;
      covAndColorData_uint8[destOffset + 0] = u_buffer[32 * i + 24 + 0];
      covAndColorData_uint8[destOffset + 1] = u_buffer[32 * i + 24 + 1];
      covAndColorData_uint8[destOffset + 2] = u_buffer[32 * i + 24 + 2];
      covAndColorData_uint8[destOffset + 3] = u_buffer[32 * i + 24 + 3];

      // Store scale and transparent to remove splat in sorting process
      mtx.elements[15] =
        (Math.max(scale.x, scale.y, scale.z) * u_buffer[32 * i + 24 + 3]) /
        255.0;

      for (let j = 0; j < 16; j++) {
        matrices[i * 16 + j] = mtx.elements[j];
      }
    }

    const gl = renderer.getContext() as WebGL2RenderingContext;
    while (vertexCount > 0) {
      let width = 0;
      let height = 0;
      const xoffset = this.loadedVertexCount % this.bufferTextureWidth;
      const yoffset = Math.floor(
        this.loadedVertexCount / this.bufferTextureWidth
      );
      if (this.loadedVertexCount % this.bufferTextureWidth != 0) {
        width =
          Math.min(this.bufferTextureWidth, xoffset + vertexCount) - xoffset;
        height = 1;
      } else if (Math.floor(vertexCount / this.bufferTextureWidth) > 0) {
        width = this.bufferTextureWidth;
        height = Math.floor(vertexCount / this.bufferTextureWidth);
      } else {
        width = vertexCount % this.bufferTextureWidth;
        height = 1;
      }

      const centerAndScaleTextureProperties = renderer.properties.get(
        this.centerAndScaleTexture
      );
      gl.bindTexture(
        gl.TEXTURE_2D,
        centerAndScaleTextureProperties.__webglTexture
      );
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        xoffset,
        yoffset,
        width,
        height,
        gl.RGBA,
        gl.FLOAT,
        this.centerAndScaleData,
        this.loadedVertexCount * 4
      );

      const covAndColorTextureProperties = renderer.properties.get(
        this.covAndColorTexture
      );
      gl.bindTexture(
        gl.TEXTURE_2D,
        covAndColorTextureProperties.__webglTexture
      );
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        xoffset,
        yoffset,
        width,
        height,
        gl.RGBA_INTEGER,
        gl.UNSIGNED_INT,
        this.covAndColorData,
        this.loadedVertexCount * 4
      );

      this.loadedVertexCount += width * height;
      vertexCount -= width * height;
    }

    this.worker.postMessage(
      {
        method: "push",
        matrices: matrices.buffer,
      },
      [matrices.buffer]
    );
  }

  dispose() {
    this.worker.terminate();
    this.covAndColorTexture.dispose();
    this.centerAndScaleTexture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();

    this.covAndColorData = undefined;
    this.centerAndScaleData = undefined;
  }
}
