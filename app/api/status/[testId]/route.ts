import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { testId: string } }
) {
  try {
    const { testId } = params
    const githubToken = process.env.GITHUB_TOKEN
    const githubOwner = process.env.GITHUB_OWNER || 'andy-t-wang'
    const githubRepo = process.env.GITHUB_REPO || 'xmtp-load-test-web'

    console.log(`Environment check:`, {
      hasToken: !!githubToken,
      tokenLength: githubToken?.length || 0,
      githubOwner,
      githubRepo
    })

    if (!githubToken) {
      return NextResponse.json(
        { error: 'GitHub token not configured' },
        { status: 500 }
      )
    }

    console.log(`Checking repository: ${githubOwner}/${githubRepo}`)
    
    // First, let's get all workflows to see what's available
    const workflowsResponse = await fetch(
      `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    )
    
    if (workflowsResponse.ok) {
      const workflowsData = await workflowsResponse.json()
      console.log(`Available workflows:`, workflowsData.workflows?.map((w: any) => ({ name: w.name, path: w.path, id: w.id })))
    }

    // Get workflow ID from the workflows list
    let workflowId = null
    if (workflowsResponse.ok) {
      const workflowsData = await workflowsResponse.json()
      const loadTestWorkflow = workflowsData.workflows?.find((w: any) => 
        w.name === 'XMTP Load Test' || w.path === '.github/workflows/load-test.yml'
      )
      workflowId = loadTestWorkflow?.id
      console.log(`Found workflow ID: ${workflowId}`)
    }

    // Try to get workflow runs - use workflow ID if available, otherwise try file name
    let runsResponse
    if (workflowId) {
      console.log(`Fetching runs for workflow ID: ${workflowId}`)
      runsResponse = await fetch(
        `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/${workflowId}/runs?per_page=50`,
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      )
    } else {
      console.log(`No workflow ID found, trying by filename`)
      runsResponse = await fetch(
        `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/load-test.yml/runs?per_page=50`,
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      )
    }
    
    // If that fails, try getting all workflow runs
    if (!runsResponse.ok) {
      console.log(`Specific workflow runs request failed, trying all runs. Status: ${runsResponse.status}`)
      runsResponse = await fetch(
        `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/runs?per_page=50`,
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      )
    }

    if (!runsResponse.ok) {
      const errorText = await runsResponse.text()
      console.error(`GitHub API error: ${runsResponse.status} ${runsResponse.statusText}`, errorText)
      return NextResponse.json(
        { 
          error: 'Failed to fetch workflow runs',
          details: `${runsResponse.status}: ${runsResponse.statusText}`,
          repository: `${githubOwner}/${githubRepo}`
        },
        { status: 500 }
      )
    }

    const runsData = await runsResponse.json()
    
    console.log(`Looking for test ID: ${testId}`)
    console.log(`Found ${runsData.workflow_runs?.length || 0} workflow runs`)
    
    // Log details about recent runs for debugging
    if (runsData.workflow_runs && runsData.workflow_runs.length > 0) {
      console.log(`Recent runs details:`)
      runsData.workflow_runs.slice(0, 5).forEach((run: any, index: number) => {
        console.log(`  ${index + 1}. ID: ${run.id}, Name: ${run.name}, Event: ${run.event}, Status: ${run.status}, Created: ${run.created_at}`)
      })
    } else {
      console.log(`No workflow runs found at all`)
    }
    
    // Find the run for this test ID - check multiple places where test ID might appear
    const testRun = runsData.workflow_runs?.find((run: any) => {
      const hasTestIdInName = run.name?.includes(testId)
      const hasTestIdInCommitMessage = run.head_commit?.message?.includes(testId)
      const hasTestIdInDisplayTitle = run.display_title?.includes(testId)
      
      // Check if created recently (within last 15 minutes) and triggered by workflow_dispatch
      const isRecent = run.created_at && 
        (Date.now() - new Date(run.created_at).getTime()) < 15 * 60 * 1000
      const isManualTrigger = run.event === 'workflow_dispatch'
      
      console.log(`Run ${run.id}: name=${run.name}, event=${run.event}, created=${run.created_at}, recent=${isRecent}, hasTestId=${hasTestIdInName}`)
      
      return hasTestIdInName || hasTestIdInCommitMessage || hasTestIdInDisplayTitle || 
             (isRecent && isManualTrigger)
    })

    if (!testRun) {
      // If we can't find a specific run, check if there are any recent workflow_dispatch runs
      const recentRuns = runsData.workflow_runs?.filter((run: any) => 
        run.event === 'workflow_dispatch' && 
        run.created_at && 
        (Date.now() - new Date(run.created_at).getTime()) < 5 * 60 * 1000 // Last 5 minutes
      ).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      
      if (recentRuns && recentRuns.length > 0) {
        console.log(`Using most recent workflow run: ${recentRuns[0].id}`)
        const mostRecentRun = recentRuns[0]
        
        let status: 'running' | 'completed' | 'failed'
        switch (mostRecentRun.status) {
          case 'completed':
            status = mostRecentRun.conclusion === 'success' ? 'completed' : 'failed'
            break
          case 'in_progress':
          case 'queued':
            status = 'running'
            break
          default:
            status = 'failed'
        }
        
        return NextResponse.json({
          status,
          testId,
          startTime: mostRecentRun.created_at,
          endTime: mostRecentRun.updated_at,
          duration: mostRecentRun.updated_at && mostRecentRun.created_at 
            ? Math.floor((new Date(mostRecentRun.updated_at).getTime() - new Date(mostRecentRun.created_at).getTime()) / 1000)
            : undefined,
          githubUrl: mostRecentRun.html_url,
          conclusion: mostRecentRun.conclusion,
          failureReason: status === 'failed' ? mostRecentRun.conclusion || 'Unknown error' : undefined,
        })
      }
      
      // Still no run found - check if this is a very recent test
      // GitHub Actions can take 30-60 seconds to show up in the API
      console.log(`No matching workflow run found for test ID: ${testId}`)
      
      // Extract timestamp from test ID if possible (format: test_timestamp_random)
      const testTimestamp = testId.match(/test_(\d+)_/)?.[1]
      const testTime = testTimestamp ? parseInt(testTimestamp) : null
      const now = Date.now()
      
      // If test was triggered within last 5 minutes, assume it's still starting
      if (testTime && (now - testTime) < 5 * 60 * 1000) {
        console.log(`Test ${testId} was recently triggered (${(now - testTime) / 1000}s ago), returning running status`)
        return NextResponse.json({
          status: 'running',
          testId,
          message: 'Workflow starting...',
        })
      }
      
      return NextResponse.json({
        status: 'running',
        testId,
        message: 'Searching for workflow run...',
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

    // Add failure reason for cancelled workflows
    let failureReason = undefined
    if (status === 'failed' && testRun.conclusion === 'cancelled') {
      failureReason = 'Cancelled by user'
    } else if (status === 'failed' && testRun.conclusion) {
      failureReason = testRun.conclusion
    }

    // Parse metadata from workflow job name
    // Format: "Test testId | Network: dev | Groups: 10 | Inbox: abc123..."
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
    
    const metadata = parseMetadataFromName(testRun.name || testRun.display_title || '')

    const result = {
      status,
      testId,
      startTime: testRun.created_at,
      endTime: testRun.updated_at,
      duration: testRun.updated_at && testRun.created_at 
        ? Math.floor((new Date(testRun.updated_at).getTime() - new Date(testRun.created_at).getTime()) / 1000)
        : undefined,
      githubUrl: testRun.html_url,
      failureReason,
      ...metadata,
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
            artifact.name.includes(testId)
          )

          if (resultArtifact) {
            // Download the artifact
            try {
              const downloadResponse = await fetch(
                `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/artifacts/${resultArtifact.id}/zip`,
                {
                  headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                  },
                }
              )

              if (downloadResponse.ok) {
                // Parse the ZIP file to extract JSON results
                const arrayBuffer = await downloadResponse.arrayBuffer()
                const { unzipSync } = await import('fflate')
                const unzipped = unzipSync(new Uint8Array(arrayBuffer))
                
                // Find the results JSON file
                const resultsFile = Object.keys(unzipped).find(name => 
                  name.includes('results') && name.endsWith('.json')
                )
                
                if (resultsFile) {
                  const jsonContent = new TextDecoder().decode(unzipped[resultsFile])
                  const artifactData = JSON.parse(jsonContent)
                  
                  // Merge artifact data with result
                  Object.assign(result, {
                    totalMessages: artifactData.totalMessages,
                    messagesPerSecond: artifactData.messagesPerSecond,
                    groups: artifactData.groups || metadata.groups,
                    network: artifactData.network || metadata.network,
                    inboxId: artifactData.inboxId || metadata.inboxId,
                  })
                }
              }
            } catch (error) {
              console.error('Error downloading/parsing artifact:', error)
              // Fall back to metadata only
            }
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