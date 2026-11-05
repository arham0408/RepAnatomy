# RepAnatomy — custom-domain ECS Fargate deployment

For managed HTTPS without buying/configuring a domain, use the [ECS Express Mode setup](README.md). This alternative keeps explicit control over the ALB and requires your own domain and ACM certificate.

**Status: local preparation only.** Docker and AWS CLIs are not available in the authoring environment. No ECR image was pushed, no stack was created, and no AWS workload, availability, latency or cost is claimed. The local production ASGI smoke check is separate from a container/cloud test.

The competition requires a meaningful AWS component. This configuration would run the actual OpenCV frame-analysis API on one ECS Fargate task. ECR stores the image, an Application Load Balancer terminates HTTPS with ACM, and CloudWatch stores operational logs. COOL/Graviton is not configured.

## Local container check

Install Docker Engine/Desktop and test from the repository root:

```powershell
docker build --platform linux/amd64 -t repanatomy:0.8.0 .
docker run --rm -p 8000:8000 repanatomy:0.8.0
```

Open `http://localhost:8000/?gym=1`. Check `/api/fitness/capabilities` reports OpenCV 5, start the synthetic demo, review/export a draft and test `/mcp`. The build downloads and verifies the versioned browser pose model. It does not need a GPU. The container runs one worker under uid 10001.

## Required cloud inputs

- AWS account/region with permission to create ECS, EC2 networking, ALB, IAM roles and CloudWatch resources.
- An ECR repository and an authenticated AWS CLI/Docker client.
- A domain you control and an ACM certificate already validated in the same region.
- An explicit budget decision for ALB, Fargate, ECR, public IPv4, logs and data transfer. No cost estimate was measured locally.

## Publish image and create stack

The commands below are instructions for a separately authorized deployment. Replace the example account, region, repository, certificate and hostname with actual values. They were not executed by this task.

```powershell
$region='ap-south-1'
$account='123456789012'
$repository='repanatomy'
$registry="$account.dkr.ecr.$region.amazonaws.com"
aws ecr create-repository --repository-name $repository --image-tag-mutability IMMUTABLE --region $region
aws ecr get-login-password --region $region | docker login --username AWS --password-stdin $registry
docker tag repanatomy:0.8.0 "$registry/${repository}:0.8.0"
docker push "$registry/${repository}:0.8.0"
$digest=aws ecr describe-images --repository-name $repository --image-ids imageTag=0.8.0 --query 'imageDetails[0].imageDigest' --output text --region $region
$imageUri="$registry/${repository}@$digest"
aws cloudformation validate-template --template-body file://deploy/aws-fargate.yaml --region $region
aws cloudformation deploy --stack-name repanatomy-demo --template-file deploy/aws-fargate.yaml --capabilities CAPABILITY_IAM --region $region --parameter-overrides "ImageUri=$imageUri" 'CertificateArn=arn:aws:acm:ap-south-1:123456789012:certificate/REPLACE' 'PublicHostname=gym.example.com'
aws cloudformation describe-stacks --stack-name repanatomy-demo --query 'Stacks[0].Outputs' --region $region
```

Point the configured hostname at the ALB DNS output using your DNS provider. The TLS certificate must cover that hostname. Only HTTPS 443 is exposed by the ALB; the task accepts traffic from its security group only. Tasks have public IPs for outbound image/log access but no public container ingress. Add exact origins/hosts through the template, not wildcards.

The task role has no application AWS permissions. The execution role uses the standard image/log policy. HTTP access logs are disabled because frame API paths contain session capabilities. Operational logs should never include source frames, private report text or credentials. CloudWatch retention is seven days.

## Verify after deployment

1. Wait for the ECS service/target group to become healthy. Confirm the task uses the intended immutable image digest and has one running task/worker.
2. Visit `https://YOUR_HOST/?gym=1` and check `/api/fitness/capabilities`. Export a synthetic trace and verify a consented real-camera/video example. Record source labels accurately.
3. Test low light/occlusion and recovery, a pain stop, review/export and session deletion. Verify unrelated hosts/origins fail while the minimal `/healthz` probe remains available to the ALB.
4. Record actual region, task configuration, OpenCV version, timestamps, processing latency, trace and endpoint evidence under `docs/opencv/evidence`. Add actual costs only from measured billing/usage data.
5. Check the endpoint from a separate browser/account and record judge access instructions.

One-task deployment is intentional: sessions are process-local and disappear on replacement. No autoscaling or durable shared state is implemented. This is a capacity-bounded demo, not a production health service. Before unrestricted public use, add user identity, per-user isolation/quotas, WAF controls and an appropriate privacy/security review.

## Cleanup after a separately authorized demonstration

Use the AWS console or CLI to delete the demo stack when no longer needed. Check ECR images, DNS records, certificate usage and logs separately; an existing ECR repository/certificate/domain is not created by this template. Confirm billable resources have actually stopped. Never execute cloud cleanup without checking which account, region and stack are selected.
