"use client";

import {
  AlertTriangle,
  Archive,
  Box,
  CheckCircle2,
  Download,
  FileBox,
  LoaderCircle,
  PauseCircle,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DragEvent } from "react";

type Status = "queued" | "converting" | "done" | "error";

type Bounds = {
  min: [number, number, number];
  max: [number, number, number];
};

type ConversionStats = {
  triangles: number;
  meshes: number;
  vertices: number;
  bounds: Bounds | null;
  stlBytes: number;
};

type QueueItem = {
  id: string;
  file: File;
  name: string;
  outputName: string;
  size: number;
  status: Status;
  durationMs?: number;
  stats?: ConversionStats;
  stl?: ArrayBuffer;
  error?: string;
};

type WorkerSuccess = {
  id: string;
  ok: true;
  stats: ConversionStats;
  stl: ArrayBuffer;
};

type WorkerFailure = {
  id: string;
  ok: false;
  error: string;
};

type WorkerResult = WorkerSuccess | WorkerFailure;

const units = [
  { label: "毫米", value: "millimeter" },
  { label: "厘米", value: "centimeter" },
  { label: "米", value: "meter" },
  { label: "英寸", value: "inch" },
  { label: "英尺", value: "foot" },
] as const;

const statusCopy: Record<Status, string> = {
  queued: "等待",
  converting: "转换中",
  done: "完成",
  error: "失败",
};

function isStepFile(file: File) {
  return /\.(stp|step)$/i.test(file.name);
}

function baseName(fileName: string) {
  return fileName.replace(/\.(stp|step)$/i, "").replace(/[^\w.-]+/g, "_");
}

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(ms?: number) {
  if (ms === undefined) {
    return "";
  }
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  return `${(ms / 1000).toFixed(1)} s`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="border-l border-zinc-200 pl-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-950">{value}</div>
    </div>
  );
}

function MeshPreview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    let frame = 0;
    let raf = 0;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);

      const cx = rect.width / 2;
      const cy = rect.height / 2 + 8;
      const pulse = Math.sin(frame / 45) * 7;
      const points = [
        [cx - 82, cy - 34 + pulse],
        [cx - 12, cy - 86],
        [cx + 88, cy - 38 - pulse],
        [cx + 54, cy + 60],
        [cx - 48, cy + 78],
        [cx - 96, cy + 24],
        [cx + 4, cy + 2],
      ];
      const faces = [
        [0, 1, 6, "#1f9d8a"],
        [1, 2, 6, "#3aa8ff"],
        [2, 3, 6, "#f5a524"],
        [3, 4, 6, "#2bb673"],
        [4, 5, 6, "#ef6f6c"],
        [5, 0, 6, "#7c8a99"],
      ];

      context.lineWidth = 1;
      faces.forEach(([a, b, c, color]) => {
        const first = points[a as number];
        const second = points[b as number];
        const third = points[c as number];
        context.beginPath();
        context.moveTo(first[0], first[1]);
        context.lineTo(second[0], second[1]);
        context.lineTo(third[0], third[1]);
        context.closePath();
        context.fillStyle = `${color}26`;
        context.fill();
        context.strokeStyle = `${color}`;
        context.stroke();
      });

      context.fillStyle = "#18181b";
      points.forEach(([x, y]) => {
        context.beginPath();
        context.arc(x, y, 3, 0, Math.PI * 2);
        context.fill();
      });

      frame += 1;
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-52 w-full rounded-lg border border-zinc-200 bg-white"
      aria-label="三角网格预览"
    />
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "done") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }
  if (status === "error") {
    return <AlertTriangle className="h-4 w-4 text-red-600" />;
  }
  if (status === "converting") {
    return <LoaderCircle className="h-4 w-4 animate-spin text-teal-700" />;
  }
  return <FileBox className="h-4 w-4 text-zinc-500" />;
}

export default function StepConverter() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [dropError, setDropError] = useState("");
  const [unit, setUnit] =
    useState<(typeof units)[number]["value"]>("millimeter");
  const [linearDeflection, setLinearDeflection] = useState(0.003);
  const [angularDeflection, setAngularDeflection] = useState(0.35);
  const workerRef = useRef<Worker | null>(null);
  const itemsRef = useRef<QueueItem[]>(items);
  const cancelRef = useRef(false);
  const activeRejectRef = useRef<((error: Error) => void) | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      activeRejectRef.current?.(new Error("页面已关闭"));
    };
  }, []);

  const summary = useMemo(() => {
    const done = items.filter((item) => item.status === "done");
    const errors = items.filter((item) => item.status === "error").length;
    const triangles = done.reduce(
      (sum, item) => sum + (item.stats?.triangles ?? 0),
      0,
    );
    const stlBytes = done.reduce(
      (sum, item) => sum + (item.stats?.stlBytes ?? 0),
      0,
    );
    return {
      total: items.length,
      done: done.length,
      errors,
      triangles,
      stlBytes,
    };
  }, [items]);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker("/converter-worker.js");
    }
    return workerRef.current;
  }, []);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const valid = incoming.filter(isStepFile);
    const invalidCount = incoming.length - valid.length;

    if (invalidCount > 0) {
      setDropError(`已跳过 ${invalidCount} 个非 STEP/STP 文件`);
    } else {
      setDropError("");
    }

    if (valid.length === 0) {
      return;
    }

    setItems((current) => [
      ...current,
      ...valid.map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        outputName: `${baseName(file.name)}.stl`,
        size: file.size,
        status: "queued" as const,
      })),
    ]);
  }, []);

  const convertInWorker = useCallback(
    (item: QueueItem, buffer: ArrayBuffer) =>
      new Promise<WorkerSuccess>((resolve, reject) => {
        const worker = getWorker();

        const handleMessage = (event: MessageEvent<WorkerResult>) => {
          if (event.data.id !== item.id) {
            return;
          }

          worker.removeEventListener("message", handleMessage);
          worker.removeEventListener("error", handleError);
          activeRejectRef.current = null;

          if (event.data.ok) {
            resolve(event.data);
          } else {
            reject(new Error(event.data.error));
          }
        };

        const handleError = (event: ErrorEvent) => {
          worker.removeEventListener("message", handleMessage);
          worker.removeEventListener("error", handleError);
          activeRejectRef.current = null;
          reject(new Error(event.message || "Worker 转换失败"));
        };

        activeRejectRef.current = reject;
        worker.addEventListener("message", handleMessage);
        worker.addEventListener("error", handleError);
        worker.postMessage(
          {
            id: item.id,
            name: item.name,
            buffer,
            params: {
              linearUnit: unit,
              linearDeflectionType: "bounding_box_ratio",
              linearDeflection,
              angularDeflection,
            },
          },
          [buffer],
        );
      }),
    [angularDeflection, getWorker, linearDeflection, unit],
  );

  const convertAll = useCallback(async () => {
    if (isConverting) {
      return;
    }

    cancelRef.current = false;
    setIsConverting(true);
    const queueIds = itemsRef.current
      .filter((item) => item.status === "queued" || item.status === "error")
      .map((item) => item.id);

    for (const id of queueIds) {
      if (cancelRef.current) {
        break;
      }

      const item = itemsRef.current.find((entry) => entry.id === id);
      if (!item) {
        continue;
      }

      const startedAt = performance.now();
      setItems((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                status: "converting",
                error: undefined,
                durationMs: undefined,
              }
            : entry,
        ),
      );

      try {
        const buffer = await item.file.arrayBuffer();
        const result = await convertInWorker(item, buffer);
        setItems((current) =>
          current.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  status: "done",
                  stl: result.stl,
                  stats: result.stats,
                  durationMs: performance.now() - startedAt,
                }
              : entry,
          ),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "无法完成转换";
        if (cancelRef.current) {
          setItems((current) =>
            current.map((entry) =>
              entry.id === id
                ? {
                    ...entry,
                    status: "queued",
                    durationMs: undefined,
                  }
                : entry,
            ),
          );
          break;
        }

        setItems((current) =>
          current.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  status: "error",
                  error: message,
                  durationMs: performance.now() - startedAt,
                }
              : entry,
          ),
        );
      }
    }

    activeRejectRef.current = null;
    setIsConverting(false);
  }, [convertInWorker, isConverting]);

  const cancelConversion = useCallback(() => {
    cancelRef.current = true;
    workerRef.current?.terminate();
    workerRef.current = null;
    activeRejectRef.current?.(new Error("已停止转换"));
    activeRejectRef.current = null;
    setIsConverting(false);
    setItems((current) =>
      current.map((item) =>
        item.status === "converting" ? { ...item, status: "queued" } : item,
      ),
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const retryItem = useCallback((id: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "queued",
              error: undefined,
              stl: undefined,
              stats: undefined,
              durationMs: undefined,
            }
          : item,
      ),
    );
  }, []);

  const clearItems = useCallback(() => {
    if (isConverting) {
      cancelConversion();
    }
    setItems([]);
    setDropError("");
  }, [cancelConversion, isConverting]);

  const downloadItem = useCallback((item: QueueItem) => {
    if (!item.stl) {
      return;
    }
    downloadBlob(new Blob([item.stl], { type: "model/stl" }), item.outputName);
  }, []);

  const downloadZip = useCallback(async () => {
    const done = itemsRef.current.filter(
      (item) => item.status === "done" && item.stl,
    );
    if (done.length === 0) {
      return;
    }

    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    done.forEach((item) => {
      if (item.stl) {
        zip.file(item.outputName, item.stl);
      }
    });
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, "step-to-stl-batch.zip");
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      setIsDragging(false);
      addFiles(event.dataTransfer.files);
    },
    [addFiles],
  );

  return (
    <main className="min-h-screen bg-[#f7f5f0] text-zinc-950">
      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto grid min-h-screen max-w-7xl gap-8 px-4 py-5 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
          <div className="flex min-h-0 flex-col gap-5">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-teal-700">
                  <Box className="h-4 w-4" />
                  STEP / STP 批量转 STL
                </div>
                <h1 className="mt-2 text-3xl font-semibold text-zinc-950">
                  本地批量转换 CAD 文件
                </h1>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <ShieldCheck className="h-4 w-4" />
                文件在浏览器本地处理
              </div>
            </header>

            <label
              className={`flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-5 py-8 text-center transition ${
                isDragging
                  ? "border-teal-600 bg-teal-50"
                  : "border-zinc-300 bg-zinc-50 hover:border-teal-500 hover:bg-white"
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input
                className="sr-only"
                type="file"
                accept=".stp,.step"
                multiple
                onChange={(event) => {
                  if (event.target.files) {
                    addFiles(event.target.files);
                  }
                  event.currentTarget.value = "";
                }}
              />
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-teal-700 text-white">
                <Upload className="h-6 w-6" />
              </span>
              <span className="mt-4 text-lg font-semibold">
                拖入 .stp 或 .step 文件
              </span>
              <span className="mt-2 text-sm text-zinc-600">
                支持多选，转换完成后可单独下载或打包下载
              </span>
              {dropError ? (
                <span className="mt-3 text-sm text-amber-700">{dropError}</span>
              ) : null}
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={items.length === 0 || isConverting}
                  onClick={convertAll}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  <Play className="h-4 w-4" />
                  开始转换
                </button>
                <button
                  type="button"
                  disabled={!isConverting}
                  onClick={cancelConversion}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
                >
                  <PauseCircle className="h-4 w-4" />
                  停止
                </button>
                <button
                  type="button"
                  disabled={summary.done === 0}
                  onClick={downloadZip}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
                >
                  <Archive className="h-4 w-4" />
                  打包下载
                </button>
              </div>
              <button
                type="button"
                disabled={items.length === 0}
                onClick={clearItems}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
              >
                <Trash2 className="h-4 w-4" />
                清空队列
              </button>
            </div>

            <section className="min-h-0 flex-1 rounded-lg border border-zinc-200 bg-white">
              <div className="grid grid-cols-2 gap-0 border-b border-zinc-200 p-4 sm:grid-cols-4">
                <Stat label="文件" value={summary.total} />
                <Stat label="完成" value={summary.done} />
                <Stat label="三角面" value={summary.triangles.toLocaleString()} />
                <Stat label="输出" value={formatBytes(summary.stlBytes)} />
              </div>

              <div className="max-h-[45vh] overflow-y-auto p-3">
                {items.length === 0 ? (
                  <div className="flex h-56 flex-col items-center justify-center text-center text-zinc-500">
                    <FileBox className="h-9 w-9" />
                    <p className="mt-3 text-sm">队列为空</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <StatusIcon status={item.status} />
                              <h2 className="truncate text-sm font-semibold text-zinc-950">
                                {item.name}
                              </h2>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                              <span>{formatBytes(item.size)}</span>
                              <span>{statusCopy[item.status]}</span>
                              {item.durationMs ? (
                                <span>{formatDuration(item.durationMs)}</span>
                              ) : null}
                              {item.stats ? (
                                <span>
                                  {item.stats.meshes} 网格,{" "}
                                  {item.stats.triangles.toLocaleString()} 三角面
                                </span>
                              ) : null}
                            </div>
                            {item.error ? (
                              <p className="mt-2 text-xs text-red-700">
                                {item.error}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            {item.status === "done" ? (
                              <button
                                type="button"
                                onClick={() => downloadItem(item)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-100"
                                title="下载 STL"
                              >
                                <Download className="h-4 w-4" />
                              </button>
                            ) : null}
                            {item.status === "error" ? (
                              <button
                                type="button"
                                onClick={() => retryItem(item.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-100"
                                title="重试"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={item.status === "converting"}
                              onClick={() => removeItem(item.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300"
                              title="移除"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-5">
            <section className="rounded-lg border border-zinc-200 bg-[#fbfaf6] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold">
                  <Settings2 className="h-4 w-4 text-teal-700" />
                  转换参数
                </div>
                <span className="text-xs text-zinc-500">OpenCascade WASM</span>
              </div>

              <div className="mt-5 space-y-5">
                <label className="block">
                  <span className="text-sm font-medium text-zinc-700">
                    输出单位
                  </span>
                  <select
                    value={unit}
                    onChange={(event) =>
                      setUnit(
                        event.target.value as (typeof units)[number]["value"],
                      )
                    }
                    disabled={isConverting}
                    className="mt-2 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-teal-600 disabled:bg-zinc-100"
                  >
                    {units.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="flex items-center justify-between text-sm font-medium text-zinc-700">
                    <span>线性偏差</span>
                    <span className="font-mono text-xs">
                      {linearDeflection.toFixed(3)}
                    </span>
                  </span>
                  <input
                    type="range"
                    min="0.001"
                    max="0.02"
                    step="0.001"
                    value={linearDeflection}
                    disabled={isConverting}
                    onChange={(event) =>
                      setLinearDeflection(Number(event.target.value))
                    }
                    className="mt-3 w-full accent-teal-700"
                  />
                </label>

                <label className="block">
                  <span className="flex items-center justify-between text-sm font-medium text-zinc-700">
                    <span>角度偏差</span>
                    <span className="font-mono text-xs">
                      {angularDeflection.toFixed(2)}
                    </span>
                  </span>
                  <input
                    type="range"
                    min="0.1"
                    max="0.7"
                    step="0.05"
                    value={angularDeflection}
                    disabled={isConverting}
                    onChange={(event) =>
                      setAngularDeflection(Number(event.target.value))
                    }
                    className="mt-3 w-full accent-amber-600"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold">网格预览</h2>
                  <p className="mt-1 text-sm text-zinc-600">
                    STEP 曲面会被三角化后写入二进制 STL
                  </p>
                </div>
                <FileBox className="h-5 w-5 text-zinc-500" />
              </div>
              <div className="mt-4">
                <MeshPreview />
              </div>
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-4">
              <h2 className="font-semibold">输出说明</h2>
              <div className="mt-4 space-y-3 text-sm text-zinc-700">
                <div className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-teal-700" />
                  <p>每个输入文件生成一个同名 `.stl` 文件。</p>
                </div>
                <div className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-amber-500" />
                  <p>偏差越低，网格越细，转换时间和文件体积越大。</p>
                </div>
                <div className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-600" />
                  <p>模型数据不上传服务器，下载由当前浏览器生成。</p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
