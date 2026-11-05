#Requires -Version 7.2
<#
Build/publish the app and deploy ECS Express Mode with managed HTTPS.
Run from PowerShell after signing in to AWS. This creates billable resources.
No credentials or application secrets are written to the evidence file.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-z]{2}-[a-z]+-\d$')][string]$Region,
    [Parameter(Mandatory)][ValidatePattern('^\d{12}$')][string]$ExpectedAccountId,
    [ValidatePattern('^[a-zA-Z][a-zA-Z0-9-]{0,80}$')][string]$StackName = 'repanatomy-demo',
    [ValidatePattern('^[a-z][a-z0-9-]{1,80}$')][string]$Repository = 'repanatomy',
    [string]$Profile,
    # Supply an already-built ECR digest to deploy from a machine without Docker.
    [string]$ImageUri
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = Split-Path -Parent $PSScriptRoot
$awsCommon = @('--region', $Region, '--no-cli-pager')
if ($Profile) { $awsCommon += @('--profile', $Profile) }
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { throw 'Install AWS CLI v2 and sign in first. See deploy/README.md.' }

function Invoke-Aws([string[]]$Arguments) {
    $result = & aws @Arguments @awsCommon 2>&1
    if ($LASTEXITCODE -ne 0) { throw "AWS command failed: $($Arguments[0..1] -join ' ')`n$($result -join "`n")" }
    return ($result -join "`n")
}
function Get-StackOutputs {
    $stack = (Invoke-Aws @('cloudformation', 'describe-stacks', '--stack-name', $StackName, '--output', 'json') | ConvertFrom-Json).Stacks[0]
    $values = @{}
    foreach ($entry in $stack.Outputs) { $values[$entry.OutputKey] = $entry.OutputValue }
    return $values
}
function Deploy-Service([string]$PublicHostname) {
    Write-Host 'Deploying ECS Express Mode. Provisioning can take several minutes...'
    $null = Invoke-Aws @('cloudformation', 'deploy', '--stack-name', $StackName,
        '--template-file', (Join-Path $PSScriptRoot 'aws-express.yaml'), '--capabilities', 'CAPABILITY_IAM',
        '--no-fail-on-empty-changeset', '--parameter-overrides', "ImageUri=$ImageUri", "PublicHostname=$PublicHostname",
        '--tags', 'Project=RepAnatomy')
}

$identity = Invoke-Aws @('sts', 'get-caller-identity', '--output', 'json') | ConvertFrom-Json
if ($identity.Account -ne $ExpectedAccountId) { throw "Signed in to account $($identity.Account), expected $ExpectedAccountId. No changes made." }
if ($identity.Arn -match ':root$') { throw 'Use an IAM Identity Center or IAM role session rather than root credentials.' }
Write-Host "Deploy target: AWS account $ExpectedAccountId, region $Region, stack $StackName"

# Preserve a configured hostname on updates. Only a missing stack is treated as new.
$hostname = ''
$existingRaw = & aws cloudformation describe-stacks --stack-name $StackName --output json @awsCommon 2>&1
if ($LASTEXITCODE -eq 0) {
    $existing = ($existingRaw -join "`n" | ConvertFrom-Json).Stacks[0]
    if ($existing.StackStatus -notin @('CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE')) {
        throw "Stack status is $($existing.StackStatus). Inspect its events before retrying."
    }
    $oldHost = @($existing.Parameters | Where-Object ParameterKey -eq 'PublicHostname')
    if ($oldHost.Count) { $hostname = $oldHost[0].ParameterValue }
} elseif (($existingRaw -join "`n") -notmatch 'does not exist') {
    throw ($existingRaw -join "`n")
}

Push-Location $projectRoot
try {
    $registry = "$ExpectedAccountId.dkr.ecr.$Region.amazonaws.com"
    if ($ImageUri) {
        if ($ImageUri -notmatch "^$([regex]::Escape($registry))/[a-z0-9/_-]+@sha256:[a-f0-9]{64}$") {
            throw 'ImageUri must be a private ECR digest in the selected account and region.'
        }
    } else {
        if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install/start Docker Desktop, or pass -ImageUri with an existing linux/amd64 ECR digest.' }
        & docker info --format '{{.OSType}}'
        if ($LASTEXITCODE -ne 0) { throw 'Docker Engine is unavailable. Start Docker Desktop using Linux containers.' }
        $repoRaw = & aws ecr describe-repositories --repository-names $Repository --output json @awsCommon 2>&1
        if ($LASTEXITCODE -ne 0) {
            if (($repoRaw -join "`n") -notmatch 'RepositoryNotFoundException') { throw ($repoRaw -join "`n") }
            $null = Invoke-Aws @('ecr', 'create-repository', '--repository-name', $Repository,
                '--image-tag-mutability', 'IMMUTABLE', '--image-scanning-configuration', 'scanOnPush=true')
        }
        $tag = 'demo-' + [DateTime]::UtcNow.ToString('yyyyMMddHHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
        $tagged = "$registry/${Repository}:$tag"
        & docker build --platform linux/amd64 --tag $tagged .
        if ($LASTEXITCODE -ne 0) { throw 'Container build failed; deployment was not started.' }
        # Pipe the short-lived ECR token directly to Docker; never print or save it.
        $password = Invoke-Aws @('ecr', 'get-login-password')
        try { $password | & docker login --username AWS --password-stdin $registry }
        finally { $password = $null }
        if ($LASTEXITCODE -ne 0) { throw 'ECR login failed.' }
        & docker push $tagged
        if ($LASTEXITCODE -ne 0) { throw 'ECR push failed.' }
        $digest = Invoke-Aws @('ecr', 'describe-images', '--repository-name', $Repository,
            '--image-ids', "imageTag=$tag", '--query', 'imageDetails[0].imageDigest', '--output', 'text')
        $ImageUri = "$registry/$Repository@$($digest.Trim())"
    }
    $null = Invoke-Aws @('cloudformation', 'validate-template', '--template-body', 'file://deploy/aws-express.yaml')
    Deploy-Service $hostname
    $outputs = Get-StackOutputs
    $endpoint = [string]$outputs.Endpoint
    if (-not $endpoint.StartsWith('https://')) { $endpoint = 'https://' + $endpoint }
    $address = [Uri]$endpoint
    if ($address.Scheme -ne 'https' -or -not $address.Host.EndsWith(".ecs.$Region.on.aws")) {
        throw "Unexpected ECS endpoint: $endpoint. Inspect stack outputs before configuring trusted hosts."
    }
    if ($hostname -ne $address.Host) {
        # Initial health probes can pass, but application requests stay blocked until
        # the exact generated hostname is known. No wildcard trust during bootstrap.
        Deploy-Service $address.Host
        $outputs = Get-StackOutputs
    }
    $evidenceDir = Join-Path $projectRoot 'outputs/deployment'
    $null = New-Item -ItemType Directory -Force -Path $evidenceDir
    $record = [ordered]@{
        recorded_at_utc = [DateTime]::UtcNow.ToString('o')
        account_id = $ExpectedAccountId; region = $Region; stack = $StackName
        image_uri = $ImageUri; endpoint = $address.GetLeftPart([UriPartial]::Authority)
        service_arn = $outputs.ServiceArn; cluster_arn = $outputs.ClusterArn
        log_group = $outputs.LogGroup; workload_check = 'pending: run smoke-deployment.py'
    }
    $record | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 (Join-Path $evidenceDir 'aws-stack.json')
    Write-Host "Deployment complete. Judge URL: $($record.endpoint)/?gym=1"
    Write-Host "Run: .venv\Scripts\python.exe scripts/smoke-deployment.py --url $($record.endpoint) --output outputs/deployment/workload.json"
    Write-Host 'Stack evidence: outputs/deployment/aws-stack.json. Record a real camera/video run and the submission video separately.'
} finally { Pop-Location }
