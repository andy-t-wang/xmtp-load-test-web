import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const githubToken = process.env.GITHUB_TOKEN
    const githubOwner = process.env.GITHUB_OWNER || 'andy-t-wang'
    const githubRepo = process.env.GITHUB_REPO || 'xmtp-load-test-web'


    if (!githubToken) {
      return NextResponse.json(
        { error: 'GitHub token not configured' },
        { status: 500 }
      )
    }

    // First, get workflow ID like in status endpoint
    const workflowsResponse = await fetch(
      `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    )

    let workflowId = null
    if (workflowsResponse.ok) {
      const workflowsData = await workflowsResponse.json()
      const loadTestWorkflow = workflowsData.workflows?.find((w: any) => 
        w.name === 'XMTP Load Test' || w.path === '.github/workflows/load-test.yml'
      )
      workflowId = loadTestWorkflow?.id
    }

    // Get recent workflow runs for the load-test workflow
    let runsResponse
    if (workflowId) {
      runsResponse = await fetch(
        `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/${workflowId}/runs?per_page=20&_=${Date.now()}`,
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Cache-Control': 'no-cache',
          },
        }
      )
    } else {
      runsResponse = await fetch(
        `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/load-test.yml/runs?per_page=20&_=${Date.now()}`,
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Cache-Control': 'no-cache',
          },
        }
      )
    }

    if (!runsResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch workflow runs' },
        { status: 500 }
      )
    }

    const runsData = await runsResponse.json()
    console.log(`[History API] GitHub returned ${runsData.workflow_runs?.length || 0} workflow runs`)
    
    // Parse metadata from workflow job name
    const parseMetadataFromName = (name: string) => {
      const metadata: any = {}
      
      if (!name) return metadata
      
      const networkMatch = name.match(/Network:\s*(\w+)/)
      if (networkMatch) {
        metadata.network = networkMatch[1]
      }
      
      const groupsMatch = name.match(/Groups:\s*(\d+)/)
      if (groupsMatch) {
        metadata.groups = parseInt(groupsMatch[1])
      }
      
      const inboxMatch = name.match(/Inbox:\s*([a-f0-9]{8})[a-f0-9]*/)
      if (inboxMatch) {
        metadata.inboxId = name.match(/Inbox:\s*([a-f0-9]+)/)?.[1] // Get full inbox ID
      }
      
      return metadata
    }

    const tests = runsData.workflow_runs?.map((run: any) => {
      let status: 'running' | 'completed' | 'failed'
      
      switch (run.status) {
        case 'completed':
          status = run.conclusion === 'success' ? 'completed' : 'failed'
          break
        case 'in_progress':
        case 'queued':
          status = 'running'
          break
        default:
          status = 'failed'
      }

      // Extract test ID from run name or commit message
      const testIdMatch = run.name?.match(/test_\d+_\w+/) || 
                         run.head_commit?.message?.match(/test_\d+_\w+/)
      const testId = testIdMatch ? testIdMatch[0] : `run_${run.id}`

      // Parse metadata from job name
      const rawName = run.name || run.display_title || ''
      const metadata = parseMetadataFromName(rawName)
      
      // Debug logging
      if (rawName) {
        console.log(`[History API] Parsing workflow name: "${rawName}"`)
        console.log(`[History API] Extracted metadata:`, metadata)
      }

      // Add failure reason for failed tests
      let failureReason = undefined
      if (status === 'failed' && run.conclusion === 'cancelled') {
        failureReason = 'Cancelled by user'
      } else if (status === 'failed' && run.conclusion) {
        failureReason = run.conclusion
      }

      return {
        id: testId,
        runId: run.id,
        status,
        startTime: run.created_at,
        endTime: run.updated_at,
        duration: run.updated_at && run.created_at 
          ? Math.floor((new Date(run.updated_at).getTime() - new Date(run.created_at).getTime()) / 1000)
          : undefined,
        githubUrl: run.html_url,
        failureReason,
        ...metadata, // Include network, groups, inboxId
      }
    }) || []

    const finalTests = tests.slice(0, 20)
    console.log(`[History API] Returning ${finalTests.length} processed tests`)
    
    if (finalTests.length > 0) {
      console.log('[History API] Most recent test:', {
        id: finalTests[0].id,
        status: finalTests[0].status,
        created: finalTests[0].startTime,
      })
    }
    
    return NextResponse.json({
      tests: finalTests, // Return up to 20 recent tests
    })

  } catch (error) {
    console.error('Error fetching test history:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}