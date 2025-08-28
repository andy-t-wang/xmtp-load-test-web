'use client'

import { useState, useEffect } from 'react'
import { Play, Loader2, Share2, Check } from 'lucide-react'

interface TestFormProps {
  onTestStart: (testId: string) => void
  disabled?: boolean
}

export default function TestForm({ onTestStart, disabled }: TestFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCopied, setShowCopied] = useState(false)
  const [formData, setFormData] = useState({
    inboxId: '',
    network: 'dev',
    duration: '30',
    numGroups: '10',
    interval: '1',
    messagesPerBatch: '3'
  })

  // Load form data from URL parameters on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const updatedFormData = { ...formData }
    
    // Map URL parameters to form fields
    const paramMap = {
      inbox: 'inboxId',
      network: 'network',
      duration: 'duration',
      groups: 'numGroups',
      interval: 'interval',
      messages: 'messagesPerBatch'
    }
    
    Object.entries(paramMap).forEach(([urlParam, formField]) => {
      const value = urlParams.get(urlParam)
      if (value) {
        updatedFormData[formField as keyof typeof formData] = value
      }
    })
    
    setFormData(updatedFormData)
  }, [])

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
    const newFormData = {
      ...formData,
      [e.target.name]: e.target.value
    }
    setFormData(newFormData)
    
    // Update URL parameters
    updateUrlParams(newFormData)
  }

  const updateUrlParams = (data: typeof formData) => {
    const url = new URL(window.location.href)
    const params = url.searchParams
    
    // Map form fields to URL parameters
    const paramMap = {
      inboxId: 'inbox',
      network: 'network',
      duration: 'duration',
      numGroups: 'groups',
      interval: 'interval',
      messagesPerBatch: 'messages'
    }
    
    Object.entries(paramMap).forEach(([formField, urlParam]) => {
      const value = data[formField as keyof typeof data]
      if (value) {
        params.set(urlParam, value)
      } else {
        params.delete(urlParam)
      }
    })
    
    // Update URL without page reload
    window.history.replaceState({}, '', url.toString())
  }

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShowCopied(true)
      setTimeout(() => setShowCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy URL:', error)
      // Fallback: select the URL text
      const url = window.location.href
      prompt('Copy this URL to share the test configuration:', url)
    }
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
          {isSubmitting ? 'Starting Test...' : 'Start Load Test'}
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
          ✅ URL copied to clipboard! Share this link to reproduce the same test configuration.
        </div>
      )}
      
      <div className="text-xs text-gray-500 text-center">
        💡 Use the share button to copy a URL with all test parameters for easy reproduction
      </div>
    </form>
  )
}