import {
  FileLoader,
  Loader,
  type LoadingManager,
  type Scene,
  type WebGLRenderer,
} from "three";

import { GaussianSplatObject } from "./GaussianSplatObject";

class GaussianSplatLoader extends Loader {
  private _renderer: WebGLRenderer | null;
  private _scene: Scene | null;

  constructor(manager: LoadingManager | undefined) {
    super(manager);
    this._renderer = null;
    this._scene = null;
  }

  assignRenderer(renderer: WebGLRenderer, scene: Scene) {
    this._renderer = renderer;
    this._scene = scene;
  }

  // override load function
  load(
    url: string,
    onLoad: (data: GaussianSplatObject) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void
  ): void {
    if (!this._renderer) throw new Error("Renderer is not assigned");
    if (!this._scene) throw new Error("Scene is not assigned");

    const rowLength = 3 * 4 + 3 * 4 + 4 + 4;
    const isPly = url.endsWith(".ply");

    const loader = new FileLoader(this.manager);

    this.manager.itemStart(url);

    const _onError = function (e: unknown) {
      if (onError) {
        onError(e);
      } else {
        console.error(e);
      }
      scope.manager.itemError(url);
      scope.manager.itemEnd(url);
    };

    loader.setPath(this.path);
    loader.setResponseType("arraybuffer");
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);

    const scope = this;

    loader.load(
      url,
      function (data) {
        try {
          const _data = data as ArrayBuffer;
          let bufferArray = new Uint8Array(_data);
          if (isPly) {
            bufferArray = new Uint8Array(processPlyBuffer(bufferArray.buffer));
          }

          const numVertexes = Math.floor(bufferArray.byteLength / rowLength);

          scope
            .initGL(numVertexes, url)
            .then((splatObject) => {
              splatObject?.pushDataBuffer(
                scope._renderer!,
                bufferArray.buffer,
                numVertexes
              );
              onLoad(splatObject);
              scope.manager.itemEnd(url);
            })
            .catch((e) => {
              _onError(e);
            });
        } catch (e) {
          _onError(e);
        }
      },
      onProgress,
      _onError
    );
  }

  initGL = async (numVertexes: number, url: string) => {
    if (!this._renderer) throw new Error("Renderer is not assigned");
    if (!this._scene) throw new Error("Scene is not assigned");

    const gl = this._renderer.getContext();
    let maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    maxTextureSize = Math.floor(maxTextureSize);
    const maxVertexes = maxTextureSize * maxTextureSize;

    if (numVertexes > maxVertexes) {
      console.warn(
        `Vertex count of splat was ${numVertexes} but has been limited to ${maxVertexes} by WebGL restrictions`
      );
      numVertexes = maxVertexes;
    }
    const bufferTextureWidth = maxTextureSize as number;
    const bufferTextureHeight =
      Math.floor((numVertexes - 1) / maxTextureSize) + 1;

    const splatObject = new GaussianSplatObject(
      bufferTextureWidth,
      bufferTextureHeight,
      url
    );

    this._scene?.add(splatObject.mesh);

    // Wait until texture is ready

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const centerAndScaleTextureProperties = this._renderer!.properties.get(
        splatObject.centerAndScaleTexture
      );
      const covAndColorTextureProperties = this._renderer!.properties.get(
        splatObject.covAndColorTexture
      );
      if (
        centerAndScaleTextureProperties &&
        centerAndScaleTextureProperties.__webglTexture &&
        covAndColorTextureProperties &&
        centerAndScaleTextureProperties.__webglTexture
      ) {
        this._scene?.remove(splatObject.mesh);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    splatObject.sortReady = true;

    return splatObject;
  };
}

function processPlyBuffer(inputBuffer: ArrayBufferLike) {
  const ubuf = new Uint8Array(inputBuffer);
  console.log("[PLY] Processing Ply Buffer");
  // 10KB ought to be enough for a header...
  const header = new TextDecoder().decode(ubuf.slice(0, 1024 * 10));
  const header_end = "end_header\n";
  const header_end_index = header.indexOf(header_end);
  if (header_end_index < 0) throw new Error("Unable to read .ply file header");

  const vertexCount = parseInt(/element vertex (\d+)\n/.exec(header)![1]);
  console.log("[PLY] Vertex Count", vertexCount);
  let row_offset = 0;
  const offsets = {} as Record<string, number>,
    types = {} as Record<string, string>;
  const TYPE_MAP = {
    double: "getFloat64",
    int: "getInt32",
    uint: "getUint32",
    float: "getFloat32",
    short: "getInt16",
    ushort: "getUint16",
    uchar: "getUint8",
  } as const;
  for (const prop of header
    .slice(0, header_end_index)
    .split("\n")
    .filter((k) => k.startsWith("property "))) {
    const [p, type, name] = prop.split(" ");
    const arrayType = TYPE_MAP[type as keyof typeof TYPE_MAP] || "getInt8";
    types[name] = arrayType;
    offsets[name] = row_offset;
    row_offset += parseInt(arrayType.replace(/[^\d]/g, "")) / 8;
  }
  console.log("[PLY] Bytes per row", row_offset, types, offsets);

  const dataView = new DataView(
    inputBuffer,
    header_end_index + header_end.length
  );
  let row = 0;
  const attrs = new Proxy<{
    [key: string]: number;
  }>(
    {},
    {
      get(target, prop: string) {
        if (!types[prop]) throw new Error(prop.toString() + " not found");
        // @ts-ignore
        return dataView[types[prop]](row * row_offset + offsets[prop], true);
      },
    }
  );

  console.time("[PLY] calculate importance");
  const sizeList = new Float32Array(vertexCount);
  const sizeIndex = new Uint32Array(vertexCount);
  for (row = 0; row < vertexCount; row++) {
    sizeIndex[row] = row;
    if (!types["scale_0"]) continue;
    const size =
      Math.exp(attrs.scale_0) *
      Math.exp(attrs.scale_1) *
      Math.exp(attrs.scale_2);
    const opacity = 1 / (1 + Math.exp(-attrs.opacity));
    sizeList[row] = size * opacity;
  }
  console.timeEnd("[PLY] calculate importance");

  console.time("[PLY] sort");
  sizeIndex.sort((b, a) => sizeList[a] - sizeList[b]);
  console.timeEnd("[PLY] sort");

  // 6*4 + 4 + 4 = 8*4
  // XYZ - Position (Float32)
  // XYZ - Scale (Float32)
  // RGBA - colors (uint8)
  // IJKL - quaternion/rot (uint8)
  const rowLength = 3 * 4 + 3 * 4 + 4 + 4;
  const buffer = new ArrayBuffer(rowLength * vertexCount);

  console.time("[PLY] build buffer");
  for (let j = 0; j < vertexCount; j++) {
    row = sizeIndex[j];

    const position = new Float32Array(buffer, j * rowLength, 3);
    const scales = new Float32Array(buffer, j * rowLength + 4 * 3, 3);
    const rgba = new Uint8ClampedArray(
      buffer,
      j * rowLength + 4 * 3 + 4 * 3,
      4
    );
    const rot = new Uint8ClampedArray(
      buffer,
      j * rowLength + 4 * 3 + 4 * 3 + 4,
      4
    );

    if (types["scale_0"]) {
      const qlen = Math.sqrt(
        attrs.rot_0 ** 2 +
          attrs.rot_1 ** 2 +
          attrs.rot_2 ** 2 +
          attrs.rot_3 ** 2
      );

      rot[0] = (attrs.rot_0 / qlen) * 128 + 128;
      rot[1] = (attrs.rot_1 / qlen) * 128 + 128;
      rot[2] = (attrs.rot_2 / qlen) * 128 + 128;
      rot[3] = (attrs.rot_3 / qlen) * 128 + 128;

      scales[0] = Math.exp(attrs.scale_0);
      scales[1] = Math.exp(attrs.scale_1);
      scales[2] = Math.exp(attrs.scale_2);
    } else {
      scales[0] = 0.01;
      scales[1] = 0.01;
      scales[2] = 0.01;

      rot[0] = 255;
      rot[1] = 0;
      rot[2] = 0;
      rot[3] = 0;
    }

    position[0] = attrs.x;
    position[1] = attrs.y;
    position[2] = attrs.z;

    if (types["f_dc_0"]) {
      const SH_C0 = 0.28209479177387814;
      rgba[0] = (0.5 + SH_C0 * attrs.f_dc_0) * 255;
      rgba[1] = (0.5 + SH_C0 * attrs.f_dc_1) * 255;
      rgba[2] = (0.5 + SH_C0 * attrs.f_dc_2) * 255;
    } else {
      rgba[0] = attrs.red;
      rgba[1] = attrs.green;
      rgba[2] = attrs.blue;
    }
    if (types["opacity"]) {
      rgba[3] = (1 / (1 + Math.exp(-attrs.opacity))) * 255;
    } else {
      rgba[3] = 255;
    }
  }
  console.timeEnd("[PLY] build buffer");
  return buffer;
}

export { GaussianSplatLoader };
