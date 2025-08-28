'use client'

import { useState } from 'react'
import TestForm from '@/components/TestForm'
import TestStatus from '@/components/TestStatus'
import TestHistory from '@/components/TestHistory'

export default function Home() {
  const [selectedTest, setSelectedTest] = useState<string | null>(null)
  const [refreshHistory, setRefreshHistory] = useState(0)

  const handleTestStart = (testId: string) => {
    setSelectedTest(testId)
  }

  const handleTestComplete = () => {
    // Don't clear selected test immediately - let user choose
    setRefreshHistory(prev => prev + 1)
  }

  const handleTestSelect = (testId: string) => {
    setSelectedTest(testId)
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Test Form */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
              Start New Load Test
            </h3>
            <TestForm onTestStart={handleTestStart} disabled={false} />
          </div>
        </div>

        {/* Test Status */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
              Test Status
            </h3>
            {selectedTest ? (
              <TestStatus testId={selectedTest} onComplete={handleTestComplete} />
            ) : (
              <div className="text-gray-500 text-center py-8">
                Select a test from the history below or start a new test
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Test History */}
      <div className="mt-6 bg-white overflow-hidden shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <TestHistory 
            key={refreshHistory} 
            onTestSelect={handleTestSelect} 
            selectedTestId={selectedTest}
          />
        </div>
      </div>
    </div>
  )
}