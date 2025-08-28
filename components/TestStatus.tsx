'use client'

import { useState, useEffect } from 'react'
import { Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

interface TestStatusProps {
  testId: string
  onComplete: () => void
}

interface TestResult {
  status: 'running' | 'completed' | 'failed'
  startTime?: string
  endTime?: string
  duration?: number
  totalMessages?: number
  messagesPerSecond?: number
  groups?: number
  logs?: string[]
}

export default function TestStatus({ testId, onComplete }: TestStatusProps) {
  const [result, setResult] = useState<TestResult>({ status: 'running' })
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    const startTime = Date.now()
    
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/status/${testId}`)
        if (response.ok) {
          const data = await response.json()
          setResult(data)
          
          if (data.status === 'completed' || data.status === 'failed') {
            onComplete()
          }
        }
      } catch (error) {
        console.error('Error checking status:', error)
      }
    }

    // Update elapsed time
    const timeInterval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    // Check status every 5 seconds
    const statusInterval = setInterval(checkStatus, 5000)
    
    // Check immediately
    checkStatus()

    return () => {
      clearInterval(timeInterval)
      clearInterval(statusInterval)
    }
  }, [testId, onComplete])

  const getStatusIcon = () => {
    switch (result.status) {
      case 'running':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />
    }
  }

  const getStatusText = () => {
    switch (result.status) {
      case 'running':
        return `Running... (${elapsedTime}s)`
      case 'completed':
        return 'Completed'
      case 'failed':
        return 'Failed'
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        {getStatusIcon()}
        <span className="font-medium">{getStatusText()}</span>
      </div>

      <div className="text-sm text-gray-600">
        <div>Test ID: <span className="font-mono text-xs">{testId}</span></div>
      </div>

      {result.status === 'running' && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center">
            <Clock className="w-4 h-4 text-blue-400 mr-2" />
            <span className="text-sm text-blue-700">
              Test is running on GitHub Actions. This may take a few minutes...
            </span>
          </div>
        </div>
      )}

      {result.status === 'completed' && result.totalMessages && (
        <div className="bg-green-50 p-4 rounded-lg">
          <h4 className="font-medium text-green-800 mb-2">Test Results</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-green-600">Duration:</span>
              <span className="ml-2 font-mono">{result.duration}s</span>
            </div>
            <div>
              <span className="text-green-600">Total Messages:</span>
              <span className="ml-2 font-mono">{result.totalMessages}</span>
            </div>
            <div>
              <span className="text-green-600">Messages/sec:</span>
              <span className="ml-2 font-mono">{result.messagesPerSecond?.toFixed(1)}</span>
            </div>
            <div>
              <span className="text-green-600">Groups:</span>
              <span className="ml-2 font-mono">{result.groups}</span>
            </div>
          </div>
        </div>
      )}

      {result.status === 'failed' && (
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="text-sm text-red-700">
            Test failed. Check the GitHub Actions log for details.
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500">
        <a 
          href={`https://github.com/worldcoin/libxmtp/actions`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800"
        >
          View on GitHub Actions →
        </a>
      </div>
    </div>
  )
}