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

    // Process workflow runs and fetch artifacts for completed ones
    const tests = await Promise.all(
      (runsData.workflow_runs || []).map(async (run: any) => {
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
        
        // Add failure reason for failed tests
        let failureReason = undefined
        if (status === 'failed' && run.conclusion === 'cancelled') {
          failureReason = 'Cancelled by user'
        } else if (status === 'failed' && run.conclusion) {
          failureReason = run.conclusion
        }

        const baseResult = {
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

        // If completed successfully, try to fetch artifact data
        if (status === 'completed') {
          try {
            const artifactsResponse = await fetch(
              `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/runs/${run.id}/artifacts`,
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
                // Download and parse the artifact
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
                      Object.assign(baseResult, {
                        totalMessages: artifactData.totalMessages,
                        messagesPerSecond: parseFloat(artifactData.messagesPerSecond),
                        groups: artifactData.groups || metadata.groups,
                        dms: artifactData.dms || 0,
                        network: artifactData.network || metadata.network,
                        inboxId: artifactData.inboxId || metadata.inboxId,
                      })
                    }
                  }
                } catch (error) {
                  console.error(`Error downloading artifact for test ${testId}:`, error)
                }
              }
            }
          } catch (error) {
            console.error(`Error fetching artifacts for run ${run.id}:`, error)
          }
        }

        return baseResult
      })
    )

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