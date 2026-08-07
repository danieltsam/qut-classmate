import * as cdk from "aws-cdk-lib"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as ecs from "aws-cdk-lib/aws-ecs"
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns"
import * as ecr from "aws-cdk-lib/aws-ecr"
import * as elasticache from "aws-cdk-lib/aws-elasticache"
import * as ssm from "aws-cdk-lib/aws-ssm"
import * as logs from "aws-cdk-lib/aws-logs"
import type { Construct } from "constructs"

export class QutTimetablePlannerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // 1. VPC - Learn about networking
    const vpc = new ec2.Vpc(this, "QutTimetableVpc", {
      maxAzs: 2, // Cost optimization: only 2 AZs
      natGateways: 1, // Cost optimization: only 1 NAT gateway
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    })

    // 2. ECR Repository - Learn about container registries
    const repository = new ecr.Repository(this, "QutTimetableRepo", {
      repositoryName: "qut-timetable-planner",
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For learning - allows cleanup
      lifecycleRules: [
        {
          maxImageCount: 5, // Keep only 5 images to save costs
        },
      ],
    })

    // 3. ECS Cluster - Learn about container orchestration
    const cluster = new ecs.Cluster(this, "QutTimetableCluster", {
      vpc,
      clusterName: "qut-timetable-cluster",
      containerInsights: true, // Learn about monitoring
    })

    // 4. Task Definition - Learn about container configuration
    const taskDefinition = new ecs.FargateTaskDefinition(this, "QutTimetableTaskDef", {
      memoryLimitMiB: 512, // Cost optimization: minimal memory
      cpu: 256, // Cost optimization: minimal CPU
    })

    // 5. Container Definition - Learn about container setup
    const container = taskDefinition.addContainer("QutTimetableContainer", {
      image: ecs.ContainerImage.fromEcrRepository(repository, "latest"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "qut-timetable",
        logRetention: logs.RetentionDays.ONE_WEEK, // Cost optimization
      }),
      environment: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      secrets: {
        // Learn about secrets management
        NEXT_PUBLIC_SUPABASE_URL: ecs.Secret.fromSsmParameter(
          ssm.StringParameter.fromStringParameterName(this, "SupabaseUrl", "/qut-timetable/supabase-url"),
        ),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ecs.Secret.fromSsmParameter(
          ssm.StringParameter.fromStringParameterName(this, "SupabaseAnonKey", "/qut-timetable/supabase-anon-key"),
        ),
        SUPABASE_SERVICE_ROLE_KEY: ecs.Secret.fromSsmParameter(
          ssm.StringParameter.fromStringParameterName(
            this,
            "SupabaseServiceKey",
            "/qut-timetable/supabase-service-key",
          ),
        ),
        KV_REST_API_URL: ecs.Secret.fromSsmParameter(
          ssm.StringParameter.fromStringParameterName(this, "RedisUrl", "/qut-timetable/redis-url"),
        ),
        KV_REST_API_TOKEN: ecs.Secret.fromSsmParameter(
          ssm.StringParameter.fromStringParameterName(this, "RedisToken", "/qut-timetable/redis-token"),
        ),
      },
    })

    container.addPortMappings({
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    })

    // 6. Application Load Balancer Service - Learn about load balancing
    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "QutTimetableService", {
      cluster,
      taskDefinition,
      publicLoadBalancer: true,
      desiredCount: 1, // Cost optimization: only 1 instance
      serviceName: "qut-timetable-service",
      assignPublicIp: true,
      platformVersion: ecs.FargatePlatformVersion.LATEST,
    })

    // 7. Auto Scaling - Learn about scaling policies
    const scaling = service.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 3, // Cost optimization: max 3 instances
    })

    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(2),
    })

    scaling.scaleOnMemoryUtilization("MemoryScaling", {
      targetUtilizationPercent: 80,
    })

    // 8. Health Check - Learn about health monitoring
    service.targetGroup.configureHealthCheck({
      path: "/api/health",
      healthyHttpCodes: "200",
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    })

    // 9. Optional: ElastiCache for learning (you can keep using Upstash to save costs)
    const cacheSubnetGroup = new elasticache.CfnSubnetGroup(this, "CacheSubnetGroup", {
      description: "Subnet group for ElastiCache",
      subnetIds: vpc.privateSubnets.map((subnet) => subnet.subnetId),
    })

    const cacheSecurityGroup = new ec2.SecurityGroup(this, "CacheSecurityGroup", {
      vpc,
      description: "Security group for ElastiCache",
      allowAllOutbound: false,
    })

    cacheSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(service.service.connections.securityGroups[0].securityGroupId),
      ec2.Port.tcp(6379),
      "Allow Redis access from ECS",
    )

    // Commented out to save costs - uncomment if you want to learn about ElastiCache
    /*
    const cache = new elasticache.CfnCacheCluster(this, 'RedisCache', {
      cacheNodeType: 'cache.t3.micro', // Smallest instance
      engine: 'redis',
      numCacheNodes: 1,
      vpcSecurityGroupIds: [cacheSecurityGroup.securityGroupId],
      cacheSubnetGroupName: cacheSubnetGroup.ref,
    });
    */

    // 10. Outputs - Learn about stack outputs
    new cdk.CfnOutput(this, "LoadBalancerDNS", {
      value: service.loadBalancer.loadBalancerDnsName,
      description: "DNS name of the load balancer",
    })

    new cdk.CfnOutput(this, "ECRRepositoryURI", {
      value: repository.repositoryUri,
      description: "ECR Repository URI",
    })

    new cdk.CfnOutput(this, "ClusterName", {
      value: cluster.clusterName,
      description: "ECS Cluster Name",
    })
  }
}
