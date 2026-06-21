let occtPromise = null;

function getOcct() {
  if (!occtPromise) {
    importScripts("/occt/occt-import-js.js");
    const factory = self.occtimportjs || occtimportjs;
    occtPromise = factory({
      locateFile: (path) => `/occt/${path}`,
      print: () => undefined,
      printErr: () => undefined,
    });
  }
  return occtPromise;
}

function getArrayValue(values, index) {
  if (!values || values.length === 0) {
    return 0;
  }
  if (Array.isArray(values[0])) {
    return values[index] ?? 0;
  }
  return values[index] ?? 0;
}

function getTriangleCount(indexArray) {
  if (!indexArray || indexArray.length === 0) {
    return 0;
  }
  if (Array.isArray(indexArray[0])) {
    return indexArray.length;
  }
  return Math.floor(indexArray.length / 3);
}

function getTriangleIndices(indexArray, triangleIndex) {
  if (Array.isArray(indexArray[0])) {
    const triangle = indexArray[triangleIndex];
    return [triangle[0], triangle[1], triangle[2]];
  }
  const offset = triangleIndex * 3;
  return [indexArray[offset], indexArray[offset + 1], indexArray[offset + 2]];
}

function getPosition(positionArray, vertexIndex) {
  if (Array.isArray(positionArray[0])) {
    const value = positionArray[vertexIndex] ?? [0, 0, 0];
    return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0];
  }
  const offset = vertexIndex * 3;
  return [
    getArrayValue(positionArray, offset),
    getArrayValue(positionArray, offset + 1),
    getArrayValue(positionArray, offset + 2),
  ];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!Number.isFinite(length) || length === 0) {
    return [0, 0, 0];
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function writeVector(view, offset, vector) {
  view.setFloat32(offset, vector[0], true);
  view.setFloat32(offset + 4, vector[1], true);
  view.setFloat32(offset + 8, vector[2], true);
}

function writeHeader(view, name) {
  const header = `Binary STL generated from ${name}`.slice(0, 80);
  for (let index = 0; index < header.length; index += 1) {
    view.setUint8(index, header.charCodeAt(index) & 0xff);
  }
}

function collectStats(result, stlBytes) {
  let triangles = 0;
  let vertices = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (const mesh of result.meshes ?? []) {
    const positionArray = mesh.attributes?.position?.array ?? [];
    const indexArray = mesh.index?.array ?? [];
    const vertexCount = Array.isArray(positionArray[0])
      ? positionArray.length
      : Math.floor(positionArray.length / 3);

    vertices += vertexCount;
    triangles += getTriangleCount(indexArray);

    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
      const vertex = getPosition(positionArray, vertexIndex);
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], vertex[axis]);
        max[axis] = Math.max(max[axis], vertex[axis]);
      }
    }
  }

  return {
    triangles,
    meshes: result.meshes?.length ?? 0,
    vertices,
    bounds: Number.isFinite(min[0]) ? { min, max } : null,
    stlBytes,
  };
}

function buildBinaryStl(result, name) {
  let triangleCount = 0;
  for (const mesh of result.meshes ?? []) {
    triangleCount += getTriangleCount(mesh.index?.array ?? []);
  }

  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(buffer);
  writeHeader(view, name);
  view.setUint32(80, triangleCount, true);

  let offset = 84;
  for (const mesh of result.meshes ?? []) {
    const positionArray = mesh.attributes?.position?.array ?? [];
    const indexArray = mesh.index?.array ?? [];
    const count = getTriangleCount(indexArray);

    for (let triangleIndex = 0; triangleIndex < count; triangleIndex += 1) {
      const indices = getTriangleIndices(indexArray, triangleIndex);
      const a = getPosition(positionArray, indices[0]);
      const b = getPosition(positionArray, indices[1]);
      const c = getPosition(positionArray, indices[2]);
      const normal = normalize(cross(subtract(b, a), subtract(c, a)));

      writeVector(view, offset, normal);
      writeVector(view, offset + 12, a);
      writeVector(view, offset + 24, b);
      writeVector(view, offset + 36, c);
      view.setUint16(offset + 48, 0, true);
      offset += 50;
    }
  }

  return buffer;
}

self.onmessage = async (event) => {
  const { id, name, buffer, params } = event.data;

  try {
    const occt = await getOcct();
    const result = occt.ReadStepFile(new Uint8Array(buffer), params);

    if (!result?.success) {
      throw new Error(result?.error || result?.message || "STEP 文件无法解析");
    }

    const stl = buildBinaryStl(result, name);
    const stats = collectStats(result, stl.byteLength);
    self.postMessage({ id, ok: true, stl, stats }, [stl]);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "转换失败",
    });
  }
};
