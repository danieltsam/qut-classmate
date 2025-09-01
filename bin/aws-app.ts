#!/usr/bin/env node
import "source-map-support/register"
import * as cdk from "aws-cdk-lib"
import { QutTimetablePlannerStack } from "../lib/aws-stack"

const app = new cdk.App()

new QutTimetablePlannerStack(app, "QutTimetablePlannerStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
  description: "QUT Timetable Planner - Learning AWS Deployment",
})
