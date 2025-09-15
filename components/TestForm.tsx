"use client";

import { useState, useEffect } from "react";
import {
  Play,
  Loader2,
  Share2,
  Check,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface TestFormProps {
  onTestStart: (testId: string) => void;
  disabled?: boolean;
}

export default function TestForm({ onTestStart, disabled }: TestFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCopied, setShowCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showArenaDetails, setShowArenaDetails] = useState(false);
  const [formData, setFormData] = useState({
    inboxId: "",
    network: "dev",
    duration: "30",
    numGroups: "5",
    numDms: "5",
    interval: "1",
    messagesPerBatch: "3",
    groupSize: "10",
  });

  // Challenge levels
  const challenges = {
    level1: {
      duration: "30",
      numGroups: "2",
      numDms: "2",
      interval: "2",
      messagesPerBatch: "1",
      groupSize: "5",
    },
    level2: {
      duration: "60",
      numGroups: "5",
      numDms: "5",
      interval: "1",
      messagesPerBatch: "2",
      groupSize: "10",
    },
    level3: {
      duration: "120",
      numGroups: "10",
      numDms: "10",
      interval: "1",
      messagesPerBatch: "4",
      groupSize: "50",
    },
    level4: {
      duration: "450", // 7.5 minutes for manual testing
      numGroups: "15",
      numDms: "15",
      interval: "1",
      messagesPerBatch: "5",
      groupSize: "150",
    },
    level5: {
      duration: "900", // 15 minutes for extensive manual testing
      numGroups: "30",
      numDms: "30",
      interval: "1",
      messagesPerBatch: "5",
      groupSize: "225",
    },
  };

  // Load form data from URL parameters on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const updatedFormData = { ...formData };

    // Map URL parameters to form fields
    const paramMap = {
      inbox: "inboxId",
      network: "network",
      duration: "duration",
      groups: "numGroups",
      dms: "numDms",
      interval: "interval",
      messages: "messagesPerBatch",
      groupSize: "groupSize",
    };

    Object.entries(paramMap).forEach(([urlParam, formField]) => {
      const value = urlParams.get(urlParam);
      if (value) {
        updatedFormData[formField as keyof typeof formData] = value;
      }
    });

    setFormData(updatedFormData);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const testId = `test_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const response = await fetch("/api/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, testId }),
      });

      if (!response.ok) {
        throw new Error("Failed to start test");
      }

      const result = await response.json();
      onTestStart(testId);
    } catch (error) {
      console.error("Error starting test:", error);
      alert("Failed to start test. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const value = e.target.value;
    const newFormData = {
      ...formData,
      [e.target.name]: value,
    };
    setFormData(newFormData);

    // Update URL parameters
    updateUrlParams(newFormData);
  };

  const updateUrlParams = (data: typeof formData) => {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    // Map form fields to URL parameters
    const paramMap = {
      inboxId: "inbox",
      network: "network",
      duration: "duration",
      numGroups: "groups",
      numDms: "dms",
      interval: "interval",
      messagesPerBatch: "messages",
      groupSize: "groupSize",
    };

    Object.entries(paramMap).forEach(([formField, urlParam]) => {
      const value = data[formField as keyof typeof data];
      if (value !== undefined && value !== null && value !== "") {
        params.set(urlParam, String(value));
      } else {
        params.delete(urlParam);
      }
    });

    // Update URL without page reload
    window.history.replaceState({}, "", url.toString());
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy URL:", error);
      // Fallback: select the URL text
      const url = window.location.href;
      prompt("Copy this URL to share the test configuration:", url);
    }
  };

  const applyChallenge = (
    challengeLevel: "level1" | "level2" | "level3" | "level4" | "level5"
  ) => {
    const challengeConfig = challenges[challengeLevel];
    const newFormData = {
      ...formData,
      ...challengeConfig,
    };
    setFormData(newFormData);
    updateUrlParams(newFormData);

    // Auto-expand details for levels 4 & 5 (manual testing levels)
    if (challengeLevel === "level4" || challengeLevel === "level5") {
      setShowArenaDetails(true);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Challenges Section - Compact */}
      <div className="bg-gray-50 p-3 rounded-lg border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-900">
              🎯 Survive the Arena
            </h3>
            <button
              type="button"
              onClick={() => setShowArenaDetails(!showArenaDetails)}
              className="text-gray-400 hover:text-gray-600"
              title={showArenaDetails ? "Hide details" : "Show details"}
            >
              {showArenaDetails ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
          {!showArenaDetails && (
            <div className="text-xs text-gray-500">Levels</div>
          )}
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          <button
            type="button"
            onClick={() => applyChallenge("level1")}
            disabled={disabled}
            className="px-1.5 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Level 1: 2 groups + 2 DMs, 30 seconds"
          >
            <div className="text-green-600 font-medium">1</div>
            <div className="text-xs text-gray-500">2+2</div>
          </button>
          <button
            type="button"
            onClick={() => applyChallenge("level2")}
            disabled={disabled}
            className="px-1.5 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Level 2: 5 groups + 5 DMs, 1 minute"
          >
            <div className="text-blue-600 font-medium">2</div>
            <div className="text-xs text-gray-500">5+5</div>
          </button>
          <button
            type="button"
            onClick={() => applyChallenge("level3")}
            disabled={disabled}
            className="px-1.5 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Level 3: 10 groups + 10 DMs, 2 minutes"
          >
            <div className="text-yellow-600 font-medium">3</div>
            <div className="text-xs text-gray-500">10+10</div>
          </button>
          <button
            type="button"
            onClick={() => applyChallenge("level4")}
            disabled={disabled}
            className="px-1.5 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Level 4: 15 groups + 15 DMs, 7.5 minutes (manual testing)"
          >
            <div className="text-orange-600 font-medium">4</div>
            <div className="text-xs text-gray-500">15+15</div>
          </button>
          <button
            type="button"
            onClick={() => applyChallenge("level5")}
            disabled={disabled}
            className="px-1.5 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Level 5: 30 groups + 30 DMs, 15 minutes (extensive manual testing)"
          >
            <div className="text-red-600 font-medium">5</div>
            <div className="text-xs text-gray-500">30+30</div>
          </button>
        </div>

        {/* Expanded Details */}
        {showArenaDetails && (
          <div className="mt-3 space-y-3">
            <div className="text-xs text-gray-500">
              All levels need to be passed for syncing to be considered ready.
              See how good your logic is so far 😈.
            </div>

            {/* Manual Testing Instructions for Levels 4 & 5 */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <h4 className="text-sm font-medium text-blue-900 mb-2">
                📱 Levels 4 & 5: Manual Testing Instructions
              </h4>
              <div className="text-xs text-blue-800 space-y-1">
                <div>
                  <strong>During the test:</strong>
                </div>
                <div>1. Accept some of the incoming message requests</div>
                <div>2. Kill the app and restart it</div>
                <div>
                  3. Switch between conversations and send messages yourself
                </div>
                <div>
                  4. Try to accept more messages while load test is running
                </div>
                <div className="mt-2 text-blue-600">
                  💡 Extended durations (7.5m & 15m) give you time for manual
                  interaction
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center mb-1">
          <label
            htmlFor="inboxId"
            className="block text-sm font-medium text-gray-700"
          >
            Inbox ID *
          </label>
          <div
            className="relative ml-2"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <button type="button" className="text-gray-400 hover:text-gray-600">
              <HelpCircle className="w-4 h-4" />
            </button>

            {showTooltip && (
              <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 w-72 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl z-50">
                <div className="font-medium mb-1">
                  How to get your Inbox ID:
                </div>
                <div className="space-y-1">
                  <div>
                    1. Go to{" "}
                    <a
                      href="https://xmtp.chat/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-300 hover:text-blue-200 underline"
                    >
                      xmtp.chat
                    </a>
                  </div>
                  <div>2. Connect your wallet</div>
                  <div>
                    3. Create a chat on the <strong>same network</strong> as
                    your test
                  </div>
                  <div>4. Your Inbox ID will be in the URL or chat details</div>
                </div>
                {/* Arrow pointing left */}
                <div className="absolute right-full top-1/2 transform -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
              </div>
            )}
          </div>
        </div>
        <input
          type="text"
          name="inboxId"
          id="inboxId"
          required
          value={formData.inboxId}
          onChange={handleChange}
          placeholder="fbeb081944df5ef3f26de65f05ada28c781ac3086f0a7ccff2751ede994ebfc9"
          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border px-3 py-2"
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="network"
            className="block text-sm font-medium text-gray-700"
          >
            Network
          </label>
          <select
            name="network"
            id="network"
            value={formData.network}
            onChange={handleChange}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border px-3 py-2"
            disabled={disabled}
          >
            <option value="dev">Dev</option>
            <option value="local">Local</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="duration"
            className="block text-sm font-medium text-gray-700"
          >
            Duration (seconds)
          </label>
          <input
            type="number"
            name="duration"
            id="duration"
            min="10"
            value={formData.duration}
            onChange={handleChange}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border px-3 py-2"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="numGroups"
            className="block text-sm font-medium text-gray-700"
          >
            New Groups
          </label>
          <input
            type="number"
            name="numGroups"
            id="numGroups"
            min="0"
            max="50"
            value={formData.numGroups}
            onChange={handleChange}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border px-3 py-2"
            disabled={disabled}
          />
        </div>

        <div>
          <label
            htmlFor="numDms"
            className="block text-sm font-medium text-gray-700"
          >
            New DMs (2-person conversations)
          </label>
          <input
            type="number"
            name="numDms"
            id="numDms"
            min="0"
            max="50"
            value={formData.numDms}
            onChange={handleChange}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border px-3 py-2"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label
            htmlFor="groupSize"
            className="block text-sm font-medium text-gray-700"
          >
            Group Size (members)
          </label>
          <input
            type="number"
            name="groupSize"
            id="groupSize"
            min="2"
            value={formData.groupSize}
            onChange={handleChange}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border px-3 py-2"
            disabled={disabled}
          />
        </div>

        <div>
          <label
            htmlFor="interval"
            className="block text-sm font-medium text-gray-700"
          >
            Interval (sec)
          </label>
          <input
            type="number"
            name="interval"
            id="interval"
            min="0.1"
            max="10"
            step="0.1"
            value={formData.interval}
            onChange={handleChange}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border px-3 py-2"
            disabled={disabled}
          />
        </div>

        <div>
          <label
            htmlFor="messagesPerBatch"
            className="block text-sm font-medium text-gray-700"
          >
            Messages/Batch
          </label>
          <input
            type="number"
            name="messagesPerBatch"
            id="messagesPerBatch"
            min="1"
            value={formData.messagesPerBatch}
            onChange={handleChange}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border px-3 py-2"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="flex justify-center">
        <div className="text-center">
          <div className="text-sm text-gray-500 mb-1">
            Total New Conversations:{" "}
            {parseInt(formData.numGroups) + parseInt(formData.numDms)}
          </div>
          <div className="text-xs text-gray-400">New Groups + New DMs</div>
        </div>
      </div>

      <div className="flex space-x-3">
        <button
          type="submit"
          disabled={disabled || isSubmitting}
          className="flex-1 flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          {isSubmitting ? "Starting Test..." : "Start Load Test"}
        </button>

        <button
          type="button"
          onClick={handleShare}
          disabled={disabled}
          className="flex items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Copy shareable URL with current test configuration"
        >
          {showCopied ? (
            <Check className="w-4 h-4 text-green-600" />
          ) : (
            <Share2 className="w-4 h-4" />
          )}
        </button>
      </div>

      {showCopied && (
        <div className="text-center text-sm text-green-600">
          ✅ URL copied to clipboard! Share this link to reproduce the same test
          configuration.
        </div>
      )}

      <div className="text-xs text-gray-500 text-center">
        💡 Use the share button to copy a URL with all test parameters for easy
        reproduction
      </div>
    </form>
  );
}
