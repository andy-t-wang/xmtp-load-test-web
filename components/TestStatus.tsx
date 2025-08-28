"use client";

import { useState, useEffect } from "react";
import { Clock, CheckCircle, AlertCircle, Loader2, Square } from "lucide-react";

interface TestStatusProps {
  testData: {
    id: string
    status?: 'running' | 'completed' | 'failed'
    startTime?: string
    duration?: number
    totalMessages?: number
    messagesPerSecond?: number
    groups?: number
    network?: string
    inboxId?: string
    githubUrl?: string
    failureReason?: string
  };
  onComplete: () => void;
}

interface TestResult {
  status: "running" | "completed" | "failed";
  startTime?: string;
  endTime?: string;
  duration?: number;
  totalMessages?: number;
  messagesPerSecond?: number;
  groups?: number;
  logs?: string[];
  githubUrl?: string;
  failureReason?: string;
  conclusion?: string;
  message?: string;
  network?: string;
  inboxId?: string;
}

export default function TestStatus({ testData, onComplete }: TestStatusProps) {
  const [result, setResult] = useState<TestResult>(() => {
    // Initialize with data from history if available
    if (testData.status) {
      return {
        status: testData.status,
        startTime: testData.startTime,
        duration: testData.duration,
        totalMessages: testData.totalMessages,
        messagesPerSecond: testData.messagesPerSecond,
        groups: testData.groups,
        githubUrl: testData.githubUrl,
        failureReason: testData.failureReason,
      }
    }
    return { status: "running" }
  });
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    // If we already have complete data from history, don't poll
    if (testData.status && (testData.status === "completed" || testData.status === "failed")) {
      return;
    }

    const checkStatus = async () => {
      try {
        console.log(`Checking status for test: ${testData.id}`);
        const response = await fetch(`/api/status/${testData.id}`);
        if (response.ok) {
          const data = await response.json();
          console.log(`Status response:`, data);
          setResult(data);

          if (data.status === "completed" || data.status === "failed") {
            console.log(`Test ${testData.id} finished with status: ${data.status}`);
            onComplete();
          }
        } else {
          console.error(`Status check failed: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.error("Error checking status:", error);
      }
    };

    // Only poll for running tests
    if (!testData.status || testData.status === "running") {
      // Check status every 5 seconds
      const statusInterval = setInterval(checkStatus, 5000);

      // Check immediately
      checkStatus();

      return () => {
        clearInterval(statusInterval);
      };
    }
  }, [testData.id, testData.status, onComplete]);

  const handleCancel = async () => {
    if (isCancelling) return;
    
    try {
      setIsCancelling(true);
      console.log(`Cancelling test: ${testData.id}`);
      
      const response = await fetch(`/api/cancel/${testData.id}`, {
        method: 'POST',
      });
      
      if (response.ok) {
        console.log(`Successfully cancelled test: ${testData.id}`);
        setResult(prev => ({ ...prev, status: 'failed', failureReason: 'Cancelled by user' }));
        onComplete();
      } else {
        console.error(`Failed to cancel test: ${response.status}`);
        const errorData = await response.json().catch(() => ({}));
        alert(`Failed to cancel test: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error cancelling test:', error);
      alert('Error cancelling test. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusIcon = () => {
    switch (result.status) {
      case "running":
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "failed":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (result.status) {
      case "running":
        // Show actual duration if we have start time from GitHub, otherwise just "Running..."
        if (result.startTime) {
          const actualElapsed = Math.floor((Date.now() - new Date(result.startTime).getTime()) / 1000);
          return `Running... (${actualElapsed}s)`;
        } else if (result.message) {
          return `${result.message}`;
        } else {
          return "Running...";
        }
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <span className="font-medium">{getStatusText()}</span>
        </div>
        
        {result.status === "running" && (
          <button
            onClick={handleCancel}
            disabled={isCancelling}
            className="flex items-center space-x-1 px-3 py-1 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCancelling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Stopping...</span>
              </>
            ) : (
              <>
                <Square className="w-4 h-4" />
                <span>Stop</span>
              </>
            )}
          </button>
        )}
      </div>

      <div className="text-sm text-gray-600">
        <div>
          Test ID: <span className="font-mono text-xs">{testData.id}</span>
        </div>
      </div>

      {result.status === "running" && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center">
            <Clock className="w-4 h-4 text-blue-400 mr-2" />
            <span className="text-sm text-blue-700">
              Test is running on GitHub Actions. This may take a few minutes...
            </span>
          </div>
        </div>
      )}

      {result.status === "completed" && (
        <div className="bg-green-50 p-4 rounded-lg">
          <h4 className="font-medium text-green-800 mb-2">Test Results</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-green-600">Duration:</span>
              <span className="ml-2 font-mono">{result.duration}s</span>
            </div>
            {result.totalMessages && (
              <div>
                <span className="text-green-600">Total Messages:</span>
                <span className="ml-2 font-mono">{result.totalMessages}</span>
              </div>
            )}
            {result.messagesPerSecond && (
              <div>
                <span className="text-green-600">Messages/sec:</span>
                <span className="ml-2 font-mono">
                  {result.messagesPerSecond.toFixed(1)}
                </span>
              </div>
            )}
            {result.groups && (
              <div>
                <span className="text-green-600">Groups:</span>
                <span className="ml-2 font-mono">{result.groups}</span>
              </div>
            )}
          </div>
          
          {/* Additional metadata row */}
          <div className="mt-3 pt-3 border-t border-green-200">
            <div className="grid grid-cols-1 gap-2 text-xs">
              {result.network && (
                <div>
                  <span className="text-green-600 font-medium">Network:</span>
                  <span className="ml-2 font-mono">{result.network}</span>
                </div>
              )}
              {result.inboxId && (
                <div>
                  <span className="text-green-600 font-medium">Inbox ID:</span>
                  <span className="ml-2 font-mono text-xs">{result.inboxId.slice(0, 16)}...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {result.status === "failed" && (
        <div className={`p-4 rounded-lg ${result.failureReason === 'Cancelled by user' ? 'bg-gray-50' : 'bg-red-50'}`}>
          <h4 className={`font-medium mb-2 ${result.failureReason === 'Cancelled by user' ? 'text-gray-800' : 'text-red-800'}`}>
            {result.failureReason === 'Cancelled by user' ? 'Test Cancelled' : 'Test Failed'}
          </h4>
          <div className={`text-sm space-y-2 ${result.failureReason === 'Cancelled by user' ? 'text-gray-700' : 'text-red-700'}`}>
            {result.failureReason && (
              <div>
                <span className="font-medium">Reason:</span> {result.failureReason}
              </div>
            )}
            {result.failureReason !== 'Cancelled by user' && (
              <div>
                Check the GitHub Actions log for detailed error information.
              </div>
            )}
            {result.githubUrl && (
              <div>
                <a 
                  href={result.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline ${result.failureReason === 'Cancelled by user' ? 'text-gray-600 hover:text-gray-800' : 'text-red-600 hover:text-red-800'}`}
                >
                  View workflow run →
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {!result.githubUrl && (
        <div className="text-xs text-gray-500">
          <a
            href={`https://github.com/${process.env.NEXT_PUBLIC_GITHUB_OWNER || 'your-username'}/${process.env.NEXT_PUBLIC_GITHUB_REPO || 'xmtp-load-test-web'}/actions`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800"
          >
            View on GitHub Actions →
          </a>
        </div>
      )}
    </div>
  );
}
