# NPM Publishing Guide for helios9-mcp-server

## 🚀 Auto-Release (Recommended)

The easiest way to publish is using the automated workflow:

### Option 1: Using GitHub Actions UI
1. Go to Actions → "Version Bump"
2. Click "Run workflow"
3. Select version type (patch/minor/major)
4. Click "Run workflow"
5. The auto-release will trigger automatically

### Option 2: Local version bump
```bash
# Bump version locally
npm version patch  # or minor/major

# Push to trigger auto-release
git push origin main --follow-tags
```

The auto-release workflow will:
- ✅ Detect version change in package.json
- ✅ Build and test the package
- ✅ Publish to npm (with correct tag for prereleases)
- ✅ Create GitHub release
- ✅ Tag the commit

### Release Examples

**Patch Release (1.0.2 → 1.0.3):**
1. Actions → Version Bump & Release → Run workflow
2. Select "patch" → Run
3. Auto-release publishes to npm as `latest`

**Beta Release (1.0.2 → 1.1.0-beta.0):**
1. Actions → Version Bump & Release → Run workflow
2. Select "preminor", keep "beta" → Run
3. Auto-release publishes to npm as `beta`

**Promote Beta to Stable (1.1.0-beta.2 → 1.1.0):**
1. Actions → Version Bump & Release → Run workflow
2. Select "minor" → Run
3. Auto-release publishes to npm as `latest`

## 📝 Manual Publishing

## Pre-publish Checklist

- [ ] Ensure you're on the main/master branch
- [ ] Pull latest changes: `git pull origin master`
- [ ] Run tests (if available): `npm test`
- [ ] Build the project: `npm run build`
- [ ] Test the CLI locally: `node dist/index.js --help`
- [ ] Review package.json version number
- [ ] Check npm login status: `npm whoami`

## Publishing Steps

1. **Login to npm (if not already):**
   ```bash
   npm login
   # Username: [your-npm-username]
   # Password: [your-npm-password]
   # Email: [your-npm-email]
   # OTP: [if 2FA enabled]
   ```

2. **Final dry-run check:**
   ```bash
   npm publish --dry-run
   ```

3. **Publish to npm:**
   ```bash
   # For production release
   npm publish

   # For beta release
   npm publish --tag beta
   ```

4. **Create GitHub release:**
   - Go to https://github.com/helios9/mcp-server/releases
   - Click "Create a new release"
   - Tag version: v1.0.0 (match package.json)
   - Release title: "v1.0.0 - Initial Release"
   - Describe changes
   - Publish release

5. **Verify publication:**
   ```bash
   # Check npm registry
   npm view helios9-mcp-server

   # Test installation
   npx -y helios9-mcp-server@latest --help
   ```

## Post-publish

- [ ] Update documentation if needed
- [ ] Announce release (if applicable)
- [ ] Monitor npm downloads: https://www.npmjs.com/package/helios9-mcp-server

## GitHub Actions Setup (One-time)

1. Generate npm token:
   - Go to https://www.npmjs.com/settings/[username]/tokens
   - Click "Generate New Token" → "Classic Token"
   - Select type: **Automation** (IMPORTANT - not Publish!)
   - Token will start with `npm_`
   - Copy the token immediately (you won't see it again)

2. Add to GitHub secrets:
   - Go to repo Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN` (must be exactly this)
   - Value: Paste your npm token
   - Click "Add secret"

3. Test the workflow:
   - Go to Actions tab
   - Select "Publish to npm (Simple)"
   - Click "Run workflow"
   - Monitor the logs

4. Future releases will auto-publish when creating GitHub releases

## Troubleshooting

- **401 Unauthorized**: Check npm login or token
- **403 Forbidden**: Check package name availability or permissions
- **Package exists**: Bump version in package.json
- **Missing files**: Check .npmignore configuration

## GitHub Workflows Overview

### Primary Workflows (Use These!)

#### 1. **Version Bump & Release** (`version-bump.yml`)
- **Purpose**: Bump version and trigger automatic release
- **When to use**: For all regular releases
- **Options**:
  - Version types: patch, minor, major, prepatch, preminor, premajor, prerelease
  - Prerelease identifier: beta (default), alpha, rc, etc.
- **What it does**:
  1. Bumps version in package.json
  2. Commits and pushes change
  3. Triggers auto-release workflow

#### 2. **Auto Release** (`auto-release.yml`)
- **Purpose**: Automatically publish when version changes
- **Triggers**: On push to main when package.json changes
- **What it does**:
  1. Detects version change
  2. Builds and tests
  3. Publishes to npm (with correct tag for prereleases)
  4. Creates GitHub release
  5. Tags the commit

### Backup Workflow

#### 3. **Manual Release** (`manual-release.yml`)
- **Purpose**: Manual control over publishing
- **When to use**: Special cases, re-publishing, custom tags
- **Options**:
  - NPM tag: latest, beta, alpha, next, etc.
  - Skip GitHub release: For re-publishing only
- **Use cases**:
  - Publishing with custom npm tags
  - Re-publishing failed releases
  - Testing publication process