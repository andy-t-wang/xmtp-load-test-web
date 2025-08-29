"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Clock,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

interface TestRun {
  id: string;
  status: "running" | "completed" | "failed";
  startTime: string;
  duration?: number;
  totalMessages?: number;
  messagesPerSecond?: number;
  groups?: number;
  network?: string;
  inboxId?: string;
  githubUrl?: string;
  failureReason?: string;
}

interface TestHistoryProps {
  onTestSelect: (testData: TestRun) => void;
  selectedTestId?: string | null;
}

export default function TestHistory({
  onTestSelect,
  selectedTestId,
}: TestHistoryProps) {
  const [tests, setTests] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchHistory = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      // Add cache-busting timestamp
      const cacheBuster = `?_=${Date.now()}`;
      const response = await fetch(`/api/history${cacheBuster}`, {
        cache: "no-store", // Prevent browser caching
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });

      console.log(
        `[TestHistory] ${isRefresh ? "Refresh" : "Initial"} fetch response: ${
          response.status
        }`
      );

      if (response.ok) {
        const data = await response.json();
        console.log(`[TestHistory] Received ${data.tests?.length || 0} tests`);

        // Log first few tests for debugging
        if (data.tests?.length > 0) {
          console.log(
            "[TestHistory] Recent tests:",
            data.tests.slice(0, 3).map((t: any) => ({
              id: t.id,
              status: t.status,
              startTime: t.startTime,
              groups: t.groups,
              network: t.network,
              inboxId: t.inboxId ? t.inboxId.slice(0, 8) + "..." : "none",
            }))
          );
        }

        setTests(data.tests || []);
        setError(null);
        setLastUpdated(new Date());
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[TestHistory] API error: ${response.status}`, errorData);
        setError(
          `Failed to load test history: ${errorData.error || "Unknown error"}`
        );
      }
    } catch (error) {
      console.error("[TestHistory] Network error:", error);
      setError("Network error while loading test history");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();

    // Set up auto-refresh every 30 seconds to catch new tests
    const autoRefreshInterval = setInterval(() => {
      console.log("[TestHistory] Auto-refreshing...");
      fetchHistory(true);
    }, 30000); // 30 seconds

    return () => {
      clearInterval(autoRefreshInterval);
    };
  }, []);

  const handleRefresh = () => {
    fetchHistory(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Clock className="w-4 h-4 text-blue-500" />;
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        Loading test history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-600 mb-2">⚠️ {error}</div>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            // Trigger a re-fetch by remounting the component
            window.location.reload();
          }}
          className="text-blue-600 hover:text-blue-800 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No tests run yet. Start your first load test above!
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium leading-6 text-gray-900">
            Test History
          </h3>
          {lastUpdated && (
            <p className="text-xs text-gray-500">
              Last updated: {lastUpdated.toLocaleTimeString()}
              <span className="ml-1">(auto-refresh every 30s)</span>
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          title="Refresh test history"
        >
          <RefreshCw
            className={`w-4 h-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="space-y-4">
        {tests.slice(0, 10).map((test) => {
          const isSelected = selectedTestId === test.id;
          const isClickable =
            test.status === "running" ||
            test.status === "completed" ||
            test.status === "failed";

          return (
            <div
              key={test.id}
              onClick={() => isClickable && onTestSelect(test)}
              className={`border rounded-lg p-4 transition-all ${
                isSelected
                  ? "border-blue-500 bg-blue-50 shadow-sm"
                  : "border-gray-200 hover:shadow-sm hover:border-gray-300"
              } ${isClickable ? "cursor-pointer" : "cursor-default"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(test.status)}
                  <div>
                    <div className="font-medium text-sm flex items-center">
                      Test {test.id.split("_")[2]}
                      {isSelected && (
                        <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                          Selected
                        </span>
                      )}
                      {test.status === "running" && !isSelected && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          Click to monitor
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(test.startTime))} ago
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  {test.status === "completed" && test.totalMessages && (
                    <div className="text-sm">
                      <div className="font-mono text-green-600">
                        {test.totalMessages} msgs
                      </div>
                      <div className="text-xs text-gray-500">
                        {test.messagesPerSecond?.toFixed(1)}/sec
                      </div>
                    </div>
                  )}
                  {test.status === "failed" && (
                    <div className="text-sm">
                      <div className="font-mono text-red-600">Failed</div>
                      {test.failureReason && (
                        <div className="text-xs text-gray-500">
                          {test.failureReason}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {(test.status === "completed" || test.status === "failed") && (
                <div className="mt-3">
                  {test.status === "completed" && (
                    <div className="grid grid-cols-4 gap-4 text-xs text-gray-600">
                      <div>
                        <span className="font-medium">Duration:</span>
                        <div className="font-mono">{test.duration}s</div>
                      </div>
                      <div>
                        <span className="font-medium">Groups:</span>
                        <div className="font-mono">{test.groups || "N/A"}</div>
                      </div>
                      <div>
                        <span className="font-medium">Network:</span>
                        <div className="font-mono">{test.network || "N/A"}</div>
                      </div>
                      <div>
                        <span className="font-medium">Inbox:</span>
                        <div className="font-mono text-xs">
                          {test.inboxId
                            ? `${test.inboxId.slice(0, 8)}...`
                            : "N/A"}
                        </div>
                      </div>
                    </div>
                  )}

                  {test.status === "failed" && (
                    <div className="bg-red-50 p-3 rounded text-xs">
                      <div className="text-red-800 font-medium mb-1">
                        Test Failed
                      </div>
                      {test.failureReason && (
                        <div className="text-red-700 mb-2">
                          Reason: {test.failureReason}
                        </div>
                      )}
                      {test.githubUrl && (
                        <a
                          href={test.githubUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-red-600 hover:text-red-800 underline"
                        >
                          View workflow run →
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {tests.length > 10 && (
          <div className="text-center text-sm text-gray-500">
            Showing 10 most recent tests
          </div>
        )}

        {tests.filter((t) => t.status === "running").length > 0 && (
          <div className="text-center text-sm text-blue-600">
            💡 Click on running or completed tests above to view their status
          </div>
        )}
      </div>
    </>
  );
}
