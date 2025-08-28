/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_OWNER: process.env.GITHUB_OWNER || 'your-github-username',
    GITHUB_REPO: process.env.GITHUB_REPO || 'xmtp-load-test-web',
    NEXT_PUBLIC_GITHUB_OWNER: process.env.NEXT_PUBLIC_GITHUB_OWNER || process.env.GITHUB_OWNER || 'your-github-username',
    NEXT_PUBLIC_GITHUB_REPO: process.env.NEXT_PUBLIC_GITHUB_REPO || process.env.GITHUB_REPO || 'xmtp-load-test-web',
  },
}

module.exports = nextConfig