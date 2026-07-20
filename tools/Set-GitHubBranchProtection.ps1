param(
  [string]$Repository,
  [string[]]$Branches = @("main", "master"),
  [string[]]$RequiredStatusChecks = @("CI / verify", "CI / PostgreSQL integration"),
  [int]$RequiredApprovals = 1,
  [switch]$RequireCodeOwnerReviews
)

$ErrorActionPreference = "Stop"

function Resolve-GitHubRepository {
  if (-not [string]::IsNullOrWhiteSpace($Repository)) {
    return $Repository
  }

  $remoteUrl = git remote get-url origin 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($remoteUrl)) {
    throw "Cannot resolve GitHub repository. Add origin remote or pass -Repository owner/name."
  }

  if ($remoteUrl -match "github\.com[:/](?<owner>[^/]+)/(?<repo>.+?)(?:\.git)?$") {
    return "$($Matches.owner)/$($Matches.repo)"
  }

  throw "Origin remote is not a GitHub repository URL: $remoteUrl"
}

function Invoke-Gh {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & gh @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "gh $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI is not installed. Install gh and run 'gh auth login' before applying branch protection."
}

if ($RequiredApprovals -lt 1 -or $RequiredApprovals -gt 6) {
  throw "RequiredApprovals must be between 1 and 6."
}

$resolvedRepository = Resolve-GitHubRepository
$payload = @{
  required_status_checks = @{
    strict = $true
    contexts = @($RequiredStatusChecks)
  }
  enforce_admins = $true
  required_pull_request_reviews = @{
    dismiss_stale_reviews = $true
    require_code_owner_reviews = [bool]$RequireCodeOwnerReviews
    required_approving_review_count = $RequiredApprovals
    require_last_push_approval = $true
  }
  restrictions = $null
  required_linear_history = $false
  allow_force_pushes = $false
  allow_deletions = $false
  block_creations = $false
  required_conversation_resolution = $true
  lock_branch = $false
  allow_fork_syncing = $true
}

$payloadPath = Join-Path ([System.IO.Path]::GetTempPath()) "patrol360-branch-protection.json"
$payload | ConvertTo-Json -Depth 10 | Set-Content -Path $payloadPath -Encoding utf8NoBOM

try {
  foreach ($branch in $Branches) {
    if ([string]::IsNullOrWhiteSpace($branch)) {
      continue
    }

    Write-Host "Applying branch protection to $resolvedRepository/$branch with required checks '$($RequiredStatusChecks -join "', '")'."
    # Uses `gh api` so the applied payload stays close to the GitHub branch protection REST contract.
    Invoke-Gh @(
      "api",
      "--method",
      "PUT",
      "/repos/$resolvedRepository/branches/$branch/protection",
      "--input",
      $payloadPath
    )
  }
}
finally {
  Remove-Item -LiteralPath $payloadPath -ErrorAction SilentlyContinue
}
