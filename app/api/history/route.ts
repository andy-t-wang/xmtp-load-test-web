import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const githubToken = process.env.GITHUB_TOKEN
    const githubOwner = process.env.GITHUB_OWNER || 'worldcoin'
    const githubRepo = process.env.GITHUB_REPO || 'libxmtp'

    if (!githubToken) {
      return NextResponse.json(
        { error: 'GitHub token not configured' },
        { status: 500 }
      )
    }

    // Get recent workflow runs for the load-test workflow
    const runsResponse = await fetch(
      `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/load-test.yml/runs?per_page=20`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    )

    if (!runsResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch workflow runs' },
        { status: 500 }
      )
    }

    const runsData = await runsResponse.json()
    
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
        // We could parse more details from the workflow inputs if needed
      }
    }) || []

    return NextResponse.json({
      tests: tests.slice(0, 20), // Return up to 20 recent tests
    })

  } catch (error) {
    console.error('Error fetching test history:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}