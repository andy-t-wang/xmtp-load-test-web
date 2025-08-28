import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { testId: string } }
) {
  try {
    const { testId } = params
    const githubToken = process.env.GITHUB_TOKEN
    const githubOwner = process.env.GITHUB_OWNER || 'worldcoin'
    const githubRepo = process.env.GITHUB_REPO || 'libxmtp'

    if (!githubToken) {
      return NextResponse.json(
        { error: 'GitHub token not configured' },
        { status: 500 }
      )
    }

    // Get workflow runs for the load-test workflow
    const runsResponse = await fetch(
      `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/load-test.yml/runs?per_page=50`,
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
    
    // Find the run for this test ID
    const testRun = runsData.workflow_runs?.find((run: any) => 
      run.name?.includes(testId) || 
      run.head_commit?.message?.includes(testId)
    )

    if (!testRun) {
      // If we can't find the run yet, return running status
      return NextResponse.json({
        status: 'running',
        testId,
      })
    }

    let status: 'running' | 'completed' | 'failed'
    
    switch (testRun.status) {
      case 'completed':
        status = testRun.conclusion === 'success' ? 'completed' : 'failed'
        break
      case 'in_progress':
      case 'queued':
        status = 'running'
        break
      default:
        status = 'failed'
    }

    const result = {
      status,
      testId,
      startTime: testRun.created_at,
      endTime: testRun.updated_at,
      duration: testRun.updated_at && testRun.created_at 
        ? Math.floor((new Date(testRun.updated_at).getTime() - new Date(testRun.created_at).getTime()) / 1000)
        : undefined,
      githubUrl: testRun.html_url,
    }

    // If completed, try to fetch artifacts for detailed results
    if (status === 'completed') {
      try {
        const artifactsResponse = await fetch(
          `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/runs/${testRun.id}/artifacts`,
          {
            headers: {
              'Authorization': `token ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          }
        )

        if (artifactsResponse.ok) {
          const artifactsData = await artifactsResponse.json()
          const resultArtifact = artifactsData.artifacts?.find((artifact: any) =>
            artifact.name.includes(testId) && artifact.name.includes('results')
          )

          if (resultArtifact) {
            // Note: We can't actually download the artifact content via API without additional steps
            // For now, we'll return basic info and let the user check GitHub
            Object.assign(result, {
              hasResults: true,
              artifactUrl: resultArtifact.archive_download_url,
            })
          }
        }
      } catch (error) {
        console.error('Error fetching artifacts:', error)
      }
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Error checking test status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}