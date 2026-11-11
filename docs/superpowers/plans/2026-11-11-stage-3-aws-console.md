# Stage 3: AWS by hand (console) Plan

> **For agentic workers:** There is no Claude code in this stage. Claude writes the guide, a click-path checklist and the check commands. The owner does every console step, and Claude reviews. Claude never runs `git commit` or `git push`, and never runs AWS commands that create or delete resources.

**Goal:** The owner builds the network and one spot server in the AWS console, reaches it through SSM Session Manager with port 22 closed, then deletes everything and confirms the bill is back to zero.

**Spec:** `docs/superpowers/specs/2026-11-11-portfolio-design.md` §2 anti-goals (no surprise bill), §3 (budget, AWS only, arm64), §4 (spot, SSM), §5 (SG 80/443 only), §8 stage 3.

**Depends on:** Stage 2 reviewed. A new AWS account with credits. The Mac has `aws` CLI v2 and the Session Manager plugin installed.

## Reconsider before executing

- **Free plan vs paid plan.** New accounts start on the free plan, with $100 credits plus up to $100 for five activities. The free plan ends after 6 months, and the account is suspended unless it is upgraded. Credits still apply on the paid plan.
  - Check at execution: whether the free plan allows spot instances and Elastic IPs. If not, upgrade now; that is the cheapest way to avoid a mid-lab block.
  - Put the 6-month date in the owner's calendar either way.
- **The Budget must ignore credits.** Credits make "actual cost" read $0, so a default budget never fires. Set the budget to show cost *before* credits (in the budget's cost settings, untick "credits"). Check the current wording in the Budgets console.
- **Region:** the owner's choice, recorded here once. Pick the region with the lowest t4g.small spot price that is near the visitors. Check spot prices in the console at execution.
- **AMI:** Amazon Linux 2023 arm64, because the SSM agent is preinstalled and it is AWS's own image. Ubuntu 24.04 arm64 is the alternative (SSM agent via snap). Decide before Task 3; stage 4's user-data depends on it.
- **Public IPv4 costs about $3.65/mo per address,** even unattached. Turn off auto-assigned public IPs on the subnet and use only the Elastic IP.
- **Time on the meter:** this lab should run hours, not days. Teardown is part of the stage, not optional.

## Task 1 (owner): Budget alarm first

- [ ] Billing → Budgets → cost budget, $10/month. Alerts: 50%, 80% and 100% of actual, and 100% of forecasted, emailed to the owner. Credits excluded.
- [ ] Enable "Receive Free Tier usage alerts" in Billing preferences.
- [ ] Check: `aws budgets describe-budgets --account-id <id> --query 'Budgets[].{n:BudgetName,l:BudgetLimit.Amount}'`. Expected: one budget, limit `10.0`.

## Task 2 (owner): network

- [ ] VPC `pf-vpc` 10.0.0.0/16 (no wizard extras: no NAT gateway, no second AZ, no private subnets). A NAT gateway costs about $32/mo and is the classic surprise bill.
- [ ] Public subnet `pf-public-a` 10.0.1.0/24 in one AZ. Auto-assign public IPv4: **off**.
- [ ] Internet gateway `pf-igw`, attached to the VPC.
- [ ] Route table `pf-public-rt`: `0.0.0.0/0 → pf-igw`, associated with the subnet.
- [ ] Security group `pf-web`: inbound 80 and 443 from 0.0.0.0/0 (and ::/0 if IPv6 is added), nothing else. Outbound all.
- [ ] Check: `aws ec2 describe-security-groups --group-names pf-web --query 'SecurityGroups[0].IpPermissions[].FromPort'`. Expected: `[80, 443]`, and no 22.

## Task 3 (owner): IAM role, spot instance, Elastic IP

- [ ] IAM role `pf-node-role` for EC2, with only `AmazonSSMManagedInstanceCore`, plus its instance profile.
- [ ] Launch a t4g.small with the chosen arm64 AMI:
  - purchasing option: spot, one-time
  - in `pf-public-a`, with SG `pf-web`
  - instance profile `pf-node-role`
  - IMDSv2 required
  - no key pair
  - 20 GB gp3 root volume
- [ ] Allocate an Elastic IP and associate it with the instance.
- [ ] Check: `aws ssm describe-instance-information --query 'InstanceInformationList[].PingStatus'`. Expected: `["Online"]` within about 5 minutes.
- [ ] Check: `aws ssm start-session --target <instance-id>`, then `uname -m`. Expected: `aarch64`.
- [ ] Check: a plain `curl -s -o /dev/null -w '%{http_code}' http://169.254.169.254/latest/meta-data/` returns `401`, which proves IMDSv2 is required. The token form (PUT `/latest/api/token`, then a GET with the token header) returns the metadata. The guide explains both lines.
- [ ] Check from the Mac: `nc -vz -w 3 <EIP> 22`. Expected: timeout. `python3 -m http.server 80` on the instance (via SSM, with sudo), then `curl -s -o /dev/null -w '%{http_code}' http://<EIP>/`. Expected: `200`.

## Task 4 (owner): teardown checklist

Delete in this order, and tick each item:

- [ ] Terminate the instance. The spot request closes with it; confirm in Spot Requests.
- [ ] **Release** the Elastic IP. Disassociating is not enough, and the address keeps billing.
- [ ] Delete any leftover EBS volumes and snapshots (EC2 → Volumes: the list is empty).
- [ ] Delete the SG, then the subnet, route table, IGW (detach first) and VPC.
- [ ] Delete the IAM role and instance profile (or keep the role if stage 4 imports it; the default is delete, so Terraform builds it fresh).
- [ ] Check: `aws ec2 describe-addresses` and `aws ec2 describe-volumes`. Expected: both empty. Next day: Cost Explorer shows only cents for this lab.

## Guide and review

- **Guide artifact and `docs/learn/03-aws-console.md`:**
  - what and why: region vs AZ, VPC, CIDR, subnet, route table, IGW, SG (stateful) vs NACL, spot vs on-demand, EIP, IAM role vs user, instance profile, SSM vs SSH, IMDSv2
  - a diagram: Internet → IGW → route table → subnet → SG → instance, with SSM through the agent and no inbound port
  - the steps, check commands with expected output, and what to paste
  - common mistakes: the wizard's NAT gateway, auto-assign public IP, a disassociated but unreleased EIP, forgetting the spot request, an x86 AMI on t4g
  - interview questions: "Why is the SG stateful?", "What does a route table do?", "Why SSM over SSH?", "How do spot interruptions work?", "What does IMDSv2 protect against?"
- **Review gate:** he pastes the outputs of every check above, a screenshot or JSON of the budget, and the teardown check output. Claude checks:
  - no port 22
  - no NAT gateway
  - IMDSv2 is required
  - the budget excludes credits
  - nothing billable is left after teardown

Stage 4 starts only after this review passes.
