# XMTP Load Test Web UI

A web interface for running XMTP load tests using GitHub Actions.

## Features

- **Web UI**: Easy-to-use form for configuring load tests
- **Concurrent Testing**: Multiple users can run tests simultaneously via GitHub Actions
- **Real-time Status**: Monitor test progress and view results
- **Test History**: View previous test runs and compare results
- **Flexible Parameters**: Configure groups, messages, duration, and more

## Architecture

```
Vercel (Web UI) → GitHub Actions → xdbg (Load Test)
```

1. **Vercel**: Hosts the Next.js web application
2. **GitHub Actions**: Executes the load test scripts
3. **xdbg**: The XMTP debug tool that performs the actual testing

## Setup

### 1. GitHub Token

Create a personal access token at [github.com/settings/tokens](https://github.com/settings/tokens) with these scopes:
- `repo` (for accessing the repository)
- `actions` (for triggering workflows)

### 2. Environment Variables

For local development:
```bash
cp .env.example .env.local
# Edit .env.local with your GitHub token
```

For Vercel deployment, set these environment variables:
- `GITHUB_TOKEN`: Your GitHub personal access token
- `GITHUB_OWNER`: Repository owner (default: worldcoin)  
- `GITHUB_REPO`: Repository name (default: libxmtp)

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Deployment

### Deploy to Vercel

1. Connect your GitHub repository to Vercel
2. Set the environment variables in Vercel dashboard
3. Deploy

Or use Vercel CLI:
```bash
npm install -g vercel
vercel --env GITHUB_TOKEN=your_token_here
```

### GitHub Actions Workflow

The workflow file is located at `.github/workflows/load-test.yml`. It:
- Builds the xdbg binary
- Runs the load test script with specified parameters
- Outputs results as artifacts

## Usage

1. **Fill out the form**:
   - **Inbox ID**: The XMTP inbox ID to add to test groups (required)
   - **Network**: dev, local, staging, or production
   - **Duration**: How long to run the test (seconds)
   - **Groups**: Number of groups to create
   - **Interval**: Seconds between message batches
   - **Messages/Batch**: Messages per group per batch

2. **Start the test**: Click "Start Load Test"

3. **Monitor progress**: The UI will show test status and poll for completion

4. **View results**: Once complete, see metrics and view detailed logs on GitHub

## Test Parameters

- **Inbox ID**: Must be a valid 64-character hex string
- **Duration**: 10-300 seconds (limited by GitHub Actions timeout)
- **Groups**: 1-50 groups
- **Interval**: 0.1-10 seconds between batches
- **Messages/Batch**: 1-10 messages per group per batch

## Example Test Scenarios

### Light Load Test
- Duration: 30 seconds
- Groups: 5
- Interval: 2 seconds
- Messages/Batch: 2
- **Result**: ~150 total messages

### Medium Load Test  
- Duration: 60 seconds
- Groups: 10
- Interval: 1 second
- Messages/Batch: 3
- **Result**: ~1800 total messages

### Heavy Load Test
- Duration: 120 seconds
- Groups: 20
- Interval: 0.5 seconds
- Messages/Batch: 5
- **Result**: ~24,000 total messages

## Troubleshooting

### Test doesn't start
- Check GitHub token has correct permissions
- Verify repository access
- Check Vercel environment variables

### Test fails immediately
- Ensure inbox ID exists on the target network
- Check GitHub Actions logs for detailed error messages

### Can't see results
- Results are stored as GitHub Actions artifacts
- Check the workflow run on GitHub for logs and artifacts

## Development

### File Structure

```
app/
├── page.tsx              # Main page with form
├── layout.tsx            # App layout
├── globals.css           # Global styles
└── api/
    ├── trigger/          # Start new test
    ├── status/[testId]/  # Check test status  
    └── history/          # Get test history

components/
├── TestForm.tsx          # Test configuration form
├── TestStatus.tsx        # Real-time status display
└── TestHistory.tsx       # Previous tests list
```

### API Endpoints

- `POST /api/trigger`: Start a new load test
- `GET /api/status/[testId]`: Get test status and results
- `GET /api/history`: Get recent test history

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Test locally
5. Submit a pull request

## License

This project is part of the XMTP library and follows the same license terms.