'use client'

import { useState } from 'react'
import TestForm from '@/components/TestForm'
import TestStatus from '@/components/TestStatus'
import TestHistory from '@/components/TestHistory'

export default function Home() {
  const [activeTest, setActiveTest] = useState<string | null>(null)
  const [refreshHistory, setRefreshHistory] = useState(0)

  const handleTestStart = (testId: string) => {
    setActiveTest(testId)
  }

  const handleTestComplete = () => {
    setActiveTest(null)
    setRefreshHistory(prev => prev + 1)
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
            <TestForm onTestStart={handleTestStart} disabled={!!activeTest} />
          </div>
        </div>

        {/* Test Status */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
              Test Status
            </h3>
            {activeTest ? (
              <TestStatus testId={activeTest} onComplete={handleTestComplete} />
            ) : (
              <div className="text-gray-500 text-center py-8">
                No active test
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Test History */}
      <div className="mt-6 bg-white overflow-hidden shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
            Test History
          </h3>
          <TestHistory key={refreshHistory} />
        </div>
      </div>
    </div>
  )
}