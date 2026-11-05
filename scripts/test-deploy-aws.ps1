#Requires -Version 7.2
# Exercise orchestration with mocked AWS commands. No network or cloud resources.
$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('repanatomy-deploy-test-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path (Join-Path $fixture 'deploy')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../deploy/deploy-aws.ps1') -Destination (Join-Path $fixture 'deploy/deploy-aws.ps1')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../deploy/aws-express.yaml') -Destination (Join-Path $fixture 'deploy/aws-express.yaml')
$mockImage = '123456789012.dkr.ecr.ap-south-1.amazonaws.com/repanatomy@sha256:' + ('a' * 64)
$mockHostname = 'demo-123.ecs.ap-south-1.on.aws'

function global:aws {
    $arguments = @($args)
    $global:LASTEXITCODE = 0
    $state = $global:RepAnatomyDeployMock
    $state.Calls.Add(($arguments -join ' '))
    switch ($arguments[0] + ' ' + $arguments[1]) {
        'sts get-caller-identity' {
            $account = if ($state.Scenario -eq 'wrong-account') { '999999999999' } else { '123456789012' }
            return (@{Account=$account; Arn="arn:aws:sts::${account}:assumed-role/Demo/user"} | ConvertTo-Json)
        }
        'cloudformation describe-stacks' {
            if ($state.Scenario -eq 'aws-error') { $global:LASTEXITCODE=1; return 'AccessDenied: no permission' }
            if ($state.Scenario -eq 'new' -and $state.Deploys -eq 0) { $global:LASTEXITCODE=1; return 'Stack does not exist' }
            return (@{Stacks=@(@{StackStatus='UPDATE_COMPLETE'; Parameters=@(@{ParameterKey='PublicHostname';ParameterValue=$state.Hostname}); Outputs=@(
                @{OutputKey='Endpoint';OutputValue=$state.Endpoint},
                @{OutputKey='ServiceArn';OutputValue='arn:aws:ecs:ap-south-1:123456789012:service/test/demo'},
                @{OutputKey='ClusterArn';OutputValue='arn:aws:ecs:ap-south-1:123456789012:cluster/test'},
                @{OutputKey='LogGroup';OutputValue='/test/repanatomy'}
            )})} | ConvertTo-Json -Depth 8)
        }
        'cloudformation validate-template' { return '{}' }
        'cloudformation deploy' {
            $state.Deploys++
            $state.Hostname = ($arguments | Where-Object { $_ -like 'PublicHostname=*' }).Substring('PublicHostname='.Length)
            return '{}'
        }
        default { throw "Unexpected AWS call in deployment test: $($arguments[0..1] -join ' ')" }
    }
}
try {
    foreach ($scenario in @('new', 'update', 'wrong-account', 'aws-error', 'bad-image', 'unexpected-endpoint')) {
        $global:RepAnatomyDeployMock = @{
            Scenario=$scenario; Calls=[Collections.Generic.List[string]]::new(); Deploys=0
            Hostname=$(if ($scenario -eq 'new') {''} else {$mockHostname})
            Endpoint=$(if ($scenario -eq 'unexpected-endpoint') {'https://untrusted.invalid'} else {$mockHostname})
        }
        $image = if ($scenario -eq 'bad-image') {$mockImage.Replace('ap-south-1','us-west-2')} else {$mockImage}
        $failure = $null
        try {
            & (Join-Path $fixture 'deploy/deploy-aws.ps1') -Region ap-south-1 -ExpectedAccountId 123456789012 -ImageUri $image
        } catch { $failure = $_ }
        $state = $global:RepAnatomyDeployMock
        if ($scenario -in @('new','update')) {
            if ($failure) { throw "Scenario $scenario failed: $failure" }
            $expected = if ($scenario -eq 'new') {2} else {1}
            if ($state.Deploys -ne $expected -or $state.Hostname -ne $mockHostname) { throw "Incorrect deploy/hostname behavior for $scenario" }
            $record = Get-Content -Raw -LiteralPath (Join-Path $fixture 'outputs/deployment/aws-stack.json') | ConvertFrom-Json
            if ($record.endpoint -ne "https://$mockHostname" -or $record.image_uri -ne $image) { throw 'Invalid deployment record.' }
        } else {
            if (-not $failure) { throw "Scenario $scenario should have failed." }
            if ($scenario -ne 'unexpected-endpoint' -and $state.Deploys -ne 0) { throw "Scenario $scenario changed resources before rejecting input." }
        }
        Write-Host "PASS: $scenario"
    }
    Write-Host 'Six mocked deployment scenarios passed. No AWS calls were made.'
} finally {
    Remove-Item Function:\aws
    Remove-Variable -Name RepAnatomyDeployMock -Scope Global
    $resolvedFixture = [IO.Path]::GetFullPath($fixture)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (-not $resolvedFixture.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
        -not ([IO.Path]::GetFileName($resolvedFixture)).StartsWith('repanatomy-deploy-test-')) { throw 'Unsafe test cleanup path.' }
    Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
}
