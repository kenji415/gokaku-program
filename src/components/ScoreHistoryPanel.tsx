"use client";

import type { StudentTestResultHistoryItem } from "@/lib/test-results";
import type { StudentTestResultInput } from "@/lib/test-result-types";
import { useMemo, useState } from "react";

const SCORE_SERIES = [
  { key: "fourSubjects", label: "四科", color: "#1e3a5f" },
  { key: "math", label: "算", color: "#16a34a" },
  { key: "japanese", label: "国", color: "#ca8a04" },
  { key: "science", label: "理", color: "#dc2626" },
  { key: "social", label: "社", color: "#2563eb" },
] as const;

type ScoreKey = (typeof SCORE_SERIES)[number]["key"];

const scoreHistoryScoreColHeadClass =
  "w-8 border border-gray-300 px-1 py-2 text-center";
const scoreHistoryScoreColCellClass =
  "w-8 border border-gray-300 px-1 py-1.5 text-center whitespace-nowrap";

function parseScore(value: string): number | null {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function scoreValue(result: StudentTestResultInput, key: ScoreKey): string {
  return result[key]?.trim() ?? "";
}

function formatHistoryDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    const [year, month] = trimmed.split("-");
    return `${year}/${Number(month)}`;
  }
  return trimmed.replace(/-/g, "/");
}

function truncateChartTestName(name: string, plottedCount: number): string {
  const trimmed = name.trim();
  const maxLength = plottedCount >= 5 ? 5 : plottedCount >= 3 ? 8 : 12;
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(1, maxLength - 1))}…`;
}

function ScoreLineChart({ items }: { items: StudentTestResultHistoryItem[] }) {
  const plotted = useMemo(
    () => [...items].sort((a, b) => a.sortRank - b.sortRank),
    [items],
  );

  const width = 520;
  const height = 300;
  const pad = { top: 24, right: 24, bottom: 56, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const xPlotInset = Math.min(28, plotW * 0.08);

  const plotStart = pad.left + xPlotInset;
  const plotEnd = pad.left + plotW - xPlotInset;

  const { lines, yMin, yMax, xLabels, xPositions } = useMemo(() => {
    const xForIndex = (index: number, count: number) => {
      if (count <= 1) return (plotStart + plotEnd) / 2;
      return plotStart + ((plotEnd - plotStart) / (count - 1)) * index;
    };

    const values: number[] = [];
    for (const item of plotted) {
      for (const series of SCORE_SERIES) {
        const value = parseScore(scoreValue(item.result, series.key));
        if (value != null) values.push(value);
      }
    }

    if (values.length === 0) {
      return {
        lines: [] as Array<{
          key: ScoreKey;
          label: string;
          color: string;
          points: Array<{ x: number; y: number }>;
        }>,
        yMin: 0,
        yMax: 80,
        xLabels: plotted.map((item) => formatHistoryDate(item.testDate)),
        xPositions: plotted.map((_, index) => xForIndex(index, plotted.length)),
      };
    }

    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const padding = Math.max(2, (rawMax - rawMin) * 0.1 || 2);
    const yMin = Math.floor(rawMin - padding);
    const yMax = Math.ceil(rawMax + padding);
    const yRange = Math.max(1, yMax - yMin);

    const lines = SCORE_SERIES.map((series) => {
      const points = plotted
        .map((item, index) => {
          const value = parseScore(scoreValue(item.result, series.key));
          if (value == null) return null;
          return {
            x: xForIndex(index, plotted.length),
            y: pad.top + plotH - ((value - yMin) / yRange) * plotH,
          };
        })
        .filter((point): point is { x: number; y: number } => point != null);

      return {
        key: series.key,
        label: series.label,
        color: series.color,
        points,
      };
    }).filter((line) => line.points.length > 0);

    return {
      lines,
      yMin,
      yMax,
      xLabels: plotted.map((item) => formatHistoryDate(item.testDate)),
      xPositions: plotted.map((_, index) => xForIndex(index, plotted.length)),
    };
  }, [plotted, plotH, pad.top, plotStart, plotEnd]);

  if (plotted.length === 0) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500">
        グラフに表示する模試にチェックを入れてください
      </div>
    );
  }

  const yTicks = [yMin, yMin + (yMax - yMin) / 2, yMax];

  return (
    <div className="rounded border border-gray-300 bg-white p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full max-w-full"
        role="img"
        aria-label="選択した模試の偏差値推移"
      >
        <line
          x1={pad.left}
          y1={pad.top + plotH}
          x2={pad.left + plotW}
          y2={pad.top + plotH}
          stroke="#333"
          strokeWidth="1"
        />
        <line
          x1={pad.left}
          y1={pad.top}
          x2={pad.left}
          y2={pad.top + plotH}
          stroke="#333"
          strokeWidth="1"
        />
        {yTicks.map((tick) => {
          const y = pad.top + plotH - ((tick - yMin) / Math.max(1, yMax - yMin)) * plotH;
          return (
            <g key={tick}>
              <line
                x1={pad.left}
                y1={y}
                x2={pad.left + plotW}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="#6b7280"
              >
                {tick}
              </text>
            </g>
          );
        })}
        {plotted.map((item, index) => {
          const xAxisY = pad.top + plotH;
          return (
            <g key={item.testScheduleId}>
              <text
                x={xPositions[index]}
                y={xAxisY + 12}
                textAnchor="middle"
                fontSize="9"
                fill="#4b5563"
              >
                {xLabels[index]}
              </text>
              <text
                x={xPositions[index]}
                y={xAxisY + 24}
                textAnchor="middle"
                fontSize="8"
                fill="#6b7280"
              >
                {truncateChartTestName(item.testName, plotted.length)}
              </text>
            </g>
          );
        })}
        {lines.map((line) => (
          <g key={line.key}>
            {line.points.length > 1 ? (
              <polyline
                fill="none"
                stroke={line.color}
                strokeWidth="2"
                points={line.points.map((point) => `${point.x},${point.y}`).join(" ")}
              />
            ) : null}
            {line.points.map((point, index) => (
              <circle
                key={`${line.key}-${index}`}
                cx={point.x}
                cy={point.y}
                r="3"
                fill={line.color}
              />
            ))}
          </g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-700">
        {lines.map((line) => (
          <span key={line.key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4"
              style={{ backgroundColor: line.color }}
              aria-hidden
            />
            {line.label}
          </span>
        ))}
      </div>
    </div>
  );
}

type Props = {
  items: StudentTestResultHistoryItem[];
  loading?: boolean;
  error?: string;
};

export function ScoreHistoryPanel({ items, loading, error }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleItem = (testScheduleId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(testScheduleId)) {
        next.delete(testScheduleId);
      } else {
        next.add(testScheduleId);
      }
      return next;
    });
  };

  const chartItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.testScheduleId)),
    [items, selectedIds],
  );

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-500">読み込み中…</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-2 py-2 lg:flex-row">
      <div className="min-w-0 flex-1 lg:max-w-[42%]">
        <ScoreLineChart items={chartItems} />
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto">
        {items.length === 0 ? (
          <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
            登録済みの成績がありません
          </div>
        ) : (
          <table className="w-full min-w-[700px] border-collapse text-xs">
            <thead>
              <tr className="bg-[#d9e8f5] text-gray-800">
                <th className="border border-gray-300 px-2 py-2 w-10" />
                <th className="w-16 border border-gray-300 px-1 py-2">日付</th>
                <th className="border border-gray-300 px-2 py-2">塾名</th>
                <th className="border border-gray-300 px-2 py-2">模試名</th>
                <th className={scoreHistoryScoreColHeadClass}>四科</th>
                <th className={scoreHistoryScoreColHeadClass}>算</th>
                <th className={scoreHistoryScoreColHeadClass}>国</th>
                <th className={scoreHistoryScoreColHeadClass}>理</th>
                <th className={scoreHistoryScoreColHeadClass}>社</th>
                <th className="border border-gray-300 px-2 py-2">備考</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.testScheduleId} className="bg-white">
                  <td className="border border-gray-300 px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.testScheduleId)}
                      onChange={() => toggleItem(item.testScheduleId)}
                      aria-label={`${item.displayText}をグラフに表示`}
                    />
                  </td>
                  <td className="w-16 border border-gray-300 px-1 py-1.5 whitespace-nowrap">
                    {formatHistoryDate(item.testDate)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5">
                    {item.cramSchool || "—"}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5">
                    {item.testName}
                  </td>
                  <td className={scoreHistoryScoreColCellClass}>
                    {scoreValue(item.result, "fourSubjects") || "—"}
                  </td>
                  <td className={scoreHistoryScoreColCellClass}>
                    {scoreValue(item.result, "math") || "—"}
                  </td>
                  <td className={scoreHistoryScoreColCellClass}>
                    {scoreValue(item.result, "japanese") || "—"}
                  </td>
                  <td className={scoreHistoryScoreColCellClass}>
                    {scoreValue(item.result, "science") || "—"}
                  </td>
                  <td className={scoreHistoryScoreColCellClass}>
                    {scoreValue(item.result, "social") || "—"}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5">
                    {item.result.notes || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
