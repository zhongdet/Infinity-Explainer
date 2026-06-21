import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow, NodeResizer, Handle, Position } from "@xyflow/react";
import type { ExplainerNodeData } from "../core/types";
import { Tokenizer } from "../core/Tokenizer";
import { getClickableTerms } from "../core/types";
import { termRegistry, llmService } from "../core/services";

/* ── Helpers ──────────────────────────────────── */

function genId(): string {
  return crypto.randomUUID();
}

/* ============================================================
   SectorSearch — 碰撞避讓演算法
   ============================================================ */

function boundsCollide(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
  extraPadding = 0,
) {
  const PADDING = 40 + extraPadding;
  return !(
    a.maxX + PADDING < b.minX ||
    a.minX - PADDING > b.maxX ||
    a.maxY + PADDING < b.minY ||
    a.minY - PADDING > b.maxY
  );
}

function findPosition(
  centerX: number,
  centerY: number,
  baseAngle: number,
  checkCollision: (cx: number, cy: number) => boolean,
  initialRadius = 0,
  sourceBounds?: { minX: number; minY: number; maxX: number; maxY: number },
): { x: number; y: number } | null {
  let radius = initialRadius || 140;
  let searchStep = 0;
  const maxAttempts = 1000;
  const sweepRange = Math.PI * 0.8;
  const radiusStep = 4;
  const angleSpeed = 0.15;

  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    const angleOffset = Math.sin(searchStep * 2) * (sweepRange / 2);
    const currentAngle = baseAngle + angleOffset;

    for (let r = radius; r < radius + 500; r += radiusStep) {
      const cx = centerX + Math.cos(currentAngle) * r;
      const cy = centerY + Math.sin(currentAngle) * r;

      if (sourceBounds) {
        const testBounds = {
          minX: cx - 180,
          minY: cy - 120,
          maxX: cx + 180,
          maxY: cy + 120,
        };
        if (boundsCollide(testBounds, sourceBounds, 0)) continue;
      }

      if (!checkCollision(cx, cy)) {
        return { x: cx, y: cy };
      }
    }

    radius += radiusStep;
    searchStep += angleSpeed;
  }
  return null;
}

/* ============================================================
   RichTextRenderer
   ============================================================ */

function RichTextRenderer({
  segments,
  clickableTerms,
  onTermClick,
}: {
  segments: { text: string; isTerm: boolean; isUserTerm: boolean }[];
  clickableTerms: Set<string>;
  onTermClick: (term: string, e: React.PointerEvent) => void;
}) {
  return (
    <div style={{ whiteSpace: "pre-wrap" }}>
      {segments.map((seg, i) => {
        const isClickable = seg.isTerm || seg.isUserTerm;
        const isMatched = isClickable && clickableTerms.has(seg.text);
        if (isClickable) {
          return (
            <span
              key={i}
              data-term={seg.text}
              style={{
                color: isMatched ? "#2563eb" : "#6b7280",
                backgroundColor: isMatched ? "#eff6ff" : "#f3f4f6",
                padding: "2px 4px",
                borderRadius: 4,
                cursor: isMatched ? "pointer" : "default",
                fontWeight: 600,
                pointerEvents: "all",
                userSelect: "text",
              }}
              onPointerDown={(e) => {
                if (isMatched) onTermClick(seg.text, e);
                e.stopPropagation();
              }}
            >
              {seg.text}
            </span>
          );
        }
        return (
          <span
            key={i}
            style={{ userSelect: "text", pointerEvents: "all" }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {seg.text}
          </span>
        );
      })}
    </div>
  );
}

/* ============================================================
   STATUS_STYLES
   ============================================================ */

const STATUS_STYLES: Record<
  string,
  { borderColor: string; backgroundColor: string }
> = {
  idle: { borderColor: "#e5e7eb", backgroundColor: "#ffffff" },
  loading: { borderColor: "#3b82f6", backgroundColor: "#f0f7ff" },
  error: { borderColor: "#ef4444", backgroundColor: "#fef2f2" },
};

/* ============================================================
   ExplainerNode Component
   ============================================================ */

function ExplainerNode({
  id,
  data,
  selected = false,
  width,
  height,
}: {
  id: string;
  data: ExplainerNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
}) {
  const reactFlow = useReactFlow();
  const tokenizerRef = useRef(new Tokenizer());
  const [loadingTerm, setLoadingTerm] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isLoadingRef = useRef(false);

  // sync ref with state for guard reads in stale closures
  useEffect(() => {
    isLoadingRef.current = !!loadingTerm;
  }, [loadingTerm]);

  // Stale loading reset: after reload, 'loading' nodes revert to 'idle'
  useEffect(() => {
    if (data.status === "loading") {
      reactFlow.setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, status: "idle" } } : n,
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // 目前節點的所有可點擊詞彙
  const allTerms = useMemo(
    () => getClickableTerms(data),
    [data.terms, data.userTerms],
  );
  const clickableTermSet = useMemo<Set<string>>(
    () => new Set(allTerms),
    [allTerms],
  );

  // Tokenize 文字
  const segments = useMemo(
    () => tokenizerRef.current.tokenize(data.text, allTerms),
    [data.text, allTerms],
  );

  // 向 TermRegistry 註冊/清除此節點的詞彙
  useEffect(() => {
    termRegistry.registerAll(allTerms, id);
    return () => {
      termRegistry.deregisterShape(id);
    };
  }, [id, allTerms, termRegistry]);

  /* ---- Edit Mode: 雙擊進入文字編輯 ---- */
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditText(data.text);
      setEditing(true);
    },
    [data.text],
  );

  const handleSaveEdit = useCallback(() => {
    if (editText !== data.text) {
      reactFlow.setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, text: editText } } : n,
        ),
      );
    }
    setEditing(false);
  }, [reactFlow, id, editText, data.text]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setEditText("");
  }, []);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleCancelEdit();
      }
      e.stopPropagation();
    },
    [handleCancelEdit],
  );

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editing]);

  /* ---- Flow A: 點擊名詞 → 立即建立節點 + 連接線 + 串流 LLM ---- */
  const handleTermClick = useCallback(
    async (term: string, e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (isLoadingRef.current) return;

      const currentNodes = reactFlow.getNodes();
      const sourceNode = currentNodes.find((n) => n.id === id);
      if (!sourceNode) return;

      const srcData = sourceNode.data as unknown as ExplainerNodeData;
      // Use actual DOM dimensions from the ref for accurate collision & anchor
      const sourceW = containerRef.current?.offsetWidth ?? srcData.w ?? 360;
      const sourceH = containerRef.current?.offsetHeight ?? srcData.h ?? 240;
      const srcPos = sourceNode.position;
      const srcBounds = {
        minX: srcPos.x,
        minY: srcPos.y,
        maxX: srcPos.x + sourceW,
        maxY: srcPos.y + sourceH,
      };

      const centerX = (srcBounds.minX + srcBounds.maxX) / 2;
      const centerY = (srcBounds.minY + srcBounds.maxY) / 2;

      // 將螢幕座標轉換為 flow 座標
      const flowPos = reactFlow.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      const baseAngle = Math.atan2(flowPos.y - centerY, flowPos.x - centerX);

      // SectorSearch
      const W = 360,
        H = 240;

      const checkCollision = (cx: number, cy: number) => {
        const testBounds = {
          minX: cx - W / 2,
          minY: cy - H / 2,
          maxX: cx + W / 2,
          maxY: cy + H / 2,
        };
        for (const n of reactFlow.getNodes()) {
          if (n.type === "explainer" && n.id !== id) {
            // Use React Flow's measured dimensions (set after render)
            const nW = n.width ?? n.measured?.width ?? 360;
            const nH = n.height ?? n.measured?.height ?? 240;
            const b = {
              minX: n.position.x,
              minY: n.position.y,
              maxX: n.position.x + nW,
              maxY: n.position.y + nH,
            };
            if (boundsCollide(testBounds, b)) return true;
          }
        }
        return false;
      };

      const initialRadius = Math.max(sourceW, sourceH) / 2 + 50;
      const pos = findPosition(
        centerX,
        centerY,
        baseAngle,
        checkCollision,
        initialRadius,
        srcBounds,
      );

      const newX = pos ? pos.x - W / 2 : centerX + 150;
      const newY = pos ? pos.y - H / 2 : centerY + 100;

      // 建立新節點
      const newId = genId();
      const header = `【${term}】\n\n`;

      // 計算錨點位置 (相對於來源節點的比例)
      const anchorX = sourceW > 0 ? (flowPos.x - srcPos.x) / sourceW : 0.5;
      const anchorY = sourceH > 0 ? (flowPos.y - srcPos.y) / sourceH : 0.5;

      const edgeId = genId();

      reactFlow.setNodes((nds) => [
        ...nds,
        {
          id: newId,
          type: "explainer",
          position: { x: newX, y: newY },
          width: W,
          height: H,
          data: {
            text: header,
            terms: [] as string[],
            userTerms: [] as string[],
            status: "loading",
            errorMessage: "",
            w: W,
            h: H,
          },
        },
      ]);

      reactFlow.setEdges((eds) => [
        ...eds,
        {
          id: edgeId,
          source: id,
          target: newId,
          sourceHandle: "s",
          targetHandle: "t",
          type: "animatedEdge",
          data: {
            startAnchorX: anchorX,
            startAnchorY: anchorY,
            endAnchorX: 0.5,
            endAnchorY: 0.5,
          },
        } as any,
      ]);

      // Stream LLM response
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setLoadingTerm(term);

      const targetId = newId;

      try {
        const result = await llmService.explainStream(
          term,
          (fullText) => {
            if (abort.signal.aborted) return;
            reactFlow.setNodes((nds) =>
              nds.map((n) =>
                n.id === targetId
                  ? { ...n, data: { ...n.data, text: header + fullText } }
                  : n,
              ),
            );
          },
          abort.signal,
        );
        if (abort.signal.aborted) return;

        reactFlow.setNodes((nds) =>
          nds.map((n) =>
            n.id === targetId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    text: header + result.explanation,
                    terms: result.technical_terms,
                    status: "idle",
                  },
                }
              : n,
          ),
        );
      } catch (err: unknown) {
        if (abort.signal.aborted) return;
        console.error("LLM explain error:", err);
        reactFlow.setNodes((nds) =>
          nds.map((n) =>
            n.id === targetId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    status: "error",
                    errorMessage:
                      err instanceof Error ? err.message : String(err),
                  },
                }
              : n,
          ),
        );
      } finally {
        if (!abort.signal.aborted) {
          setLoadingTerm(null);
        }
      }
    },
    [id, data.w, data.h, reactFlow],
  );

  /* ---- Error Retry ---- */
  const handleRetry = useCallback(async () => {
    const match = data.text.match(/^【(.+?)】/);
    if (!match) return;
    const term = match[1];
    const header = `【${term}】\n\n`;

    reactFlow.setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, status: "loading", errorMessage: "" } }
          : n,
      ),
    );

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const result = await llmService.explainStream(
        term,
        (fullText) => {
          if (abort.signal.aborted) return;
          reactFlow.setNodes((nds) =>
            nds.map((n) =>
              n.id === id
                ? { ...n, data: { ...n.data, text: header + fullText } }
                : n,
            ),
          );
        },
        abort.signal,
      );
      if (abort.signal.aborted) return;

      reactFlow.setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  text: header + result.explanation,
                  status: "idle",
                  terms: result.technical_terms,
                },
              }
            : n,
        ),
      );
    } catch (err: unknown) {
      if (abort.signal.aborted) return;
      console.error("LLM retry error:", err);
      reactFlow.setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: "error",
                  errorMessage:
                    err instanceof Error ? err.message : String(err),
                },
              }
            : n,
        ),
      );
    }
  }, [id, data.text, reactFlow]);

  /* ---- Wheel event: content scroll wins over zoom ---- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 1;
      const scrollingDown = e.deltaY > 0;
      const scrollingUp = e.deltaY < 0;

      if ((scrollingDown && !atBottom) || (scrollingUp && !atTop)) {
        e.stopPropagation();
      }
    };

    el.addEventListener("wheel", handler, { capture: true });
    return () =>
      el.removeEventListener("wheel", handler, {
        capture: true,
      } as EventListenerOptions);
  }, []);

  /* ---- Render ---- */
  const isError = data.status === "error";
  const isLoading = data.status === "loading";
  const theme = STATUS_STYLES[data.status] ?? STATUS_STYLES.idle;

  return (
    <div
       ref={containerRef}
       data-node-id={id}
       className="animate-pop"
       style={{
         border: `2px solid ${theme.borderColor}`,
         backgroundColor: theme.backgroundColor,
         padding: 24,
         boxShadow:
           "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
         borderRadius: 12,
         overflow: "visible",
         fontSize: 16,
         lineHeight: 1.6,
         fontFamily: "system-ui, sans-serif",
         color: "#1f2937",
         minWidth: 200,
         minHeight: 100,
         pointerEvents: "all",
         boxSizing: "border-box",
         position: "relative",
         width: width,
         height: height,
       }}
       onPointerDown={(e) => e.stopPropagation()}
     >
      <NodeResizer minWidth={200} minHeight={100} isVisible={selected} />
      {/* Invisible handles — required by React Flow for edge validation */}
      <Handle
        type="source"
        id="s"
        position={Position.Right}
        style={{ opacity: 0, pointerEvents: "none" }}
      />
      <Handle
        type="target"
        id="t"
        position={Position.Left}
        style={{ opacity: 0, pointerEvents: "none" }}
      />

      <div
        data-node-root={id}
        onDoubleClick={handleDoubleClick}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "auto",
          margin: "5px",
        }}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={handleEditKeyDown}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              outline: "none",
              resize: "none",
              fontFamily: "system-ui, sans-serif",
              fontSize: 16,
              lineHeight: 1.6,
              color: "#1f2937",
              backgroundColor: "transparent",
              padding: 0,
              margin: 0,
              boxSizing: "border-box",
              whiteSpace: "pre-wrap",
              overflow: "auto",
            }}
          />
        ) : (
          <>
            {isLoading && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: "#e5e7eb",
                  borderRadius: "12px 12px 0 0",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: "30%",
                    height: "100%",
                    background:
                      "linear-gradient(90deg, #3b82f6, #60a5fa, #3b82f6)",
                    backgroundSize: "200% 100%",
                    animation: "ie-shimmer 1.5s ease-in-out infinite",
                    borderRadius: "0 0 12px 12px",
                  }}
                />
              </div>
            )}

            {isError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 10px",
                  marginBottom: 10,
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 6,
                  fontSize: 13,
                  color: "#dc2626",
                }}
              >
                <span>⚠️</span>
                <span style={{ flex: 1 }}>{data.errorMessage}</span>
                <button
                  onClick={handleRetry}
                  style={{
                    padding: "2px 10px",
                    borderRadius: 4,
                    border: "1px solid #fca5a5",
                    background: "#fff",
                    color: "#dc2626",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  重試
                </button>
              </div>
            )}

            {isLoading &&
            data.text.trim() ===
              `【${data.text.match(/^【(.+?)】/)?.[1] ?? ""}】` ? (
              <div style={{ color: "#93c5fd", fontStyle: "italic" }}>
                等待解釋生成…
              </div>
            ) : null}

            <RichTextRenderer
              segments={segments}
              clickableTerms={clickableTermSet}
              onTermClick={handleTermClick}
            />
          </>
        )}
      </div>

      <style>{`
        @keyframes ie-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}

export default memo(ExplainerNode);
