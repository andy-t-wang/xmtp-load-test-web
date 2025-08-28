import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { testId: string } }
) {
  try {
    const { testId } = params
    const githubToken = process.env.GITHUB_TOKEN
    const githubOwner = process.env.GITHUB_OWNER || 'andy-t-wang'
    const githubRepo = process.env.GITHUB_REPO || 'xmtp-load-test-web'

    console.log(`Attempting to cancel test: ${testId}`)

    if (!githubToken) {
      return NextResponse.json(
        { error: 'GitHub token not configured' },
        { status: 500 }
      )
    }

    // First, find the running workflow for this test ID
    const runsResponse = await fetch(
      `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/runs?status=in_progress&per_page=50`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    )

    if (!runsResponse.ok) {
      console.error(`Failed to fetch running workflows: ${runsResponse.status}`)
      return NextResponse.json(
        { error: 'Failed to fetch running workflows' },
        { status: 500 }
      )
    }

    const runsData = await runsResponse.json()
    console.log(`Found ${runsData.workflow_runs?.length || 0} running workflows`)

    // Find the workflow run for this test ID
    const testRun = runsData.workflow_runs?.find((run: any) => {
      const hasTestIdInName = run.name?.includes(testId)
      const hasTestIdInDisplayTitle = run.display_title?.includes(testId)
      
      // Also check if it's a recent workflow_dispatch for this test
      const isRecent = run.created_at && 
        (Date.now() - new Date(run.created_at).getTime()) < 30 * 60 * 1000 // 30 minutes
      const isManualTrigger = run.event === 'workflow_dispatch'
      
      console.log(`Checking run ${run.id}: name=${run.name}, hasTestId=${hasTestIdInName}, event=${run.event}`)
      
      return hasTestIdInName || hasTestIdInDisplayTitle || (isRecent && isManualTrigger)
    })

    if (!testRun) {
      console.log(`No running workflow found for test ID: ${testId}`)
      return NextResponse.json(
        { error: 'No running workflow found for this test' },
        { status: 404 }
      )
    }

    console.log(`Found running workflow: ${testRun.id}, cancelling...`)

    // Cancel the workflow run
    const cancelResponse = await fetch(
      `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/runs/${testRun.id}/cancel`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    )

    if (!cancelResponse.ok) {
      const errorText = await cancelResponse.text()
      console.error(`Failed to cancel workflow: ${cancelResponse.status}`, errorText)
      return NextResponse.json(
        { error: 'Failed to cancel workflow' },
        { status: 500 }
      )
    }

    console.log(`Successfully cancelled workflow ${testRun.id} for test ${testId}`)

    return NextResponse.json({
      success: true,
      testId,
      workflowId: testRun.id,
      message: 'Test cancelled successfully',
    })

  } catch (error) {
    console.error('Error cancelling test:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}