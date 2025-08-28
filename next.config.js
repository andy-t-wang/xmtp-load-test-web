/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_OWNER: process.env.GITHUB_OWNER || 'worldcoin',
    GITHUB_REPO: process.env.GITHUB_REPO || 'libxmtp',
  },
}

module.exports = nextConfig