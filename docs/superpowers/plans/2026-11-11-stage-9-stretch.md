# Stage 9: Stretch labs (optional)

> Every lab is optional and stands alone. Each one is a guide-and-review step. The owner writes the infra from starters, and Claude writes the starters, the guide and the review. Claude runs no git commands. Steps use checkboxes. Effect H (canvas flight) and the cookbook effects live in `2026-11-11-plan-6-scroll-effects.md`.

**Goal:** Three labs that widen the CV without changing the production design:
- **9a:** EKS for one weekend.
- **9b:** the Gateway API in place of `Ingress`.
- **9c:** CloudFront in front of the site.

**Spec:** `docs/superpowers/specs/2026-11-11-portfolio-design.md`: §2 anti-goals (no surprise bill; don't overclaim); §6 Later (stretch labs); §8 stage 9.

**Depends on:** stages 4–8 done. Production is stable, and the Budget alarm is live and tested.

## Reconsider before executing

- **Order and need.** Pick one lab at a time. Skip any whose lesson he already has. Each lab should take one to three days. Anything longer gets cut (§2).
- **9a cost.**
  - EKS control plane: about $0.10/h.
  - 1–2 small Graviton nodes.
  - No NAT gateway (about $0.045/h plus data): put the nodes in public subnets with tight SGs, or use one NAT for the day only.
  - Target: ≤ $10 of credits, created and destroyed on the same day.
  - Check current EKS, EC2 and EBS prices first, and set a $15 budget action.
- **9a separate state.** `infra/labs/eks/` gets its own state key, so `terraform destroy` there can never touch production.
- **9b memory and versions.** Check that the Traefik version bundled with k3s supports the Gateway API provider, and which CRD version cert-manager supports for Gateway certificates.
- **9c changes real behaviour.**
  - Client IPs: Traefik then sees CloudFront's IP. The guard and lockout need `CloudFront-Viewer-Address`, or `TRUST_PROXY` set to CloudFront's ranges. That is a Claude app-code change. Test it before switching DNS.
  - Cookies: `dk` and `sid` must be forwarded on `/api/*`.
  - Caching: no caching for `/api/*` or `/c/*`.
  - ACME: `/.well-known/acme-challenge/*` must pass through uncached, or HTTP-01 renewal breaks.
  - Certificates: CloudFront needs an ACM certificate in `us-east-1`.
  - Decide whether it covers the site host only (recommended) or the admin too.
- **CV wording:** "EKS lab (built and torn down with Terraform)", not "ran EKS in production".

## 9a: EKS weekend lab

- **Starters:**
  - `infra/labs/eks/main.tf`
    - `# TODO(you): provider + separate backend key`
    - `# TODO(you): VPC with 2 public subnets in 2 AZs`
    - `# TODO(you): EKS cluster + managed node group t4g`
    - `# TODO(you): access entry for your IAM user`
  - `infra/labs/eks/outputs.tf`
- **Steps:**
  - [ ] `terraform apply`.
    - Check: `aws eks update-kubeconfig …`, then `kubectl get nodes` → 1–2 `Ready`, `arm64`.
  - [ ] Install the stage 7 chart with a lab values file (no TLS, a LoadBalancer or port-forward).
    - Check: `kubectl port-forward svc/pf-site 8080:80`, then `curl -s localhost:8080 | grep -c '<div id="root">'` = 1.
  - [ ] Write down what was different from k3s: storage classes, the load balancer, IAM, CNI.
  - [ ] `terraform destroy`.
    - Check: `aws eks list-clusters` → `[]`, and no `available` EBS volumes or LBs are left over.
    - Check: Cost Explorer for the day the next morning.
- **Guide:**
  - **Diagram:** EKS control plane (AWS-managed) vs the k3s single node.
  - **Interview questions:** managed vs self-run control plane; what EKS bills for; how IAM maps to RBAC (access entries); why there is no NAT here.

## 9b: Gateway API

- **Starters:**
  - `deploy/clusters/prod/traefik-helmchartconfig.yaml`
    - `# TODO(you): enable kubernetesGateway provider`
  - `deploy/chart/portfolio/templates/gateway.yaml`
    - `# TODO(you): Gateway listeners 80/443 with cert`
  - `templates/httproute-*.yaml`
    - `# TODO(you): host + /api path matches, the same routing as the Ingress`
- **Steps:**
  - [ ] Convert one host first (admin).
    - Check: `kubectl get gateway,httproute -A` → `Accepted`/`Programmed` True.
    - Check: `curl -sI https://admin.<domain>/` → 200.
  - [ ] Convert the rest. Remove the Ingress objects through git.
    - Check: the Ingress list is empty, and the site, admin and `/api` all respond.
  - [ ] Revert path: one `git revert` restores the Ingress. Prove it once.
- **Guide:**
  - **Diagram:** GatewayClass → Gateway → HTTPRoute vs Ingress.
  - **Interview questions:** why Gateway API exists; role separation; how TLS attaches; Ingress' limits.

## 9c: CloudFront in front of the site

- **Starters:**
  - `infra/cloudfront.tf`
    - `# TODO(you): ACM cert in us-east-1 with DNS validation`
    - `# TODO(you): origin = origin.<domain> (new A record to the EIP)`
    - `# TODO(you): cache behaviours: default static (cache), /api/* and /c/* (no cache, forward cookies + query)`
    - `# TODO(you): /.well-known/acme-challenge/* no cache`
    - `# TODO(you): Route 53 alias for <domain>`
- **Claude's code task:** read the client IP from `CloudFront-Viewer-Address` when the request comes through CloudFront, behind the existing `TRUST_PROXY` config. Write tests for the `clientKey` path: IPv4 and IPv6, a forged header without CloudFront → ignored.
- **Steps:**
  - [ ] Apply with DNS still pointing at the EIP. Test through the `*.cloudfront.net` name.
    - Check: `curl -sI https://<dist>.cloudfront.net/` → 200, and `x-cache: Hit from cloudfront` on the second request.
  - [ ] `curl -sI …/api/site` → `x-cache: Miss` every time, and `Cache-Control: no-store` is kept.
  - [ ] Switch the alias.
    - Check: the guard still counts the real IP. 20 bad codes from his phone lock only his phone, as the `hits.ip` value shows.
  - [ ] Force a cert-manager renewal.
    - Check: `kubectl get certificate` → `Ready True` after the renewal.
- **Guide:**
  - **Diagram:** visitor → edge → origin, with the cache rules per path.
  - **Interview questions:** cache keys and why `/api` isn't cached; how the real client IP survives a CDN; ACM's region rule; what changes for HTTP-01 behind a CDN.

## Each lab ends with

- [ ] **Review gate.** The owner pastes the files and check outputs. Claude reviews them. `docs/learn/09-<lab>.md` is written alongside the guide artifact.
