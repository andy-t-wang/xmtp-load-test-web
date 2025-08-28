'use client'

import { useState } from 'react'
import { Play, Loader2 } from 'lucide-react'

interface TestFormProps {
  onTestStart: (testId: string) => void
  disabled?: boolean
}

export default function TestForm({ onTestStart, disabled }: TestFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    inboxId: '',
    network: 'dev',
    duration: '30',
    numGroups: '10',
    interval: '1',
    messagesPerBatch: '3'
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const response = await fetch('/api/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, testId })
      })

      if (!response.ok) {
        throw new Error('Failed to start test')
      }

      const result = await response.json()
      onTestStart(testId)
    } catch (error) {
      console.error('Error starting test:', error)
      alert('Failed to start test. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="inboxId" className="block text-sm font-medium text-gray-700">
          Inbox ID *
        </label>
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
          <label htmlFor="network" className="block text-sm font-medium text-gray-700">
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
          <label htmlFor="duration" className="block text-sm font-medium text-gray-700">
            Duration (seconds)
          </label>
          <input
            type="number"
            name="duration"
            id="duration"
            min="10"
            max="300"
            value={formData.duration}
            onChange={handleChange}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border px-3 py-2"
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="numGroups" className="block text-sm font-medium text-gray-700">
            Groups
          </label>
          <input
            type="number"
            name="numGroups"
            id="numGroups"
            min="1"
            max="50"
            value={formData.numGroups}
            onChange={handleChange}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border px-3 py-2"
            disabled={disabled}
          />
        </div>

        <div>
          <label htmlFor="interval" className="block text-sm font-medium text-gray-700">
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
          <label htmlFor="messagesPerBatch" className="block text-sm font-medium text-gray-700">
            Messages/Batch
          </label>
          <input
            type="number"
            name="messagesPerBatch"
            id="messagesPerBatch"
            min="1"
            max="10"
            value={formData.messagesPerBatch}
            onChange={handleChange}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm border px-3 py-2"
            disabled={disabled}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={disabled || isSubmitting}
        className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : (
          <Play className="w-4 h-4 mr-2" />
        )}
        {isSubmitting ? 'Starting Test...' : 'Start Load Test'}
      </button>
    </form>
  )
}