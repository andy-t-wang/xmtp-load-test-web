import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      inboxId, 
      network, 
      duration, 
      numGroups,
      numDms, 
      interval, 
      messagesPerBatch, 
      testId,
      existingInboxIds,
      existingGroupNames 
    } = body

    // Validate required fields
    if (!inboxId || !testId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate inbox ID format (basic hex check)
    if (!/^[a-f0-9]{64}$/i.test(inboxId)) {
      return NextResponse.json(
        { error: 'Invalid inbox ID format' },
        { status: 400 }
      )
    }

    const githubToken = process.env.GITHUB_TOKEN
    const githubOwner = process.env.GITHUB_OWNER || 'andy-t-wang'
    const githubRepo = process.env.GITHUB_REPO || 'xmtp-load-test-web'

    if (!githubToken) {
      return NextResponse.json(
        { error: 'GitHub token not configured' },
        { status: 500 }
      )
    }

    console.log(`Triggering workflow for test ID: ${testId}`)
    console.log(`Repository: ${githubOwner}/${githubRepo}`)
    console.log(`Workflow inputs:`, {
      inbox_id: inboxId,
      network: network || 'dev',
      duration: duration || '30',
      num_groups: numGroups || '5',
      num_dms: numDms || '5',
      interval: interval || '1',
      messages_per_batch: messagesPerBatch || '3',
      test_id: testId,
      existing_inbox_ids: existingInboxIds || '',
      existing_group_names: existingGroupNames || '',
    })

    // Trigger GitHub Actions workflow
    const githubResponse = await fetch(
      `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/load-test.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            inbox_id: inboxId,
            network: network || 'dev',
            duration: duration || '30',
            num_groups: numGroups || '5',
            num_dms: numDms || '5',
            interval: interval || '1',
            messages_per_batch: messagesPerBatch || '3',
            test_id: testId,
            existing_inbox_ids: existingInboxIds || '',
            existing_group_names: existingGroupNames || '',
          },
        }),
      }
    )
    
    console.log(`GitHub API response status: ${githubResponse.status} ${githubResponse.statusText}`)

    if (!githubResponse.ok) {
      const errorText = await githubResponse.text()
      console.error('GitHub API error:', githubResponse.status, errorText)
      return NextResponse.json(
        { error: 'Failed to trigger GitHub Action' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      testId,
      message: 'Test started successfully',
    })

  } catch (error) {
    console.error('Error triggering test:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}