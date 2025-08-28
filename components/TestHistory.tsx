'use client'

import { useState, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Clock, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react'

interface TestRun {
  id: string
  status: 'running' | 'completed' | 'failed'
  startTime: string
  duration?: number
  totalMessages?: number
  messagesPerSecond?: number
  groups?: number
  network?: string
  inboxId?: string
}

export default function TestHistory() {
  const [tests, setTests] = useState<TestRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch('/api/history')
        if (response.ok) {
          const data = await response.json()
          setTests(data.tests || [])
        }
      } catch (error) {
        console.error('Error fetching history:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Clock className="w-4 h-4 text-blue-500" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        Loading test history...
      </div>
    )
  }

  if (tests.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No tests run yet. Start your first load test above!
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {tests.slice(0, 10).map((test) => (
        <div
          key={test.id}
          className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {getStatusIcon(test.status)}
              <div>
                <div className="font-medium text-sm">
                  Test {test.id.split('_')[2]}
                </div>
                <div className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(test.startTime))} ago
                </div>
              </div>
            </div>
            
            <div className="text-right">
              {test.status === 'completed' && test.totalMessages && (
                <div className="text-sm">
                  <div className="font-mono text-green-600">
                    {test.totalMessages} msgs
                  </div>
                  <div className="text-xs text-gray-500">
                    {test.messagesPerSecond?.toFixed(1)}/sec
                  </div>
                </div>
              )}
            </div>
          </div>

          {test.status === 'completed' && (
            <div className="mt-3 grid grid-cols-4 gap-4 text-xs text-gray-600">
              <div>
                <span className="font-medium">Duration:</span>
                <div className="font-mono">{test.duration}s</div>
              </div>
              <div>
                <span className="font-medium">Groups:</span>
                <div className="font-mono">{test.groups}</div>
              </div>
              <div>
                <span className="font-medium">Network:</span>
                <div className="font-mono">{test.network}</div>
              </div>
              <div>
                <span className="font-medium">Inbox:</span>
                <div className="font-mono text-xs">
                  {test.inboxId?.slice(0, 8)}...
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {tests.length > 10 && (
        <div className="text-center text-sm text-gray-500">
          Showing 10 most recent tests
        </div>
      )}
    </div>
  )
}